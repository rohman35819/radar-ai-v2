"""Versioned machine-readable research report artifact."""
from __future__ import annotations

import json
import platform
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

from backtest_engine import BacktestResult
from quant_data import Dataset
from quant_data import canonical_timestamp
from strategy import Signal

REPORT_SCHEMA = "quant-report.v1"
CODE_VERSION = "quant-mvp-1.0.0"


@dataclass(frozen=True)
class RunMeta:
    generated_at: str
    command: str = "python3 quant_cli.py <csv> --report <path>"

    def to_dict(self) -> dict[str, Any]:
        return {
            "generated_at": canonical_timestamp(self.generated_at),
            "code_version": CODE_VERSION,
            "python_version": platform.python_version(),
            "command": self.command,
        }


def build_report(
    dataset: Dataset,
    backtest: BacktestResult,
    validation: Mapping[str, Any],
    meta: RunMeta,
    signals: Sequence[Signal] | None = None,
) -> dict[str, Any]:
    return {
        "report_schema": REPORT_SCHEMA,
        "run": meta.to_dict(),
        "data": {
            "provenance": dict(dataset.provenance),
            "quality": dataset.quality.to_dict(),
            "checksum_sha256": dataset.checksum,
        },
        "signals": [
            {
                "schema_version": "quant-signal.v1",
                "symbol": dataset.provenance.get("symbol"),
                "timestamp": signal.timestamp,
                "as_of": signal.computed_from or signal.timestamp,
                "target_position": signal.target_position,
                "reference_price": signal.reference_price,
                "source": "python.strategy.generate_signals",
                "provenance_ref": dataset.checksum,
            }
            for signal in (signals or [])[:50]
        ],
        "signals_total": len(signals or []),
        "strategy": {
            "id": "sma_crossover_long_flat_v1",
            "type": "deterministic_signal",
            "signal_generation": "prior_close_sma_crossover",
            "execution": "next_bar_open_with_fee_and_slippage",
            "config": backtest.config.to_dict(),
        },
        "backtest": backtest.to_dict(include_trades=True),
        "validation": dict(validation),
        "limitations": [
            "Backtest historis bukan prediksi atau jaminan profit.",
            "Tidak ada order, withdraw, atau transfer yang dikirim.",
            "Biaya simulasi adalah asumsi; fees/funding/slippage exchange aktual dapat berbeda.",
            "Signal memakai close sebelumnya dan eksekusi pada open bar berikutnya; tidak dapat mereproduksi fill intrabar nyata.",
            "Stop loss dievaluasi pada low bar dan diisi pada harga stop setelah slippage; fill nyata dapat berbeda.",
            "Jika data_kind=synthetic, angka hanya untuk verifikasi deterministik, bukan bukti pasar.",
            "Sumber market API eksternal mungkin tidak terjangkau; jalankan fetch_ohlcv.py dengan jaringan untuk data publik nyata.",
            "Sample size kecil dan satu aset/interval tidak dapat digeneralisasi.",
        ],
        "paper_only": True,
        "live_trading": False,
        "withdrawal": False,
        "profit_claim": False,
        "disclaimer": "Simulasi historis/offline untuk riset. Bukan saran investasi atau bukti profit masa depan.",
    }


def write_report(path: str | Path, report: Mapping[str, Any]) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return target
