# Public Order Book Data Audit — Command 19 (27 November 2026)

**Status:** audit evidence only. No order-book feature is claimed validated. No paid service was contacted. Salutation: BOS.

## 1. Probes performed (timestamp of this session)

| Source | Endpoint | Result | Category |
|---|---|---|---|
| Binance public market data | `https://data-api.binance.vision/api/v3/depth?symbol=BTCUSDT&limit=5` | **HTTP 200**, JSON with `lastUpdateId`, 5 bid levels, 5 ask levels | **Live snapshot (L2 top-of-book subset)** |
| Binance main API | `https://api.binance.com/api/v3/depth?...` | timeout from this environment | unreachable here |
| Bybit | `https://api.bybit.com/v5/market/orderbook?category=spot&symbol=BTCUSDT&limit=5` | timeout from this environment | unverified here |
| Coinbase Exchange | `https://api.exchange.coinbase.com/products/BTC-USD/book?level=2` | timeout from this environment | unverified here |
| Binance Vision listing | `https://data.binance.vision/?prefix=data/spot/depth/` | HTTP 200 HTML, no downloadable depth files exposed in listing | no historical depth artifact found |
| Binance Vision plausible daily depth path | `https://data.binance.vision/data/spot/depth/daily/BTCUSDT/` | **HTTP 404** | no public daily depth found |
| Binance Vision aggTrades plausible path | `https://data.binance.vision/data/spot/daily/aggTrades/BTCUSDT/2025-11-27.zip` | **HTTP 404** | path not confirmed |
| Binance Vision klines | existing committed fixtures from `data-api.binance.vision/api/v3/klines` | reproducible with provenance | historical OHLCV available |

## 2. Classification

- **Historical downloadable:** OHLCV klines only (already in repository, with checksum and retrieval timestamp).
- **Real-time public stream:** order-book snapshots (Binance `depth`) are reachable now, but represent a single moment; they are **not** a historical dataset and cannot support walk-forward backtesting without continuous collection.
- **Snapshot sesaat:** the probed `depth` response includes timestamp-like `lastUpdateId` and prices/sizes; no provenance artifact, no interval, no completeness guarantees, no historical replay.

## 3. Decision

Actual bid/ask spread, depth, and order-book imbalance are **DEFERRED** for research validation: there is no downloadable historical L2 dataset with reproducible provenance at Rp0. Current `market_microstructure.py` values remain explicitly labelled **proxies from OHLCV**, with `actual_order_book=false`. Do not claim order-book features validated.

If BOS later approves collecting live snapshots into a durable store, that becomes a new data pipeline gated by storage/provenance rules and is not part of this change.
