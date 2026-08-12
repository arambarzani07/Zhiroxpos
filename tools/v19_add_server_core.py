from pathlib import Path

root = Path('source/server')
(root / 'src').mkdir(parents=True, exist_ok=True)
(root / 'db').mkdir(parents=True, exist_ok=True)
(root / 'test').mkdir(parents=True, exist_ok=True)

(root / 'package.json').write_text(r'''{
  "name": "zhirox-pos-server",
  "version": "0.19.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/index.mjs",
    "test": "node --test test/*.test.mjs"
  },
  "engines": {
    "node": ">=22"
  },
  "dependencies": {}
}
''', encoding='utf-8')

(root / 'db/001_core.sql').write_text(r'''BEGIN;

CREATE TABLE IF NOT EXISTS markets (
  id text PRIMARY KEY,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'IQD' CHECK (currency IN ('IQD', 'USD')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  name text NOT NULL,
  receipt_prefix text NOT NULL,
  is_main boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, receipt_prefix)
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text REFERENCES branches(id) ON DELETE SET NULL,
  username text NOT NULL,
  full_name text NOT NULL,
  role_type text NOT NULL CHECK (role_type IN ('owner', 'admin', 'cashier', 'stock_staff', 'accountant')),
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_market_username_lower_uidx
  ON users (market_id, lower(username));

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_active_idx ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_throttle (
  identifier_hash text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipt_sequences (
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  last_value bigint NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  PRIMARY KEY (market_id, branch_id, business_date)
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  scope text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_json jsonb NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  PRIMARY KEY (market_id, scope, idempotency_key)
);

COMMIT;
''', encoding='utf-8')

(root / 'src/security.mjs').write_text(r'''import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const SCRYPT_PARAMS = Object.freeze({ N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const PASSWORD_BYTES = 64;

export const normalizeUsername = value => String(value ?? '').trim().toLowerCase();
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const createOpaqueToken = () => randomBytes(32).toString('base64url');
export const createId = prefix => `${prefix}-${randomUUID()}`;

export function validatePasswordPolicy(password) {
  if (typeof password !== 'string' || password.length < 10) return false;
  if (password.length > 256) return false;
  return /[A-Za-z\p{L}]/u.test(password) && /\d/.test(password);
}

export async function derivePassword(password, saltHex = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), PASSWORD_BYTES, SCRYPT_PARAMS);
  return { saltHex, hashHex: Buffer.from(derived).toString('hex') };
}

export async function verifyPassword(password, saltHex, expectedHashHex) {
  try {
    const { hashHex } = await derivePassword(password, saltHex);
    const actual = Buffer.from(hashHex, 'hex');
    const expected = Buffer.from(expectedHashHex, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function parseCookies(header = '') {
  const output = {};
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index < 0) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) output[key] = decodeURIComponent(value);
  }
  return output;
}

export function sessionCookie(token, { production, maxAgeSeconds }) {
  const secure = production ? '; Secure' : '';
  return `zhirox_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookie({ production }) {
  const secure = production ? '; Secure' : '';
  return `zhirox_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`;
}
''', encoding='utf-8')

