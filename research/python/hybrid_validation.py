"""Train/validation/OOS and walk-forward validation for hybrid M5 strategies.

No look-ahead: signals are generated once from full history using only prior
bars, then sliced into contiguous, disjoint segments. Parameters are selected
on validation only; OOS is evaluated once with the selected config.
"""
from __future__ import annotations

from typing import Literal, Sequence

from hybrid import HybridConfig, HybridSignal, generate_signals
from hybrid_backtest import run_hybrid_backtest
from quant_data import Candle

MIN_TRADES = 2
MAX_DD_PCT = 25.0


def split_indices(total: int, train_fraction: float = 0.6, validation_fraction: float = 0.2) -> tuple[int, int, int, int]:
    if not 0 < train_fraction < 1 or not 0 < validation_fraction < 1:
        raise ValueError('Fraksi split tidak valid')
    if train_fraction + validation_fraction >= 1:
        raise ValueError('train + validation harus < 1')
    train_end = int(total * train_fraction)
    validation_end = int(total * (train_fraction + validation_fraction))
    if train_end < 200 or validation_end - train_end < 100 or total - validation_end < 100:
        raise ValueError('Dataset M5 terlalu pendek untuk split')
    return 0, train_end, validation_end, total


def walk_forward_windows(total: int, train_bars: int = 2000, test_bars: int = 500, step: int = 500):
    if train_bars < 200 or test_bars < 50 or step < 50:
        raise ValueError('Window walk-forward terlalu kecil')
    windows = []
    start = 0
    while start + train_bars + test_bars <= total:
        windows.append((start, start + train_bars, start + train_bars + test_bars))
        start += step
    if not windows:
        raise ValueError('Tidak ada fold walk-forward yang valid')
    return windows


def _evaluate(rows: Sequence[Candle], signals: Sequence[HybridSignal], config: HybridConfig,
              instrument: str, start: int, end: int) -> dict:
    return run_hybrid_backtest(rows[start:end], signals[start:end], config, instrument=instrument)  # type: ignore[arg-type]


def _score(result: dict) -> float:
    pf = result['profit_factor']
    return float(pf) if pf is not None else -1.0


def _accepted(result: dict) -> list[str]:
    reasons = []
    if result['total_trades'] < MIN_TRADES:
        reasons.append('too_few_trades')
    if result['max_drawdown_pct'] > MAX_DD_PCT:
        reasons.append('drawdown_limit')
    if result['profit_factor'] is None:
        reasons.append('undefined_profit_factor')
    return reasons


def run_validation(
    rows: Sequence[Candle],
    configs: Sequence[HybridConfig],
    instrument: Literal['SPOT', 'FUTURES'] = 'SPOT',
) -> dict:
    if not configs:
        raise ValueError('Config grid tidak boleh kosong')
    for config in configs:
        config.validate()
    _, train_end, validation_end, total = split_indices(len(rows))
    signals_by_config = [generate_signals(rows, config, allow_short=instrument == 'FUTURES') for config in configs]

    validation_results = []
    for config, signals in zip(configs, signals_by_config):
        result = _evaluate(rows, signals, config, instrument, train_end, validation_end)
        validation_results.append({
            'config': config.to_dict(),
            'score': _score(result),
            'reasons': _accepted(result),
            'metrics': result,
        })
    eligible = [item for item in validation_results if not item['reasons']]
    pool = eligible or validation_results
    chosen = max(pool, key=lambda item: item['score'])
    selected_index = validation_results.index(chosen)
    selected_config = configs[selected_index]
    selected_signals = signals_by_config[selected_index]
    oos = _evaluate(rows, selected_signals, selected_config, instrument, validation_end, total)
    oos_reasons = _accepted(oos)

    folds = []
    for fold_index, (start, train_stop, test_stop) in enumerate(
        walk_forward_windows(total), start=1
    ):
        fold_scores = []
        for config, signals in zip(configs, signals_by_config):
            result = _evaluate(rows, signals, config, instrument, start, train_stop)
            fold_scores.append((_score(result), config, signals))
        fold_scores.sort(key=lambda item: item[0], reverse=True)
        _, fold_config, fold_signals = fold_scores[0]
        fold_result = _evaluate(rows, fold_signals, fold_config, instrument, train_stop, test_stop)
        folds.append({
            'fold': fold_index,
            'train_start': start, 'train_end': train_stop,
            'test_start': train_stop, 'test_end': test_stop,
            'net_pct': fold_result['net_return_pct'],
            'max_drawdown_pct': fold_result['max_drawdown_pct'],
            'total_trades': fold_result['total_trades'],
        })
    positive = sum(1 for fold in folds if fold['net_pct'] > 0)
    final_reasons = list(oos_reasons)
    if chosen['reasons']:
        final_reasons.append('validation_selection_rejected')
    if positive * 2 <= len(folds):
        final_reasons.append('walk_forward_not_majority_positive')
    return {
        'instrument': instrument,
        'split': {'train_end': train_end, 'validation_end': validation_end, 'total': total},
        'selected_config': selected_config.to_dict(),
        'selection_score': chosen['score'],
        'validation_results': validation_results,
        'out_of_sample_metrics': oos,
        'walk_forward_folds': folds,
        'walk_forward_positive': positive,
        'walk_forward_total': len(folds),
        'accepted_for_paper_candidate': not final_reasons,
        'acceptance_reasons': final_reasons,
        'criteria': {'min_trades': MIN_TRADES, 'max_drawdown_pct': MAX_DD_PCT},
        'disclaimer': 'Backtest simulasi; bukan bukti profit; tidak ada order live.',
    }


__all__ = ['MIN_TRADES', 'MAX_DD_PCT', 'run_validation', 'split_indices', 'walk_forward_windows']
