# RADAR AI — Python Research Pilot

This folder is an **offline research tool**, not part of the Hostless Node.js runtime.

## SMA crossover backtest

Input CSV columns:

- `timestamp`: strictly increasing ISO-8601 timestamp with timezone (UTC recommended).
- `close`: finite, positive closing price.

Run with Python 3.11+ (standard library only):

```bash
python3 research/python/backtest.py candles.csv --fast 5 --slow 20 --fee-bps 10 --slippage-bps 5
python3 -m unittest discover -s research/python -p 'test_*.py' -v
```

The baseline is a long/flat simple-moving-average crossover. A signal calculated at one close is applied only to the following close-to-close return, avoiding look-ahead. Fees and slippage are charged on position changes. The output includes strategy return, buy-and-hold return, maximum drawdown, entries and position changes.

Limitations: this pilot does not fetch market data, infer missing candles, model funding/taxes/liquidity/market impact, or place orders. It must not be treated as a profitable strategy or a trading recommendation. Use validated historical data and compare multiple periods/assets before drawing conclusions.
