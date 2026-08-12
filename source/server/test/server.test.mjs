import assert from 'node:assert/strict';
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