(root / 'src/app.mjs').write_text(r'''import { createHash } from 'node:crypto';
import {
  clearSessionCookie,
  createId,
  createOpaqueToken,
  derivePassword,
  normalizeUsername,
  parseCookies,
  sessionCookie,
  sha256,
  validatePasswordPolicy,
  verifyPassword,
} from './security.mjs';

const JSON_LIMIT = 64 * 1024;
const SESSION_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_MAX_FAILURES = 5;
const DUMMY_SALT = '0123456789abcdef0123456789abcdef';
const DUMMY_HASH_PROMISE = derivePassword('not-the-password-7', DUMMY_SALT).then(result => result.hashHex);

const json = (res, status, payload, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(payload));
};

const readJson = req => new Promise((resolve, reject) => {
  let bytes = 0;
  const chunks = [];
  req.on('data', chunk => {
    bytes += chunk.length;
    if (bytes > JSON_LIMIT) {
      reject(Object.assign(new Error('PAYLOAD_TOO_LARGE'), { status: 413 }));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    try {
      const raw = Buffer.concat(chunks).toString('utf8');
      resolve(raw ? JSON.parse(raw) : {});
    } catch {
      reject(Object.assign(new Error('INVALID_JSON'), { status: 400 }));
    }
  });
  req.on('error', reject);
});

const businessDate = timeZone => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
};

const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''));
const validPrefix = value => /^[A-Z0-9]{2,8}$/.test(String(value ?? ''));

const requestIp = (req, trustProxy) => {
  if (trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
};

async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createSession(client, user, req, config) {
  const token = createOpaqueToken();
  const id = createId('session');
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  await client.query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, user.id, tokenHash, expiresAt, String(req.headers['user-agent'] ?? '').slice(0, 500)]
  );
  return {
    token,
    cookie: sessionCookie(token, { production: config.production, maxAgeSeconds: SESSION_SECONDS }),
  };
}

async function authenticate(pool, req) {
  const token = parseCookies(req.headers.cookie).zhirox_session;
  if (!token) return null;
  const result = await pool.query(
    `SELECT u.id, u.market_id, u.branch_id, u.username, u.full_name, u.role_type, u.status, s.id AS session_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.status = 'active'
      LIMIT 1`,
    [sha256(token)]
  );
  return result.rows[0] || null;
}

async function checkThrottle(client, identifierHash) {
  const result = await client.query(
    `SELECT attempts, window_started_at, blocked_until
       FROM auth_throttle
      WHERE identifier_hash = $1
      FOR UPDATE`,
    [identifierHash]
  );
  if (!result.rows[0]) return { blocked: false, attempts: 0 };
  const row = result.rows[0];
  if (row.blocked_until && new Date(row.blocked_until).getTime() > Date.now()) return { blocked: true, attempts: row.attempts };
  if (Date.now() - new Date(row.window_started_at).getTime() > LOGIN_WINDOW_MINUTES * 60_000) {
    await client.query('DELETE FROM auth_throttle WHERE identifier_hash = $1', [identifierHash]);
    return { blocked: false, attempts: 0 };
  }
  return { blocked: false, attempts: row.attempts };
}

async function recordLoginFailure(client, identifierHash, previousAttempts) {
  const attempts = previousAttempts + 1;
  const blocked = attempts >= LOGIN_MAX_FAILURES;
  await client.query(
    `INSERT INTO auth_throttle (identifier_hash, window_started_at, attempts, blocked_until, updated_at)
     VALUES ($1, now(), $2, CASE WHEN $3 THEN now() + interval '15 minutes' ELSE NULL END, now())
     ON CONFLICT (identifier_hash) DO UPDATE SET
       attempts = EXCLUDED.attempts,
       blocked_until = EXCLUDED.blocked_until,
       updated_at = now()`,
    [identifierHash, attempts, blocked]
  );
}

const publicUser = row => ({
  id: row.id,
  market_id: row.market_id,
  branch_id: row.branch_id,
  username: row.username,
  full_name: row.full_name,
  role_type: row.role_type,
});

function assertOrigin(req, config) {
  if (!config.production || !config.appOrigin) return;
  const origin = req.headers.origin;
  if (origin && origin !== config.appOrigin) throw Object.assign(new Error('ORIGIN_REJECTED'), { status: 403 });
}

export function createHandler(pool, configInput = {}) {
  const config = {
    production: configInput.production ?? process.env.NODE_ENV === 'production',
    appOrigin: configInput.appOrigin ?? process.env.APP_ORIGIN ?? '',
    bootstrapToken: configInput.bootstrapToken ?? process.env.BOOTSTRAP_TOKEN ?? '',
    timeZone: configInput.timeZone ?? process.env.MARKET_TIME_ZONE ?? 'Asia/Baghdad',
    trustProxy: configInput.trustProxy ?? process.env.TRUST_PROXY === '1',
  };

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/health') {
        await pool.query('SELECT 1');
        return json(res, 200, { ok: true, service: 'zhirox-pos-server' });
      }

      if (req.method === 'POST') assertOrigin(req, config);

      if (req.method === 'POST' && url.pathname === '/api/v1/bootstrap') {
        if (!config.bootstrapToken || req.headers['x-bootstrap-token'] !== config.bootstrapToken) {
          return json(res, 403, { error: 'BOOTSTRAP_FORBIDDEN' });
        }
        const body = await readJson(req);
        const username = normalizeUsername(body.username);
        if (!String(body.marketName ?? '').trim() || !String(body.fullName ?? '').trim() || username.length < 3 || !validatePasswordPolicy(body.password)) {
          return json(res, 422, { error: 'VALIDATION_ERROR' });
        }
        const prefix = String(body.receiptPrefix ?? 'MAIN').trim().toUpperCase();
        if (!validPrefix(prefix)) return json(res, 422, { error: 'INVALID_RECEIPT_PREFIX' });

        const result = await withTransaction(pool, async client => {
          const count = await client.query('SELECT count(*)::int AS count FROM users');
          if (count.rows[0].count > 0) return { status: 409, body: { error: 'BOOTSTRAP_ALREADY_COMPLETED' } };

          const now = new Date().toISOString();
          const marketId = createId('market');
          const branchId = createId('branch');
          const userId = createId('user');
          const password = await derivePassword(body.password);
          await client.query(
            `INSERT INTO markets (id, name, currency) VALUES ($1, $2, 'IQD')`,
            [marketId, String(body.marketName).trim()]
          );
          await client.query(
            `INSERT INTO branches (id, market_id, name, receipt_prefix, is_main) VALUES ($1, $2, $3, $4, true)`,
            [branchId, marketId, String(body.branchName ?? 'لقی سەرەکی').trim(), prefix]
          );
          await client.query(
            `INSERT INTO users (id, market_id, branch_id, username, full_name, role_type, password_salt, password_hash)
             VALUES ($1, $2, $3, $4, $5, 'owner', $6, $7)`,
            [userId, marketId, branchId, username, String(body.fullName).trim(), password.saltHex, password.hashHex]
          );
          const user = { id: userId, market_id: marketId, branch_id: branchId, username, full_name: String(body.fullName).trim(), role_type: 'owner' };
          const session = await createSession(client, user, req, config);
          return { status: 201, body: { user, created_at: now }, cookie: session.cookie };
        });
        return json(res, result.status, result.body, result.cookie ? { 'set-cookie': result.cookie } : {});
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/login') {
        const body = await readJson(req);
        const username = normalizeUsername(body.username);
        const identifierHash = sha256(`${requestIp(req, config.trustProxy)}\0${username}`);
        const result = await withTransaction(pool, async client => {
          const throttle = await checkThrottle(client, identifierHash);
          if (throttle.blocked) return { status: 429, body: { error: 'AUTH_TEMPORARILY_BLOCKED' } };

          const lookup = await client.query(
            `SELECT id, market_id, branch_id, username, full_name, role_type, status, password_salt, password_hash
               FROM users WHERE lower(username) = $1 LIMIT 1`,
            [username]
          );
          const row = lookup.rows[0];
          const dummyHash = await DUMMY_HASH_PROMISE;
          const valid = row
            ? await verifyPassword(String(body.password ?? ''), row.password_salt, row.password_hash)
            : await verifyPassword(String(body.password ?? ''), DUMMY_SALT, dummyHash);
          if (!row || row.status !== 'active' || !valid) {
            await recordLoginFailure(client, identifierHash, throttle.attempts);
            return { status: 401, body: { error: 'AUTH_INVALID_LOGIN' } };
          }

          await client.query('DELETE FROM auth_throttle WHERE identifier_hash = $1', [identifierHash]);
          await client.query('UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1', [row.id]);
          const session = await createSession(client, row, req, config);
          return { status: 200, body: { user: publicUser(row) }, cookie: session.cookie };
        });
        return json(res, result.status, result.body, result.cookie ? { 'set-cookie': result.cookie } : {});
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/session') {
        const user = await authenticate(pool, req);
        return user ? json(res, 200, { user: publicUser(user) }) : json(res, 401, { error: 'AUTH_REQUIRED' });
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/logout') {
        const cookies = parseCookies(req.headers.cookie);
        if (cookies.zhirox_session) {
          await pool.query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sha256(cookies.zhirox_session)]);
        }
        return json(res, 200, { ok: true }, { 'set-cookie': clearSessionCookie({ production: config.production }) });
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/receipts/reserve') {
        const user = await authenticate(pool, req);
        if (!user) return json(res, 401, { error: 'AUTH_REQUIRED' });
        if (!['owner', 'admin', 'cashier'].includes(user.role_type)) return json(res, 403, { error: 'PERMISSION_DENIED' });
        if (!user.branch_id) return json(res, 409, { error: 'BRANCH_REQUIRED' });
        const key = String(req.headers['idempotency-key'] ?? '').trim();
        if (!key || key.length > 128) return json(res, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' });
        const body = await readJson(req);
        const date = body.businessDate ? String(body.businessDate) : businessDate(config.timeZone);
        if (!validDate(date)) return json(res, 422, { error: 'INVALID_BUSINESS_DATE' });
        const requestHash = createHash('sha256').update(JSON.stringify({ date, branch: user.branch_id })).digest('hex');

        const response = await withTransaction(pool, async client => {
          const existing = await client.query(
            `SELECT request_hash, response_json FROM idempotency_keys
              WHERE market_id = $1 AND scope = 'receipt.reserve' AND idempotency_key = $2`,
            [user.market_id, key]
          );
          if (existing.rows[0]) {
            if (existing.rows[0].request_hash !== requestHash) return { status: 409, body: { error: 'IDEMPOTENCY_CONFLICT' } };
            return { status: 200, body: existing.rows[0].response_json };
          }

          const branch = await client.query('SELECT receipt_prefix FROM branches WHERE id = $1 AND market_id = $2 AND status = $3', [user.branch_id, user.market_id, 'active']);
          if (!branch.rows[0]) return { status: 409, body: { error: 'BRANCH_UNAVAILABLE' } };
          const sequence = await client.query(
            `INSERT INTO receipt_sequences (market_id, branch_id, business_date, last_value)
             VALUES ($1, $2, $3::date, 1)
             ON CONFLICT (market_id, branch_id, business_date)
             DO UPDATE SET last_value = receipt_sequences.last_value + 1
             RETURNING last_value`,
            [user.market_id, user.branch_id, date]
          );
          const number = Number(sequence.rows[0].last_value);
          const receiptNumber = `${branch.rows[0].receipt_prefix}-${date.replaceAll('-', '')}-${String(number).padStart(6, '0')}`;
          const payload = { receipt_number: receiptNumber, sequence: number, business_date: date };
          await client.query(
            `INSERT INTO idempotency_keys (market_id, scope, idempotency_key, request_hash, response_json, user_id)
             VALUES ($1, 'receipt.reserve', $2, $3, $4::jsonb, $5)`,
            [user.market_id, key, requestHash, JSON.stringify(payload), user.id]
          );
          return { status: 201, body: payload };
        });
        return json(res, response.status, response.body);
      }

      return json(res, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error(error);
      return json(res, status, { error: status >= 500 ? 'INTERNAL_ERROR' : error.message });
    }
  };
}
''', encoding='utf-8')

