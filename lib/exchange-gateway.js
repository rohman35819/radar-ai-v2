'use strict';

/**
 * Internal ExchangeGateway — narrow, in-process, read-only service interface.
 *
 * This module is NOT an HTTP route and does NOT accept EXCHANGE_ACCESS_TOKEN.
 * The dashboard's human-authenticated /api/exchanges/* route remains unchanged.
 * Exchange secrets stay inside createExchangeService (server environment only).
 * No order, cancel, transfer, withdrawal, leverage or margin capability exists.
 */
const crypto = require('crypto');
const { createExchangeService } = require('./exchanges');

class GatewayError extends Error {
  constructor(code) {
    super(code);
    this.name = 'GatewayError';
    this.code = code;
  }
}

const CAPABILITIES = Object.freeze({
  'quantum-research': Object.freeze(['status', 'getMarketObservation']),
  'risk-engine': Object.freeze(['status', 'getMarketObservation', 'getAccountSnapshot', 'getPermissionStatus']),
  'system-health': Object.freeze(['status']),
});

const EXCHANGES = new Set(['binance']);
const SYMBOL_RE = /^[A-Z0-9]{4,24}$/;
const SECRET_RE = /(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:api[_-]?key|secret|password|token|private[_-]?key)\s*[:=]?\s*["']?[A-Za-z0-9/+=._-]{12,}|(?:secret|password|token|private[_-]?key)[-_][A-Za-z0-9_-]{4,})/i;
const FORBIDDEN_FRAGMENTS = ['secret', 'password', 'token', 'apikey', 'authorization', 'signature',
  'balance', 'position', 'withdraw', 'transfer', 'order', 'leverage', 'margin'];

function forbiddenKey(key) {
  const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
  return FORBIDDEN_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function canonical(value) {
  const sort = (item) => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === 'object') {
      const output = {};
      for (const key of Object.keys(item).sort()) {
        if (item[key] !== undefined) output[key] = sort(item[key]);
      }
      return output;
    }
    return item;
  };
  return JSON.stringify(sort(value));
}

function checksum(value) {
  return crypto.createHash('sha256').update(canonical(value)).digest('hex');
}

function scrub(value, depth = 0, seen = new Set()) {
  if (depth > 6) return '[TRUNCATED]';
  if (typeof value === 'string') {
    if (value.length > 4096) return '[TRUNCATED]';
    return SECRET_RE.test(value) ? '[REDACTED]' : value;
  }
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CYCLE]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => scrub(item, depth + 1, new Set(seen)));
  const output = {};
  let keys = 0;
  for (const [key, item] of Object.entries(value)) {
    if (forbiddenKey(key)) continue;
    if (keys++ >= 50) { output.truncated = true; break; }
    output[key] = scrub(item, depth + 1, new Set(seen));
  }
  return output;
}

