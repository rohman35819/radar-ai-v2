"""Split, parameter selection and walk-forward out-of-sample validation.

Every candidate (fast, slow) generates its OWN signal stream from its own SMA
configuration. Signals for a segment are computed over the full history and
then sliced: a signal at bar i only reads closes up to i-1, so earlier bars
provide legitimate warm-up history and no future bar can leak into a segment.
The out-of-sample segment is evaluated once with the selected candidate.
No result is called profitable.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Sequence

from backtest_engine import BacktestResult, run_backtest
from quant_data import DataQualityError, Dataset, slice_dataset
from strategy import Signal, StrategyConfig, generate_signals

PARAMETER_GRID: tuple[tuple[int, int], ...] = ((3, 8), (5, 20), (10, 30))
MIN_TRADES = 2
MAX_DRAWDOWN_PCT = 25.0
WALK_TRAIN_BARS = 120
WALK_TEST_BARS = 40


@dataclass(frozen=True)
class Selection:
    fast: int
    slow: int
    score: float | None
    accepted: bool
    reasons: tuple[str, ...]
    result: BacktestResult


def candidate_config(base: StrategyConfig, fast: int, slow: int) -> StrategyConfig:
    """Build one candidate config; all non-SMA assumptions stay identical."""
    return StrategyConfig(
        fast=fast, slow=slow, fee_bps=base.fee_bps,
        slippage_bps=base.slippage_bps, funding_bps_per_day=base.funding_bps_per_day,
        position_fraction=base.position_fraction, stop_loss_pct=base.stop_loss_pct,
        max_drawdown_stop_pct=base.max_drawdown_stop_pct,
    )


def signals_for_candidate(
    dataset: Dataset,
    base: StrategyConfig,
    fast: int,
    slow: int,
) -> list[Signal]:
    """Full-history signal stream for exactly one (fast, slow) candidate."""
    config = candidate_config(base, fast, slow)
    config.validate()
    if slow >= len(dataset.candles):
        raise DataQualityError("slow period harus lebih pendek dari jumlah candle")
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


def _signal_cache(dataset: Dataset, base: StrategyConfig) -> Callable[[int, int], list[Signal]]:
    """Bounded by the fixed parameter grid; avoids regenerating the same stream."""
    cache: dict[tuple[int, int], list[Signal]] = {}

    def get(fast: int, slow: int) -> list[Signal]:
        key = (fast, slow)
        if key not in cache:
            cache[key] = signals_for_candidate(dataset, base, fast, slow)
        return cache[key]

    return get


def select_parameters(
    dataset: Dataset,
    start: int,
    end: int,
    base: StrategyConfig,
    grid: Sequence[tuple[int, int]] = PARAMETER_GRID,
    get_signals: Callable[[int, int], list[Signal]] | None = None,
) -> Selection:
    """Pick one parameter set using ONLY the [start, end) segment."""
    if not grid:
        raise ValueError("Grid parameter tidak boleh kosong")
    segment = slice_dataset(dataset, start, end)
    resolve = get_signals or _signal_cache(dataset, base)
    candidates: list[Selection] = []
    for fast, slow in grid:
        config = candidate_config(base, fast, slow)
        if slow >= len(segment.candles):
            continue
        candidate_signals = _segment_signals(resolve(fast, slow), start, end)
        result = run_backtest(segment, config, candidate_signals)
        reasons: list[str] = []
        if result.metrics["total_trades"] < MIN_TRADES:
            reasons.append("too_few_trades")
        if result.metrics["max_drawdown_pct"] > MAX_DRAWDOWN_PCT:
            reasons.append("drawdown_limit")
        score = result.metrics["profit_factor"]
        if score is None:
            reasons.append("undefined_profit_factor")
            score = -1.0
        candidates.append(Selection(fast, slow, score, not reasons, tuple(reasons), result))
    if not candidates:
        raise DataQualityError("Tidak ada kandidat parameter yang dapat dievaluasi")
    eligible = [item for item in candidates if item.accepted]
    pool = eligible or candidates
    chosen = max(pool, key=lambda item: (item.score if item.score is not None else -1.0, item.slow))
    return chosen


def _evaluate_candidate(
    dataset: Dataset,
    base: StrategyConfig,
    fast: int,
    slow: int,
    start: int,
    end: int,
    get_signals: Callable[[int, int], list[Signal]],
) -> BacktestResult:
    segment = slice_dataset(dataset, start, end)
    return run_backtest(segment, candidate_config(base, fast, slow),
                        _segment_signals(get_signals(fast, slow), start, end))


def run_validation(
    dataset: Dataset,
    base_config: StrategyConfig,
    grid: Sequence[tuple[int, int]] = PARAMETER_GRID,
) -> dict[str, Any]:
    """Full train/validation/OOS plus walk-forward folds on one dataset."""
    base_config.validate()
    train, validation, oos = split_three(dataset)
    total = len(dataset.candles)
    train_end = len(train.candles)
    validation_end = train_end + len(validation.candles)
    get_signals = _signal_cache(dataset, base_config)

    selected = select_parameters(dataset, train_end, validation_end, base_config, grid, get_signals)

    # OOS uses the selected candidate's own config AND its own signal stream.
    oos_result = _evaluate_candidate(dataset, base_config, selected.fast, selected.slow,
                                     validation_end, total, get_signals)

    folds: list[dict[str, Any]] = []
    fold_start = 0
    for fold_index in range(1, 1000):
        train_start, train_stop = fold_start, fold_start + WALK_TRAIN_BARS
        test_start, test_stop = train_stop, train_stop + WALK_TEST_BARS
        if test_stop > total:
            break
        fold_selected = select_parameters(dataset, train_start, train_stop, base_config, grid, get_signals)
        fold_result = _evaluate_candidate(dataset, base_config, fold_selected.fast, fold_selected.slow,
                                          test_start, test_stop, get_signals)
        folds.append({
            "fold": fold_index,
            "train_start": dataset.candles[train_start].timestamp,
            "train_end": dataset.candles[train_stop - 1].timestamp,
            "test_start": dataset.candles[test_start].timestamp,
            "test_end": dataset.candles[test_stop - 1].timestamp,
            "train_start_index": train_start,
            "train_end_index": train_stop,
            "test_start_index": test_start,
            "test_end_index": test_stop,
            "selected_fast": fold_selected.fast,
            "selected_slow": fold_selected.slow,
            "selection_accepted": fold_selected.accepted,
            "test_net_return_pct": fold_result.metrics["net_return_pct"],
            "test_max_drawdown_pct": fold_result.metrics["max_drawdown_pct"],
            "test_total_trades": fold_result.metrics["total_trades"],
        })
        fold_start += WALK_TEST_BARS
    if not folds:
        raise DataQualityError("Tidak ada fold walk-forward yang valid")

    fold_returns = [fold["test_net_return_pct"] for fold in folds]
    acceptance_reasons: list[str] = []
    if oos_result.metrics["total_trades"] < MIN_TRADES:
        acceptance_reasons.append("oos_too_few_trades")
    if oos_result.metrics["max_drawdown_pct"] > MAX_DRAWDOWN_PCT:
        acceptance_reasons.append("oos_drawdown_limit")
    if not selected.accepted:
        acceptance_reasons.append("validation_selection_rejected")
    if sum(1 for value in fold_returns if value > 0) * 2 <= len(fold_returns):
        acceptance_reasons.append("walk_forward_not_majority_positive")

    return {
        "train": {"start": train.start, "end": train.end, "bars": len(train.candles)},
        "validation": {"start": validation.start, "end": validation.end, "bars": len(validation.candles)},
        "out_of_sample": {"start": oos.start, "end": oos.end, "bars": len(oos.candles)},
        "selected_parameters": {
            "fast": selected.fast, "slow": selected.slow,
            "validation_score": selected.score,
            "selection_accepted": selected.accepted,
            "selection_reasons": list(selected.reasons),
            "signal_source": "candidate_specific_sma_stream_sliced_from_full_history",
        },
        "out_of_sample_config": candidate_config(base_config, selected.fast, selected.slow).to_dict(),
        "out_of_sample_metrics": oos_result.metrics,
        "out_of_sample_trades": [trade.to_dict() for trade in oos_result.trades[:50]],
        "walk_forward_folds": folds,
        "walk_forward_positive_folds": sum(1 for value in fold_returns if value > 0),
        "walk_forward_total_folds": len(fold_returns),
        "accepted_for_paper_candidate": not acceptance_reasons,
        "acceptance_reasons": acceptance_reasons,
        "criteria": {
            "min_trades": MIN_TRADES,
            "max_drawdown_pct": MAX_DRAWDOWN_PCT,
            "walk_forward_positive_folds_majority": True,
            "parameter_grid": [list(pair) for pair in grid],
            "warm_up": "full-history prior closes; no future candle is read",
        },
        "disclaimer": "Backtest dan paper simulation bukan bukti profit masa depan; tidak ada order dikirim.",
    }