(root / 'src/index.mjs').write_text(r'''import http from 'node:http';
import pg from 'pg';
import { createHandler } from './app.mjs';

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (process.env.NODE_ENV === 'production' && !process.env.BOOTSTRAP_TOKEN) throw new Error('BOOTSTRAP_TOKEN is required in production until bootstrap is disabled');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_SIZE || 10) });
const handler = createHandler(pool);
const port = Number(process.env.PORT || 8787);
const server = http.createServer(handler);

server.listen(port, () => console.log(`ZHIROX POS server listening on ${port}`));

const shutdown = async signal => {
  console.log(`${signal}: shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
''', encoding='utf-8')

(root / 'test/server.test.mjs').write_text(r'''import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { createHandler } from '../src/app.mjs';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL required for integration tests');
const pool = new Pool({ connectionString: DATABASE_URL, max: 6 });
let server;
let baseUrl;
let cookie = '';

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      origin: 'http://127.0.0.1',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return { response, json: await response.json() };
}

before(async () => {
  const migration = await fs.readFile(new URL('../db/001_core.sql', import.meta.url), 'utf8');
  await pool.query(migration);
  await pool.query('TRUNCATE idempotency_keys, receipt_sequences, auth_throttle, sessions, users, branches, markets CASCADE');
  const handler = createHandler(pool, {
    production: false,
    bootstrapToken: 'integration-bootstrap-token',
    timeZone: 'Asia/Baghdad',
  });
  server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test('health reports database availability', async () => {
  const { response, json } = await request('/api/health');
  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
});

test('bootstrap requires deployment secret and creates only one owner', async () => {
  let result = await request('/api/v1/bootstrap', {
    method: 'POST',
    body: { marketName: 'ZHIROX Test', fullName: 'Owner', username: 'owner', password: 'SecurePass9', receiptPrefix: 'MAIN' },
  });
  assert.equal(result.response.status, 403);

  result = await request('/api/v1/bootstrap', {
    method: 'POST',
    headers: { 'x-bootstrap-token': 'integration-bootstrap-token' },
    body: { marketName: 'ZHIROX Test', fullName: 'Owner', username: 'owner', password: 'SecurePass9', receiptPrefix: 'MAIN' },
  });
  assert.equal(result.response.status, 201);
  assert.ok(cookie.startsWith('zhirox_session='));

  result = await request('/api/v1/bootstrap', {
    method: 'POST',
    headers: { 'x-bootstrap-token': 'integration-bootstrap-token' },
    body: { marketName: 'Other', fullName: 'Other', username: 'other', password: 'SecurePass9', receiptPrefix: 'NEXT' },
  });
  assert.equal(result.response.status, 409);
});

test('server login uses protected credential and generic failures', async () => {
  cookie = '';
  let result = await request('/api/v1/login', { method: 'POST', body: { username: 'owner', password: 'wrong-password-1' } });
  assert.equal(result.response.status, 401);
  assert.equal(result.json.error, 'AUTH_INVALID_LOGIN');

  result = await request('/api/v1/login', { method: 'POST', body: { username: 'owner', password: 'SecurePass9' } });
  assert.equal(result.response.status, 200);
  assert.ok(cookie.startsWith('zhirox_session='));

  result = await request('/api/v1/session');
  assert.equal(result.response.status, 200);
  assert.equal(result.json.user.username, 'owner');
});

test('receipt reservation is idempotent and concurrency safe', async () => {
  const first = await request('/api/v1/receipts/reserve', {
    method: 'POST',
    headers: { 'idempotency-key': 'same-operation' },
    body: { businessDate: '2026-08-12' },
  });
  assert.equal(first.response.status, 201);
  assert.equal(first.json.receipt_number, 'MAIN-20260812-000001');

  const retry = await request('/api/v1/receipts/reserve', {
    method: 'POST',
    headers: { 'idempotency-key': 'same-operation' },
    body: { businessDate: '2026-08-12' },
  });
  assert.equal(retry.response.status, 200);
  assert.equal(retry.json.receipt_number, first.json.receipt_number);

  const requests = Array.from({ length: 20 }, (_, index) =>
    request('/api/v1/receipts/reserve', {
      method: 'POST',
      headers: { 'idempotency-key': `parallel-${index}` },
      body: { businessDate: '2026-08-12' },
    })
  );
  const results = await Promise.all(requests);
  assert.ok(results.every(result => result.response.status === 201));
  const numbers = results.map(result => result.json.receipt_number);
  assert.equal(new Set(numbers).size, 20);
  assert.ok(numbers.includes('MAIN-20260812-000021'));
});

test('idempotency key cannot be reused for a different request', async () => {
  const result = await request('/api/v1/receipts/reserve', {
    method: 'POST',
    headers: { 'idempotency-key': 'same-operation' },
    body: { businessDate: '2026-08-13' },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.json.error, 'IDEMPOTENCY_CONFLICT');
});

test('logout revokes opaque session', async () => {
  const logout = await request('/api/v1/logout', { method: 'POST' });
  assert.equal(logout.response.status, 200);
  const session = await request('/api/v1/session');
  assert.equal(session.response.status, 401);
});
''', encoding='utf-8')

