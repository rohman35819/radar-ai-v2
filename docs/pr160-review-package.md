# PR #160 Review Package — ExchangeGateway + Observe-Only Shadow Consumer

**Status:** OPEN, **NOT MERGED**. Branch `feat/exchange-gateway`, exact head `c2b03f22a977bd9c26fd0d2da41b4ae543dd132b`, base `develop` `411e7b7114c9642c0e4d567e7e666c82910d2b3c`. `mergeable=true`, `mergeable_state=clean`, `draft=false`.

## 1. Human review availability — verified, blocked

- `.github/CODEOWNERS`: **not present**.
- Repository collaborators (GitHub API, authenticated): only `rohman35819`, role `admin` — and that account is the **PR author**, so GitHub self-review cannot satisfy independent review.
- Repository teams endpoint: **HTTP 403** (`Resource not accessible by personal access token`); repository owner type is `User`, not an organization with addressable teams.
- No `Divisi 01` human identity is defined anywhere in the repository. AI reviews are explicitly **not** human sign-off.

**Blocker:** an independent human reviewer cannot be identified or assigned from repository/GitHub evidence. This requires explicit appointment by **BOS / Direktur Utama**. No reviewer identity was invented and no review request was fabricated.

## 2. Threat model

| Boundary | Trusted | Untrusted | Asset |
|---|---|---|---|
| Human dashboard route | `server.js` token check (`x-exchange-access-token`) | Browser/API caller | Account read access |
| Internal gateway | In-process composition, server env secrets | Role/caller input | Market observation integrity |
| Quant input adapter | Validated `market-observation.v1` | Caller-supplied options, crafted payload | Research data integrity |
| Shadow consumer | Validated `market-observation-input.v1` | Replayed/forged receipts | Replay identity |

No funds, orders, transfers, withdrawals, ledger or reconciliation path exists in this PR. Live trading and worker are OFF. Budget Rp0.

## 3. Critical files and locations (exact head)

- `lib/exchange-gateway.js:22-26` frozen role capability map; `:62-73` role/capability denial; `:39-52` recursive canonical JSON; `:147-150` SHA-256 digest; `:58-76` bounded `scrub()` with per-branch cycle guard; `:182-185` UID-label filtering.
- `src/exchange/observation.mts:75-94` `canonicalJson`/`observationChecksum`; `:97-108` observation checksum verification; `:111-120` research-input checksum verification; `:122+` structural guards.
- `src/quant/market-observation-input.mts:50` fixed frozen BTC/ETH allowlist; `:137` 24h age cap; `:152` gateway checksum verification; re-signing of sanitized input.
- `src/quant/market-observation-shadow.mts:40-42` caller-supplied `seen` (replay state); `:87+` validation; `:139-142` dedupe check; OBSERVE_ONLY receipt only.

## 4. AI review findings and fixes

**First AI Divisi 01 review (separate read-only Grok session):** P1 lossy replacer-array checksum + unverified self-asserted digest; P2 replay bypass via forged checksum; P3 caller clock/maxAge, UID label, unbounded `scrub()`, missing both-leg enforcement.
**Fixes:** recursive key-sorted canonicalization in both JS and TS; SHA-256 recomputed at gateway, adapter and shadow boundaries; adapter re-signs sanitized input; content-derived replay key; fixed allowlist with option removed; 24h caps; UID filtering; bounded scrub; both spot+futures required. Regression tests added.

**Second AI re-review:** P1 and naive P2 closed; all four P3 closed; digest parity confirmed. Residuals: (a) unkeyed digest—integrity relies on gateway being sole trusted producer; (b) replay `seen` state comes from the caller and is not durable; (c) human Divisi 01 review still pending.

## 5. Evidence

- `npm test` **268/268**; `npm run test:python` **25/25**; strict TypeScript `tsc --noEmit` exit 0.
- Exact-head CI on `c2b03f2`: test `45987117987` **success**, security `45987115287` **success** (Gitleaks + Trivy).
- `git diff --check` clean; secret scan found no real credential.
- E4 sanitized status (2026-11-27T09:30:49Z): `/api/exchanges/status` 200, binance configured/read-only, bybit false; `/api/ready` 200, storage ok. Configuration presence is not account-connection proof.

## 6. Rollback

Revert PR #160 merge (not performed). No production data, permission, deployment, exchange credential, worker or fund state is changed. Work exists only on the feature branch.