function createExchangeGateway({ role, exchangeService, now = Date.now, maxAgeMs = 300000 } = {}) {
  if (typeof role !== 'string' || !Object.prototype.hasOwnProperty.call(CAPABILITIES, role)) {
    throw new GatewayError('GATEWAY_ROLE_DENIED');
  }
  if (!exchangeService || typeof exchangeService.status !== 'function'
    || typeof exchangeService.market !== 'function' || typeof exchangeService.account !== 'function') {
    throw new GatewayError('GATEWAY_SERVICE_REQUIRED');
  }
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0 || maxAgeMs > 86400000) {
    throw new GatewayError('GATEWAY_INVALID_AGE_LIMIT');
  }
  const allowed = CAPABILITIES[role];
  const requireCapability = (name) => {
    if (!allowed.includes(name)) throw new GatewayError('GATEWAY_CAPABILITY_DENIED');
  };
  const normalizeVenue = (exchange) => {
    const name = String(exchange || '').toLowerCase();
    if (!EXCHANGES.has(name)) throw new GatewayError('EXCHANGE_NOT_ALLOWED');
    return name;
  };
  const normalizeSymbol = (symbol) => {
    const pair = String(symbol || '').trim().toUpperCase();
    if (!SYMBOL_RE.test(pair)) throw new GatewayError('SYMBOL_INVALID');
    return pair;
  };
  const timestamp = () => new Date(now()).toISOString();

  const gateway = Object.freeze({
    status() {
      requireCapability('status');
      const raw = exchangeService.status();
      return Object.freeze({
        role: Object.freeze({ id: role, capabilities: [...allowed] }),
        binance: Object.freeze({ configured: Boolean(raw && raw.binance && raw.binance.configured), mode: 'read-only' }),
        received_at: timestamp(),
      });
    },

    async getMarketObservation(exchange, symbol) {
      requireCapability('getMarketObservation');
      const venue = normalizeVenue(exchange);
      const pair = normalizeSymbol(symbol);
      let market;
      try {
        market = await exchangeService.market(venue, pair);
      } catch {
        throw new GatewayError('EXCHANGE_READ_FAILED');
      }
      if (!market || typeof market !== 'object') throw new GatewayError('OBSERVATION_INCOMPLETE');
      const validTicker = (item) => Boolean(item && Number.isFinite(item.last_price) && item.last_price > 0);
      // Fail closed on partial reads: both spot and futures legs must be valid.
      if (!validTicker(market.spot) || !validTicker(market.futures)) throw new GatewayError('OBSERVATION_INCOMPLETE');
      const receivedAt = timestamp();
      if (typeof market.checked_at !== 'string' || !Number.isFinite(Date.parse(market.checked_at))) {
        throw new GatewayError('OBSERVATION_INCOMPLETE');
      }
      const observedAt = new Date(Date.parse(market.checked_at)).toISOString();
      const age = Date.parse(receivedAt) - Date.parse(observedAt);
      if (!Number.isFinite(age) || age < 0) throw new GatewayError('OBSERVATION_STALE');
      if (age > maxAgeMs) throw new GatewayError('OBSERVATION_STALE');
      const freshness = 'fresh';
      const payload = scrub({
        exchange: venue,
        symbol: pair,
        spot: market.spot,
        futures: market.futures,
      });
      const source = venue + ':ticker';
      const interval = '24h';
      // Bind provenance to both the payload and its timestamps.
      const digest = checksum({
        schema_version: 'market-observation.v1', source, symbol: pair, interval,
        observed_at: observedAt, received_at: receivedAt, is_complete: true, freshness, payload,
      });
      return Object.freeze({
        schema_version: 'market-observation.v1',
        source,
        symbol: pair,
        interval,
        observed_at: observedAt,
        received_at: receivedAt,
        is_complete: true,
        freshness,
        provenance_ref: digest,
        checksum: digest,
        payload: Object.freeze(payload),
      });
    },

    async getAccountSnapshot(exchange) {
      requireCapability('getAccountSnapshot');
      const venue = normalizeVenue(exchange);
      let account;
      try {
        account = await exchangeService.account(venue);
      } catch {
        throw new GatewayError('EXCHANGE_READ_FAILED');
      }
      if (!account || typeof account !== 'object') throw new GatewayError('ACCOUNT_READ_FAILED');
      // Only booleans and a minimal label leave this boundary. Permission keys
      // are read explicitly because generic scrub() intentionally drops keys
      // containing withdraw/transfer for research-payload safety.
      const permissions = account.account && account.account.api_permissions ? account.account.api_permissions : {};
      const identity = account.account && account.account.identity ? account.account.identity : {};
      // Avoid echoing provider-built labels that may contain an exchange UID.
      const label = typeof identity.display_name === 'string'
        && identity.display_name.length <= 60
        && !/UID/i.test(identity.display_name)
        && !SECRET_RE.test(identity.display_name) ? identity.display_name : '';
      return Object.freeze({
        schema_version: 'account-snapshot.v1',
        exchange: venue,
        connected: Boolean(account.connected),
        permissions: Object.freeze({
          spot_trading: Boolean(permissions.spot_trading),
          // Initial pilot admits Binance only; no cross-exchange permission mapping.
          futures_trading: Boolean(permissions.futures_trading),
          withdrawals: Boolean(permissions.withdrawals),
          transfer: Boolean(permissions.transfer || permissions.transfers),
        }),
        identity: Object.freeze({ display_name: label, label_configured: Boolean(identity.label_configured) }),
        received_at: timestamp(),
      });
    },

    async getPermissionStatus(exchange) {
      const snapshot = await gateway.getAccountSnapshot(exchange);
      return snapshot.permissions;
    },
  });

  return gateway;
}

/** Composition helper for in-process callers; env stays server-side. */
function createDefaultExchangeGateway({ role, env = process.env, now = Date.now, maxAgeMs = 300000, fetchImpl } = {}) {
  const service = createExchangeService({ env, fetchImpl, now });
  return createExchangeGateway({ role, exchangeService: service, now, maxAgeMs });
}

module.exports = { createExchangeGateway, createDefaultExchangeGateway, GatewayError, CAPABILITIES };