(root / '.env.example').write_text(r'''NODE_ENV=production
PORT=8787
DATABASE_URL=postgresql://zhirox:change-me@127.0.0.1:5432/zhirox
APP_ORIGIN=https://pos.example.com
BOOTSTRAP_TOKEN=replace-with-64-random-characters
MARKET_TIME_ZONE=Asia/Baghdad
TRUST_PROXY=1
DB_POOL_SIZE=10
''', encoding='utf-8')

(root / 'README.md').write_text(r'''# ZHIROX POS Authoritative Server — v19

This service is the production authority for identity and receipt sequencing. It intentionally does **not** trust browser-local roles, passwords, or receipt counters.

## Security properties

- PostgreSQL-backed owner/user identity.
- Passwords use Node `scrypt` with a random salt; plaintext passwords are never stored.
- First bootstrap requires a deployment-only `BOOTSTRAP_TOKEN` and is disabled after the first user exists.
- Opaque sessions are stored only as SHA-256 token hashes; browser receives an HttpOnly SameSite=Strict cookie.
- Persistent database login throttling blocks repeated credential failures.
- Receipt sequence increments inside a PostgreSQL transaction.
- `Idempotency-Key` makes retries return the same reserved receipt instead of consuming/duplicating another receipt.
- Production POST requests can enforce the configured `APP_ORIGIN`.

## Remaining before multi-device financial writes

Receipt reservation is only the first authoritative write. Sales, payments, stock changes and journal entries still need a server transaction endpoint before multiple cashiers may write concurrently. Until that endpoint is wired, use the server for identity/receipt staging only and keep financial multi-writer mode disabled.
''', encoding='utf-8')

print('v19 authoritative server core generated')
