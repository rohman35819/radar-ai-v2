"""Split, parameter selection and walk-forward out-of-sample validation.

Every candidate generates its OWN signal stream from its own parameters.
Signals for a segment are computed over full history and then sliced: signal
at bar i reads only closes up to i-1, so prior bars are legitimate warm-up
and no future bar can leak into a segment. The out-of-sample segment is
evaluated once with the selected candidate. No result is called profitable.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Mapping, Sequence

from backtest_engine import BacktestResult, run_backtest
from quant_data import DataQualityError, Dataset, slice_dataset
from strategy import Signal, StrategyConfig, generate_signals

PARAMETER_GRID: tuple[tuple[int, int], ...] = ((3, 8), (5, 20), (10, 30))
GRIDS: dict[str, tuple[dict[str, Any], ...]] = {
    'sma_crossover': ({'fast': 3, 'slow': 8}, {'fast': 5, 'slow': 20}, {'fast': 10, 'slow': 30}),
    'trend_momentum': (
        {'trend_period': 20, 'momentum_period': 5},
        {'trend_period': 50, 'momentum_period': 10},
        {'trend_period': 100, 'momentum_period': 20},
    ),
    'mean_reversion': (
        {'zscore_period': 10, 'entry_z': -1.0, 'exit_z': 0.0},
        {'zscore_period': 20, 'entry_z': -1.5, 'exit_z': 0.0},
        {'zscore_period': 30, 'entry_z': -2.0, 'exit_z': 0.5},
    ),
    'regime_aware': (
        {'trend_period': 20, 'rsi_period': 7, 'rsi_entry': 35.0, 'rsi_exit': 55.0},
        {'trend_period': 50, 'rsi_period': 14, 'rsi_entry': 30.0, 'rsi_exit': 60.0},
        {'trend_period': 100, 'rsi_period': 14, 'rsi_entry': 40.0, 'rsi_exit': 65.0},
    ),
}
MIN_TRADES = 2
MAX_DRAWDOWN_PCT = 25.0
WALK_TRAIN_BARS = 120
WALK_TEST_BARS = 40


@dataclass(frozen=True)
class Selection:
    fast: int
    slow: int
    params: Mapping[str, Any]
    score: float | None
    accepted: bool
    reasons: tuple[str, ...]
    result: BacktestResult


def normalize_params(params: Any) -> dict[str, Any]:
    """Accept legacy (fast, slow) tuples and new named parameter dicts."""
    if isinstance(params, dict):
        return dict(params)
    if isinstance(params, (tuple, list)) and len(params) == 2:
        return {'fast': int(params[0]), 'slow': int(params[1])}
    raise ValueError("Parameter kandidat harus dict atau tuple (fast, slow)")


def candidate_config(base: StrategyConfig, params: Any, slow: int | None = None) -> StrategyConfig:
    if slow is not None:
        params = {'fast': int(params), 'slow': int(slow)}
    values = dict(base.to_dict())
    values.update(normalize_params(params))
    config = StrategyConfig(**values)
    config.validate()
    return config


def _cache_key(params: Mapping[str, Any]) -> tuple[tuple[str, Any], ...]:
    return tuple(sorted((str(key), value) for key, value in params.items()))


def signals_for_candidate(
    dataset: Dataset,
    base: StrategyConfig,
    params: Any,
    slow: int | None = None,
) -> list[Signal]:
    config = candidate_config(base, params, slow)
    return generate_signals(dataset.candles, config)


def _segment_signals(signals: Sequence[Signal], start: int, end: int) -> list[Signal]:
    if not 0 <= start < end <= len(signals):
        raise DataQualityError("Rentang signal tidak valid")
    return list(signals[start:end])


def split_three(dataset: Dataset, train_fraction: float = 0.5, validation_fraction: float = 0.25) -> tuple[Dataset, Dataset, Dataset]:
    if not (0 < train_fraction < 1 and 0 < validation_fraction < 1):
        raise ValueError("Fraksi split tidak valid")
    if train_fraction + validation_fraction >= 1:
        raise ValueError("train + validation harus < 1")
    total = len(dataset.candles)
    train_end = int(total * train_fraction)
    validation_end = int(total * (train_fraction + validation_fraction))
    if train_end < 40 or validation_end - train_end < 20 or total - validation_end < 20:
        raise DataQualityError("Dataset terlalu pendek untuk split train/validation/OOS")
    return (
        slice_dataset(dataset, 0, train_end),
        slice_dataset(dataset, train_end, validation_end),
        slice_dataset(dataset, validation_end, total),
    )


def walk_forward(dataset: Dataset, train_bars: int = WALK_TRAIN_BARS, test_bars: int = WALK_TEST_BARS) -> list[tuple[Dataset, Dataset]]:
    if train_bars < 40 or test_bars < 20:
        raise ValueError("train_bars >= 40 dan test_bars >= 20 diperlukan")
    folds: list[tuple[Dataset, Dataset]] = []
    start = 0
    while start + train_bars + test_bars <= len(dataset.candles):
        folds.append((
            slice_dataset(dataset, start, start + train_bars),
            slice_dataset(dataset, start + train_bars, start + train_bars + test_bars),
        ))
        start += test_bars
    if not folds:
        raise DataQualityError("Tidak ada fold walk-forward yang valid")
    return folds


def _signal_cache(dataset: Dataset, base: StrategyConfig) -> Callable[[Mapping[str, Any]], list[Signal]]:
    cache: dict[tuple[tuple[str, Any], ...], list[Signal]] = {}

    def get(params: Mapping[str, Any]) -> list[Signal]:
        key = _cache_key(params)
        if key not in cache:
            cache[key] = signals_for_candidate(dataset, base, params)
        return cache[key]

    return get


def select_parameters(
    dataset: Dataset,
    start: int,
    end: int,
    base: StrategyConfig,
    grid: Sequence[Any] = PARAMETER_GRID,
    get_signals: Callable[[Mapping[str, Any]], list[Signal]] | None = None,
) -> Selection:
    """Pick one parameter set using ONLY the [start, end) segment."""
    if not grid:
        raise ValueError("Grid parameter tidak boleh kosong")
    segment = slice_dataset(dataset, start, end)
    resolve = get_signals or _signal_cache(dataset, base)
    candidates: list[Selection] = []
    for raw in grid:
        params = normalize_params(raw)
        config = candidate_config(base, params)
        needed = max(config.fast, config.slow, config.trend_period, config.zscore_period,
                     config.rsi_period + 1, config.momentum_period + 1)
        if needed >= len(segment.candles):
            continue
        candidate_signals = _segment_signals(resolve(params), start, end)
        result = run_backtest(segment, config, candidate_signals)
        reasons: list[str] = []
        if result.metrics['total_trades'] < MIN_TRADES:
            reasons.append('too_few_trades')
        if result.metrics['max_drawdown_pct'] > MAX_DRAWDOWN_PCT:
            reasons.append('drawdown_limit')
        score = result.metrics['profit_factor']
        if score is None:
            reasons.append('undefined_profit_factor')
            score = -1.0
        candidates.append(Selection(
            fast=int(params.get('fast', 0)), slow=int(params.get('slow', 0)),
            params=params, score=score, accepted=not reasons,
            reasons=tuple(reasons), result=result,
        ))
    if not candidates:
        raise DataQualityError("Tidak ada kandidat parameter yang dapat dievaluasi")
    eligible = [item for item in candidates if item.accepted]
    pool = eligible or candidates
    chosen = max(pool, key=lambda item: (item.score if item.score is not None else -1.0,
                                         _cache_key(item.params)))
    return chosen


def _evaluate_candidate(
    dataset: Dataset,
    base: StrategyConfig,
    params: Mapping[str, Any],
    start: int,
    end: int,
    get_signals: Callable[[Mapping[str, Any]], list[Signal]],
) -> BacktestResult:
    segment = slice_dataset(dataset, start, end)
    return run_backtest(segment, candidate_config(base, params),
                        _segment_signals(get_signals(params), start, end))


def run_validation(
    dataset: Dataset,
    base_config: StrategyConfig,
    grid: Sequence[Any] | None = None,
) -> dict[str, Any]:
    base_config.validate()
    selected_grid = grid if grid is not None else GRIDS.get(base_config.strategy_id, PARAMETER_GRID)
    train, validation, oos = split_three(dataset)
    total = len(dataset.candles)
    train_end = len(train.candles)
    validation_end = train_end + len(validation.candles)
    get_signals = _signal_cache(dataset, base_config)

    selected = select_parameters(dataset, train_end, validation_end, base_config, selected_grid, get_signals)
    oos_result = _evaluate_candidate(dataset, base_config, selected.params, validation_end, total, get_signals)

    folds: list[dict[str, Any]] = []
    fold_start = 0
    for fold_index in range(1, 1000):
        train_start, train_stop = fold_start, fold_start + WALK_TRAIN_BARS
        test_start, test_stop = train_stop, train_stop + WALK_TEST_BARS
        if test_stop > total:
            break
        fold_selected = select_parameters(dataset, train_start, train_stop, base_config, selected_grid, get_signals)
        fold_result = _evaluate_candidate(dataset, base_config, fold_selected.params,
                                          test_start, test_stop, get_signals)
        folds.append({
            'fold': fold_index,
            'train_start': dataset.candles[train_start].timestamp,
            'train_end': dataset.candles[train_stop - 1].timestamp,
            'test_start': dataset.candles[test_start].timestamp,
            'test_end': dataset.candles[test_stop - 1].timestamp,
            'train_start_index': train_start,
            'train_end_index': train_stop,
            'test_start_index': test_start,
            'test_end_index': test_stop,
            'selected_fast': fold_selected.fast,
            'selected_slow': fold_selected.slow,
            'selected_params': dict(fold_selected.params),
            'selection_accepted': fold_selected.accepted,
            'test_net_return_pct': fold_result.metrics['net_return_pct'],
            'test_max_drawdown_pct': fold_result.metrics['max_drawdown_pct'],
            'test_total_trades': fold_result.metrics['total_trades'],
        })
        fold_start += WALK_TEST_BARS
    if not folds:
        raise DataQualityError('Tidak ada fold walk-forward yang valid')

    fold_returns = [fold['test_net_return_pct'] for fold in folds]
    acceptance_reasons: list[str] = []
    if oos_result.metrics['total_trades'] < MIN_TRADES:
        acceptance_reasons.append('oos_too_few_trades')
    if oos_result.metrics['max_drawdown_pct'] > MAX_DRAWDOWN_PCT:
        acceptance_reasons.append('oos_drawdown_limit')
    if not selected.accepted:
        acceptance_reasons.append('validation_selection_rejected')
    if sum(1 for value in fold_returns if value > 0) * 2 <= len(fold_returns):
        acceptance_reasons.append('walk_forward_not_majority_positive')

    return {
        'train': {'start': train.start, 'end': train.end, 'bars': len(train.candles)},
        'validation': {'start': validation.start, 'end': validation.end, 'bars': len(validation.candles)},
        'out_of_sample': {'start': oos.start, 'end': oos.end, 'bars': len(oos.candles)},
        'selected_parameters': {
            'fast': selected.fast, 'slow': selected.slow,
            'params': dict(selected.params),
            'validation_score': selected.score,
            'selection_accepted': selected.accepted,
            'selection_reasons': list(selected.reasons),
            'signal_source': 'candidate_specific_stream_sliced_from_full_history',
        },
        'out_of_sample_config': candidate_config(base_config, selected.params).to_dict(),
        'out_of_sample_metrics': oos_result.metrics,
        'out_of_sample_trades': [trade.to_dict() for trade in oos_result.trades[:50]],
        'walk_forward_folds': folds,
        'walk_forward_positive_folds': sum(1 for value in fold_returns if value > 0),
        'walk_forward_total_folds': len(fold_returns),
        'accepted_for_paper_candidate': not acceptance_reasons,
        'acceptance_reasons': acceptance_reasons,
        'criteria': {
            'min_trades': MIN_TRADES,
            'max_drawdown_pct': MAX_DRAWDOWN_PCT,
            'walk_forward_positive_folds_majority': True,
            'parameter_grid': [dict(normalize_params(item)) for item in selected_grid],
            'warm_up': 'full-history prior closes; no future candle is read',
        },
        'disclaimer': 'Backtest dan paper simulation bukan bukti profit masa depan; tidak ada order dikirim.',
    }
