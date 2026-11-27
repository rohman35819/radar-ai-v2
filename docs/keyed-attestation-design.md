# Keyed Attestation & Secret Rotation Design (PROPOSED)

**Status:** design only. No secret, key or credential is stored in this repository. No worker/DB activation. Owner: BOS · Divisi 01 (security), Divisi 06 (platform).

## 1. Why

Current provenance uses **unkeyed SHA-256**. It proves consistency of canonical content, **not producer authenticity**: anyone able to edit an observation can recompute the digest. This is acceptable while the internal ExchangeGateway is the sole trusted producer (observe-only boundary, no funds), but insufficient under a malicious-producer or tampering-transport threat model.

## 2. Keyed option

- Replace `checksum = SHA256(canonical(body))` with `attestation = HMAC-SHA256(key, canonical(body))` over the same canonical fields.
- Key lives only in server-side environment / secret manager (e.g. `RADAR_OBSERVATION_HMAC_KEY`), never in Git, frontend, logs, fixtures, CLI args, issues or chat.
- Contract fields: `attestation_algorithm = 'HMAC-SHA256'`, `key_id`, `attestation` (64-hex). `checksum` remains as a non-keyed consistency digest if needed for debugging; it is **not** an authenticity claim.
- Verifier loads the key by `key_id`; unknown key → fail closed (`KEY_UNKNOWN`). Missing key → fail closed (`KEY_MISSING`).
- HMAC verification uses constant-time comparison.

## 3. Rotation without repository secrets

1. Generate new key in the secret store; assign new `key_id`.
2. Producer signs with new key; verifier accepts a short allowlist of `(key_id, key)` pairs (previous + current).
3. After the retention window for old events expires, remove old key from verifier allowlist.
4. Rotation events are recorded as sanitized audit events (key_id only, never key material).
5. No key value appears in tests; tests use synthetic in-memory keys generated at runtime.

## 4. Limits

HMAC authenticates only holders of the key. It does not validate market truth, prevent a compromised producer with key access from signing false data, or replace deterministic validation, source corroboration and stale-data guards. If the producer itself is untrusted, independent source corroboration and structural validation remain mandatory.

## 5. Acceptance criteria before adoption

- Tests: tampered payload fails; forged producer without key fails; old key accepted only during rotation window; unknown/missing key fails closed.
- Secret scan passes with no key material in repository.
- Divisi 01 review and BOS approval before any production key is created.

Current implementation remains unkeyed SHA-256; this document is a proposed upgrade, not an activated control.
