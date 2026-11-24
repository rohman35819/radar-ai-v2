# Experiment — Robust Volume Spike Detection (isolated, not production)

Date: 25 November 2026. Branch: `exp/volume-spike-robustness` (from `develop`).

## 1. Hypothesis
A median-only ratio (`current / median >= 3`) flags recurring, ordinary bursts as anomalies when the baseline itself contains periodic spikes. Adding a baseline P90 gate and a robust z-score gate (median absolute deviation, MAD) reduces those false positives while preserving detection of a single genuine burst.

## 2. Goal
Measure whether the added gates reduce false positives on a volatile-but-normal baseline without losing true positives on an isolated spike. No production behavior is changed in this experiment.

## 3. Method
- Current implementation: `analyze10m()` in `lib/exchange.js` (median of up to 36 closed 10-minute buckets, `spikeX=3`, `minUsd=2000`).
- Candidate: `robustSpike()` in `lib/experiments/volume-spike-robust.js` applies the same current-bucket and baseline rules, then additionally requires `current > baseline P90` and (when MAD > 0) `robust_z = 0.6745 * (current - median) / MAD >= 3`.
- Both run on identical synthetic bucket series; outputs are compared per scenario.
- Deterministic fixtures only. No real market data, no API calls, no network access, no wallet or trading data.

## 4. Data used
Synthetic 10-minute buckets with 24 baseline points plus one current bucket, quotes in USD:
- A: baseline 24 x 1000, current 6000 (isolated burst).
- B: baseline every 4th bucket 4000, others 1000, current 4000 (recurring burst).
- C: baseline alternating 800/1400, current 5000 (volatile baseline, large burst).
- D: only 6 baseline buckets, current 9000 (insufficient data).

These are explicitly labeled fixtures, not observed market values.

## 5. Results (actual command output)
`node --test test/volume-spike-experiment.test.js`: 4 pass, 0 fail.

| Scenario | median-only | robust (P90 + MAD) |
|---|---|---|
| A isolated burst | spike | robust_spike |
| B recurring burst | spike (false positive) | no spike; baseline P90 = 4000 |
| C volatile baseline + large burst | spike | robust_spike, robust_z > 3 |
| D insufficient data | null | null |

## 6. Comparison
The candidate removed the false positive in scenario B while keeping the same decisions in A, C and D. It adds two cheap computations (P90, MAD) over at most 36 numbers per token; no extra API calls and no new dependencies.

## 7. Conclusion
The hypothesis is supported for the tested fixtures. The median-only rule cannot distinguish an ordinary recurring burst from a new anomaly; the P90 gate addresses that directly. MAD alone is insufficient when dispersion is zero or very small, so the candidate treats MAD = 0 as a valid strong signal.

## 8. Decision
**Not implemented in production.** The experiment lives only in `lib/experiments/` and `test/volume-spike-experiment.test.js` on an isolated `exp/*` branch. Production `lib/exchange.js` and alert thresholds are unchanged. Before adoption, validate on real historical klines with labeled outcomes, measure false-positive/false-negative rates and cost, then propose a separate opt-in change with tests and rollback. No trading, withdrawal or financial action is involved.
