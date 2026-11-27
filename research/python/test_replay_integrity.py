"""Tests for replay/integrity reference semantics (no runtime activation)."""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from replay_integrity_model import (
    IntegrityError, ReplayGuard, make_event, re_sign, verify_event,
)

NOW = datetime(2026, 11, 27, 9, 30, tzinfo=timezone.utc)
PAYLOAD = {'last_price': 61000, 'change_pct': 1.2}


def event(**changes):
    values = {'payload': PAYLOAD,
              'observed_at': '2026-11-27T09:29:00.000Z',
              'received_at': '2026-11-27T09:29:00.500Z'}
    values.update(changes)
    return make_event(**values)


class ReplayIntegrityTests(unittest.TestCase):
    def test_same_event_repeated_is_deduplicated(self):
        item = event()
        guard = ReplayGuard()
        self.assertEqual(guard.check(item), 'OBSERVE_ONLY')
        self.assertEqual(guard.check(item), 'DUPLICATE_OBSERVATION')

    def test_restart_with_shared_durable_state_rejects_old_event(self):
        item = event()
        shared = set()
        ReplayGuard(shared).check(item)
        restarted = ReplayGuard(shared)
        self.assertEqual(restarted.check(item), 'DUPLICATE_OBSERVATION')

    def test_two_consumers_with_separate_in_memory_state_both_accept(self):
        item = event()
        self.assertEqual(ReplayGuard().check(item), 'OBSERVE_ONLY')
        self.assertEqual(ReplayGuard().check(item), 'OBSERVE_ONLY')

    def test_checksum_change_is_rejected(self):
        item = event()
        tampered = item.__class__(**{**item.__dict__, 'checksum': '0' * 64})
        with self.assertRaises(IntegrityError) as ctx:
            verify_event(tampered, NOW)
        self.assertEqual(ctx.exception.code, 'CHECKSUM_INVALID')

    def test_timestamp_and_freshness_manipulation_is_rejected(self):
        old = event(observed_at='2026-11-27T08:00:00.000Z')
        with self.assertRaises(IntegrityError) as ctx:
            verify_event(old, NOW)
        self.assertEqual(ctx.exception.code, 'STALE_OBSERVATION')
        future = event(observed_at='2026-11-27T10:00:00.000Z')
        with self.assertRaises(IntegrityError) as ctx:
            verify_event(future, NOW)
        self.assertEqual(ctx.exception.code, 'FUTURE_TIMESTAMP')
        malformed = event(observed_at='not-a-time')
        with self.assertRaises(IntegrityError) as ctx:
            verify_event(malformed, NOW)
        self.assertEqual(ctx.exception.code, 'TIMESTAMP_MALFORMED')

    def test_malformed_private_payload_is_rejected(self):
        bad = event(payload={'balances': [{'asset': 'USDT', 'total': 10}]})
        with self.assertRaises(IntegrityError) as ctx:
            verify_event(bad, NOW)
        self.assertEqual(ctx.exception.code, 'PRIVATE_DATA_REJECTED')

    def test_untrusted_producer_and_unkeyed_resigning_limitation(self):
        forged = re_sign(event(), producer='untrusted-producer')
        self.assertEqual(verify_event(forged, NOW, trusted_producer='untrusted-producer'), True)
        with self.assertRaises(IntegrityError) as ctx:
            verify_event(forged, NOW)
        self.assertEqual(ctx.exception.code, 'UNTRUSTED_PRODUCER')
        keyed = make_event(PAYLOAD, '2026-11-27T09:29:00.000Z',
                           '2026-11-27T09:29:00.500Z', key='server-side-key', mode='hmac')
        self.assertEqual(verify_event(keyed, NOW, key='server-side-key'), True)
        with self.assertRaises(IntegrityError) as ctx:
            verify_event(keyed, NOW, key=None)
        self.assertEqual(ctx.exception.code, 'HMAC_KEY_MISSING')


if __name__ == '__main__':
    unittest.main()
