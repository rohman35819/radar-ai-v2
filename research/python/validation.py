"""Split, parameter selection and walk-forward out-of-sample validation.

Selection uses only train/validation segments; the out-of-sample segment is
evaluated once with the chosen parameters. No result is called profitable.
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


@dataclass(frozen=True)
class Selection:
    fast: int
    slow: int
    score: float | None
    accepted: bool
    reasons: tuple[str, ...]
    result: BacktestResult


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


def walk_forward(dataset: Dataset, train_bars: int, test_bars: int) -> list[tuple[Dataset, Dataset]]:
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


def _segment_signals(signals: Sequence[Signal], start: int, end: int) -> list[Signal]:
    return list(signals[start:end])


def select_parameters(
    segment: Dataset,
    signals: Sequence[Signal],
    base_config: StrategyConfig,
    grid: Sequence[tuple[int, int]] = PARAMETER_GRID,
) -> Selection:
    """Pick one parameter set using validation data only, with risk constraints."""
    if not grid:
        raise ValueError("Grid parameter tidak boleh kosong")
    candidates: list[Selection] = []
    for fast, slow in grid:
        config = StrategyConfig(
            fast=fast, slow=slow, fee_bps=base_config.fee_bps,
            slippage_bps=base_config.slippage_bps,
            funding_bps_per_day=base_config.funding_bps_per_day,
            position_fraction=base_config.position_fraction,
            stop_loss_pct=base_config.stop_loss_pct,
            max_drawdown_stop_pct=base_config.max_drawdown_stop_pct,
        )
        if slow >= len(segment.candles):
            continue
        result = run_backtest(segment, config, _segment_signals(signals, 0, len(segment.candles)))
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
    # Prefer constrained candidates by profit factor; stability tie-break by slower period.
    eligible = [item for item in candidates if item.accepted]
    pool = eligible or candidates
    chosen = max(pool, key=lambda item: (item.score if item.score is not None else -1.0, item.slow))
    return chosen


def run_validation(
    dataset: Dataset,
    base_config: StrategyConfig,
    grid: Sequence[tuple[int, int]] = PARAMETER_GRID,
) -> dict[str, Any]:
    """Full train/validation/OOS plus walk-forward folds on one dataset."""
    base_config.validate()
    signals = generate_signals(dataset.candles, base_config)
    train, validation, oos = split_three(dataset)
    total = len(dataset.candles)
    train_end = len(train.candles)
    validation_end = train_end + len(validation.candles)

    selected = select_parameters(validation, signals[train_end:validation_end], base_config, grid)
    oos_config = StrategyConfig(
        fast=selected.fast, slow=selected.slow, fee_bps=base_config.fee_bps,
        slippage_bps=base_config.slippage_bps, funding_bps_per_day=base_config.funding_bps_per_day,
        position_fraction=base_config.position_fraction, stop_loss_pct=base_config.stop_loss_pct,
        max_drawdown_stop_pct=base_config.max_drawdown_stop_pct,
    )
    oos_result = run_backtest(oos, oos_config, _segment_signals(signals, validation_end, total))

    folds: list[dict[str, Any]] = []
    for fold_index, (train_fold, test_fold) in enumerate(walk_forward(dataset, train_bars=120, test_bars=40), start=1):
        fold_signals = generate_signals(dataset.candles, base_config)
        fold_selected = select_parameters(train_fold, fold_signals[:len(train_fold.candles)], base_config, grid)
        fold_config = StrategyConfig(
            fast=fold_selected.fast, slow=fold_selected.slow, fee_bps=base_config.fee_bps,
            slippage_bps=base_config.slippage_bps, funding_bps_per_day=base_config.funding_bps_per_day,
            position_fraction=base_config.position_fraction, stop_loss_pct=base_config.stop_loss_pct,
            max_drawdown_stop_pct=base_config.max_drawdown_stop_pct,
        )
        fold_result = run_backtest(
            test_fold, fold_config,
            _segment_signals(fold_signals, len(train_fold.candles), len(train_fold.candles) + len(test_fold.candles)),
        )
        folds.append({
            "fold": fold_index,
            "train_start": train_fold.start,
            "train_end": train_fold.end,
            "test_start": test_fold.start,
            "test_end": test_fold.end,
            "selected_fast": fold_selected.fast,
            "selected_slow": fold_selected.slow,
            "selection_accepted": fold_selected.accepted,
            "test_net_return_pct": fold_result.metrics["net_return_pct"],
            "test_max_drawdown_pct": fold_result.metrics["max_drawdown_pct"],
            "test_total_trades": fold_result.metrics["total_trades"],
        })

    fold_returns = [fold["test_net_return_pct"] for fold in folds]
    acceptance_reasons: list[str] = []
    if oos_result.metrics["total_trades"] < MIN_TRADES:
        acceptance_reasons.append("oos_too_few_trades")
    if oos_result.metrics["max_drawdown_pct"] > MAX_DRAWDOWN_PCT:
        acceptance_reasons.append("oos_drawdown_limit")
    if not selected.accepted:
        acceptance_reasons.append("validation_selection_rejected")
    if not fold_returns or sum(1 for value in fold_returns if value > 0) * 2 <= len(fold_returns):
        acceptance_reasons.append("walk_forward_not_majority_positive")

    accepted = not acceptance_reasons
    return {
        "train": {"start": train.start, "end": train.end, "bars": len(train.candles)},
        "validation": {"start": validation.start, "end": validation.end, "bars": len(validation.candles)},
        "out_of_sample": {"start": oos.start, "end": oos.end, "bars": len(oos.candles)},
        "selected_parameters": {"fast": selected.fast, "slow": selected.slow,
                                "validation_score": selected.score,
                                "selection_accepted": selected.accepted,
                                "selection_reasons": list(selected.reasons)},
        "out_of_sample_metrics": oos_result.metrics,
        "out_of_sample_trades": [trade.to_dict() for trade in oos_result.trades[:50]],
        "walk_forward_folds": folds,
        "walk_forward_positive_folds": sum(1 for value in fold_returns if value > 0),
        "walk_forward_total_folds": len(fold_returns),
        "accepted_for_paper_candidate": accepted,
        "acceptance_reasons": acceptance_reasons,
        "criteria": {
            "min_trades": MIN_TRADES,
            "max_drawdown_pct": MAX_DRAWDOWN_PCT,
            "walk_forward_positive_folds_majority": True,
            "parameter_grid": [list(pair) for pair in grid],
        },
        "disclaimer": "Backtest dan paper simulation bukan bukti profit masa depan; tidak ada order dikirim.",
    }
