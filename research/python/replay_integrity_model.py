"""Reference model for replay/integrity semantics (research tooling, NOT runtime).

This models the properties the future Agent Platform durable queue must satisfy.
It does not activate a database, worker, scheduler, paper ledger or trading path.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import math
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping


class IntegrityError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def canonical_json(value: Any) -> str:
    def sort(item: Any) -> Any:
        if isinstance(item, list):
            return [sort(entry) for entry in item]
        if isinstance(item, dict):
            return {key: sort(item[key]) for key in sorted(item)}
        return item
    return json.dumps(sort(value), ensure_ascii=False, separators=(',', ':'))


def sha256_hex(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode('utf-8')).hexdigest()


def hmac_hex(value: Any, key: str) -> str:
    return hmac.new(key.encode('utf-8'), canonical_json(value).encode('utf-8'), hashlib.sha256).hexdigest()


@dataclass(frozen=True)
class Event:
    event_id: str
    idempotency_key: str
    observed_at: str
    received_at: str
    payload: Mapping[str, Any]
    producer: str
    mode: str
    checksum: str


def body_of(observed_at: str, received_at: str, payload: Mapping[str, Any], producer: str) -> dict[str, Any]:
    return {'observed_at': observed_at, 'received_at': received_at,
            'payload': dict(payload), 'producer': producer}


def make_event(
    payload: Mapping[str, Any],
    observed_at: str,
    received_at: str,
    producer: str = 'internal-gateway',
    key: str | None = None,
    mode: str = 'sha256',
) -> Event:
    if mode not in ('sha256', 'hmac'):
        raise IntegrityError('MODE_UNSUPPORTED')
    if mode == 'hmac' and not key:
        raise IntegrityError('HMAC_KEY_REQUIRED')
    body = body_of(observed_at, received_at, payload, producer)
    digest = hmac_hex(body, key) if mode == 'hmac' else sha256_hex(body)
    event_id = sha256_hex(body)
    idem = sha256_hex({'event_id': event_id, 'observed_at': observed_at, 'producer': producer})
    return Event(event_id, idem, observed_at, received_at, dict(payload), producer, mode, digest)


def re_sign(event: Event, **changes: Any) -> Event:
    updated = replace(event, **changes)
    body = body_of(updated.observed_at, updated.received_at, updated.payload, updated.producer)
    if updated.mode == 'hmac':
        raise IntegrityError('HMAC_KEY_REQUIRED_FOR_RESIGN')
    return replace(updated, checksum=sha256_hex(body))


FORBIDDEN = ('balance', 'position', 'account', 'secret', 'token', 'password', 'withdraw', 'transfer', 'order')


def verify_event(
    event: Event,
    now: datetime,
    max_age_ms: int = 300000,
    trusted_producer: str = 'internal-gateway',
    key: str | None = None,
) -> bool:
    if event.mode == 'hmac':
        if not key:
            raise IntegrityError('HMAC_KEY_MISSING')
        expected = hmac_hex(body_of(event.observed_at, event.received_at, event.payload, event.producer), key)
    else:
        expected = sha256_hex(body_of(event.observed_at, event.received_at, event.payload, event.producer))
    if not hmac.compare_digest(expected, event.checksum):
        raise IntegrityError('CHECKSUM_INVALID')
    if event.producer != trusted_producer:
        raise IntegrityError('UNTRUSTED_PRODUCER')
    try:
        observed = datetime.fromisoformat(event.observed_at.replace('Z', '+00:00'))
        received = datetime.fromisoformat(event.received_at.replace('Z', '+00:00'))
    except ValueError:
        raise IntegrityError('TIMESTAMP_MALFORMED') from None
    if observed.tzinfo is None or received.tzinfo is None:
        raise IntegrityError('TIMESTAMP_MALFORMED')
    if observed > now or received > now:
        raise IntegrityError('FUTURE_TIMESTAMP')
    age_ms = (now - observed).total_seconds() * 1000
    if not math.isfinite(age_ms) or age_ms > max_age_ms:
        raise IntegrityError('STALE_OBSERVATION')
    serialized = canonical_json(event.payload).lower()
    if any(word in serialized for word in FORBIDDEN):
        raise IntegrityError('PRIVATE_DATA_REJECTED')
    return True


class ReplayGuard:
    """In-memory reference guard. `durable_seen` simulates shared durable state."""

    def __init__(self, durable_seen: set[str] | None = None):
        self._seen = durable_seen if durable_seen is not None else set()

    @property
    def seen(self) -> set[str]:
        return self._seen

    def check(self, event: Event) -> str:
        if event.idempotency_key in self._seen:
            return 'DUPLICATE_OBSERVATION'
        self._seen.add(event.idempotency_key)
        return 'OBSERVE_ONLY'
