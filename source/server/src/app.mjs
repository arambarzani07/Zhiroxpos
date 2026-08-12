import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
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

const readJson = (req, maxBytes = JSON_LIMIT) => new Promise((resolve, reject) => {
  let bytes = 0;
  const chunks = [];
  req.on('data', chunk => {
    bytes += chunk.length;
    if (bytes > maxBytes) {
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
const validOperationId = value => /^[A-Za-z0-9._:-]{8,128}$/.test(String(value ?? ''));
const validEntityId = value => /^[A-Za-z0-9._:-]{3,128}$/.test(String(value ?? ''));
const validBarcode = value => typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 64;
const safeLimit = value => Math.min(500, Math.max(1, Number.parseInt(String(value || '200'), 10) || 200));
const safeStock = value => Number.isFinite(Number(value)) && Number(value) >= 0 && Math.round(Number(value) * 1000) === Number(value) * 1000;
const safeMoney = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0;

async function lockIdempotency(client, marketId, scope, key) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify([marketId, scope, key])]);
}


const safeSignedStock = value => Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 1_000_000 && Math.round(Number(value)*1000)===Number(value)*1000;
async function operationDeviceGate(client,user,req){const device=await registeredDevice(client,user,req);if(!device)return {error:'DEVICE_NOT_REGISTERED'};await lockBranchWriter(client,user);const leaseGate=await enforceWriterLease(client,user,device.id);if(leaseGate)return leaseGate;return {device};}
async function operationIdempotency(client,user,scope,key,requestHash){await lockIdempotency(client,user.market_id,scope,key);const existing=await client.query('SELECT request_hash,response_json FROM idempotency_keys WHERE market_id=$1 AND scope=$2 AND idempotency_key=$3',[user.market_id,scope,key]);if(existing.rows[0]){if(existing.rows[0].request_hash!==requestHash)return {conflict:true};return {cached:existing.rows[0].response_json};}return {};}
async function saveOperationIdempotency(client,user,scope,key,requestHash,payload){await client.query('INSERT INTO idempotency_keys (market_id,scope,idempotency_key,request_hash,response_json,user_id) VALUES ($1,$2,$3,$4,$5::jsonb,$6)',[user.market_id,scope,key,requestHash,JSON.stringify(payload),user.id]);}
async function originalPaidMethod(client,saleId){const result=await client.query('SELECT method FROM payments WHERE sale_id=$1 ORDER BY created_at,id LIMIT 1',[saleId]);return result.rows[0]?.method||'cash';}


const MANAGED_ROLES=new Set(['owner','admin','cashier','stock_staff','accountant']);
async function writeSecurityAudit(client,user,action,targetType,targetId,metadata={}){
  await client.query(`INSERT INTO security_audit (id,market_id,actor_user_id,action,target_type,target_id,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,[createId('sec-audit'),user.market_id,user.id,action,targetType,targetId||null,JSON.stringify(metadata)]);
}
async function activeOwnerCount(client,marketId){const result=await client.query(`SELECT count(*)::int AS count FROM users WHERE market_id=$1 AND role_type='owner' AND status='active'`,[marketId]);return result.rows[0].count;}


const validDeviceId = value => /^[A-Za-z0-9._:-]{8,128}$/.test(String(value ?? ''));
const deviceIdFromRequest = req => String(req.headers['x-device-id'] || '').trim();
const leaseSignature = (secret, leaseId, deviceId, expiresAt) => createHmac('sha256', secret).update(JSON.stringify([leaseId,deviceId,new Date(expiresAt).toISOString()])).digest('base64url');
const leaseToken = (secret, leaseId, deviceId, expiresAt) => `${leaseId}.${leaseSignature(secret,leaseId,deviceId,expiresAt)}`;
const safeTokenEqual = (left,right) => { const a=Buffer.from(String(left)); const b=Buffer.from(String(right)); return a.length===b.length && timingSafeEqual(a,b); };
const sqlDateString = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value ?? '').slice(0,10);

async function registeredDevice(client,user,req){
  const deviceId=deviceIdFromRequest(req);
  if(!validDeviceId(deviceId)) return null;
  const result=await client.query(`SELECT id,market_id,branch_id,status FROM devices WHERE id=$1 AND market_id=$2 AND branch_id=$3 AND status='active'`,[deviceId,user.market_id,user.branch_id]);
  return result.rows[0]||null;
}
async function lockBranchWriter(client,user,exclusive=false){
  const fn=exclusive?'pg_advisory_xact_lock':'pg_advisory_xact_lock_shared';
  await client.query(`SELECT ${fn}(hashtextextended($1,0))`,[JSON.stringify([user.market_id,user.branch_id,'branch-writer'])]);
}
async function activeOfflineLease(client,user){
  await client.query(`UPDATE offline_leases SET revoked_at=COALESCE(revoked_at,expires_at) WHERE market_id=$1 AND branch_id=$2 AND revoked_at IS NULL AND expires_at<=now()`,[user.market_id,user.branch_id]);
  const result=await client.query(`SELECT id,device_id,starts_at,expires_at,revoked_at FROM offline_leases WHERE market_id=$1 AND branch_id=$2 AND revoked_at IS NULL AND expires_at>now() ORDER BY starts_at DESC LIMIT 1`,[user.market_id,user.branch_id]);
  return result.rows[0]||null;
}
async function enforceWriterLease(client,user,deviceId){
  const lease=await activeOfflineLease(client,user);
  if(lease && lease.device_id!==deviceId) return {error:'BRANCH_OFFLINE_LEASE_ACTIVE',lease_expires_at:lease.expires_at};
  return null;
}
async function allocateReceiptBlock(client,user,deviceId,leaseId,date,size){
  const branch=await client.query(`SELECT receipt_prefix FROM branches WHERE id=$1 AND market_id=$2 AND status='active'`,[user.branch_id,user.market_id]);
  if(!branch.rows[0]) throw Object.assign(new Error('BRANCH_UNAVAILABLE'),{status:409});
  const seq=await client.query(`INSERT INTO receipt_sequences (market_id,branch_id,business_date,last_value) VALUES ($1,$2,$3::date,$4) ON CONFLICT (market_id,branch_id,business_date) DO UPDATE SET last_value=receipt_sequences.last_value+$4 RETURNING last_value`,[user.market_id,user.branch_id,date,size]);
  const end=Number(seq.rows[0].last_value),start=end-size+1,prefix=branch.rows[0].receipt_prefix,id=createId('receipt-block');
  await client.query(`INSERT INTO receipt_blocks (id,market_id,branch_id,device_id,lease_id,business_date,receipt_prefix,start_sequence,end_sequence) VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9)`,[id,user.market_id,user.branch_id,deviceId,leaseId,date,prefix,start,end]);
  return {id,business_date:date,receipt_prefix:prefix,start_sequence:start,end_sequence:end};
}
async function validateOfflineReceipt(client,user,deviceId,offline,secret){
  if(!offline||!secret||!validEntityId(offline.lease_id)||!validDate(offline.business_date)||!Number.isSafeInteger(Number(offline.sequence))) return {error:'INVALID_OFFLINE_RECEIPT'};
  const leaseResult=await client.query(`SELECT id,device_id,starts_at,expires_at,revoked_at,created_by FROM offline_leases WHERE id=$1 AND market_id=$2 AND branch_id=$3`,[String(offline.lease_id),user.market_id,user.branch_id]);
  const lease=leaseResult.rows[0]; if(!lease||lease.device_id!==deviceId)return {error:'OFFLINE_LEASE_INVALID'};
  const expected=leaseToken(secret,lease.id,deviceId,lease.expires_at); if(!safeTokenEqual(expected,String(offline.lease_token||'')))return {error:'OFFLINE_LEASE_INVALID'};
  const captured=new Date(String(offline.captured_at||'')); if(Number.isNaN(captured.getTime())||captured<new Date(lease.starts_at)||captured>new Date(lease.expires_at)||(lease.revoked_at&&captured>new Date(lease.revoked_at)))return {error:'OFFLINE_CAPTURE_OUTSIDE_LEASE'};
  const blockResult=await client.query(`SELECT id,receipt_prefix,start_sequence,end_sequence,business_date FROM receipt_blocks WHERE id=$1 AND lease_id=$2 AND device_id=$3 AND market_id=$4 AND branch_id=$5`,[String(offline.block_id),lease.id,deviceId,user.market_id,user.branch_id]);
  const block=blockResult.rows[0]; const sequence=Number(offline.sequence); if(!block||sqlDateString(block.business_date)!==String(offline.business_date)||sequence<Number(block.start_sequence)||sequence>Number(block.end_sequence))return {error:'OFFLINE_RECEIPT_BLOCK_INVALID'};
  const receiptNumber=`${block.receipt_prefix}-${String(offline.business_date).replaceAll('-','')}-${String(sequence).padStart(6,'0')}`;
  if(receiptNumber!==String(offline.receipt_number||''))return {error:'OFFLINE_RECEIPT_NUMBER_INVALID'};
  return {receiptNumber,capturedByUserId:lease.created_by};
}

const validPaymentMethod = value => ['cash', 'card', 'bank', 'debt', 'mixed'].includes(String(value ?? ''));

const stableSaleHash = body => sha256(JSON.stringify({
  client_operation_id: body.client_operation_id,
  customer_id: body.customer_id || null,
  payment_method: body.payment_method,
  paid_method: body.paid_method || null,
  paid_iqd: body.paid_iqd,
  discount_iqd: body.discount_iqd || 0,
  items: [...body.items].map(item => ({ product_id: item.product_id, quantity: Number(item.quantity) })).sort((a, b) => a.product_id.localeCompare(b.product_id)),
  offline_receipt: body.offline_receipt ? { lease_id:body.offline_receipt.lease_id, block_id:body.offline_receipt.block_id, receipt_number:body.offline_receipt.receipt_number, sequence:Number(body.offline_receipt.sequence), business_date:body.offline_receipt.business_date, captured_at:body.offline_receipt.captured_at } : null,
}));

async function nextReceipt(client, user, date) {
  const branch = await client.query(
    'SELECT receipt_prefix FROM branches WHERE id = $1 AND market_id = $2 AND status = $3',
    [user.branch_id, user.market_id, 'active']
  );
  if (!branch.rows[0]) throw Object.assign(new Error('BRANCH_UNAVAILABLE'), { status: 409 });
  const sequence = await client.query(
    `INSERT INTO receipt_sequences (market_id, branch_id, business_date, last_value)
     VALUES ($1, $2, $3::date, 1)
     ON CONFLICT (market_id, branch_id, business_date)
     DO UPDATE SET last_value = receipt_sequences.last_value + 1
     RETURNING last_value`,
    [user.market_id, user.branch_id, date]
  );
  const number = Number(sequence.rows[0].last_value);
  return {
    sequence: number,
    receiptNumber: `${branch.rows[0].receipt_prefix}-${date.replaceAll('-', '')}-${String(number).padStart(6, '0')}`,
  };
}

function paymentAccount(method) {
  if (method === 'cash') return '1100-CASH';
  if (method === 'card') return '1110-CARD-CLEARING';
  if (method === 'bank') return '1120-BANK';
  return null;
}


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
    `SELECT u.id, u.market_id, u.branch_id, u.username, u.full_name, u.role_type, u.status, s.id AS session_id,
            m.name AS market_name, m.currency AS market_currency, m.status AS market_status,
            m.created_at AS market_created_at, m.updated_at AS market_updated_at,
            b.name AS branch_name, b.is_main AS branch_is_main, b.status AS branch_status,
            b.created_at AS branch_created_at, b.updated_at AS branch_updated_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN markets m ON m.id = u.market_id
       LEFT JOIN branches b ON b.id = u.branch_id
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

const publicContext = row => ({
  user: publicUser(row),
  market: {
    id: row.market_id,
    name: row.market_name,
    currency: row.market_currency,
    status: row.market_status,
    created_at: row.market_created_at,
    updated_at: row.market_updated_at,
  },
  branch: row.branch_id ? {
    id: row.branch_id,
    market_id: row.market_id,
    name: row.branch_name,
    is_main: Boolean(row.branch_is_main),
    status: row.branch_status,
    created_at: row.branch_created_at,
    updated_at: row.branch_updated_at,
  } : null,
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
    offlineLeaseSecret: configInput.offlineLeaseSecret ?? process.env.OFFLINE_LEASE_SECRET ?? '',
  };

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/health') {
        await pool.query('SELECT 1');
        return json(res, 200, { ok: true, service: 'zhirox-pos-server' });
      }

      if (req.method === 'POST') assertOrigin(req, config);

      if (req.method === 'GET' && url.pathname === '/api/v1/bootstrap/status') {
        const count = await pool.query('SELECT count(*)::int AS count FROM users');
        return json(res, 200, { needs_bootstrap: count.rows[0].count === 0 });
      }

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
          return {
            status: 201,
            body: {
              user,
              market: { id: marketId, name: String(body.marketName).trim(), currency: 'IQD', status: 'active', created_at: now, updated_at: now },
              branch: { id: branchId, market_id: marketId, name: String(body.branchName ?? 'لقی سەرەکی').trim(), is_main: true, status: 'active', created_at: now, updated_at: now },
            },
            cookie: session.cookie,
          };
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
            `SELECT u.id, u.market_id, u.branch_id, u.username, u.full_name, u.role_type, u.status, u.password_salt, u.password_hash,
                    m.name AS market_name, m.currency AS market_currency, m.status AS market_status,
                    m.created_at AS market_created_at, m.updated_at AS market_updated_at,
                    b.name AS branch_name, b.is_main AS branch_is_main, b.status AS branch_status,
                    b.created_at AS branch_created_at, b.updated_at AS branch_updated_at
               FROM users u
               JOIN markets m ON m.id = u.market_id
               LEFT JOIN branches b ON b.id = u.branch_id
              WHERE lower(u.username) = $1 LIMIT 1`,
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
          return { status: 200, body: publicContext(row), cookie: session.cookie };
        });
        return json(res, result.status, result.body, result.cookie ? { 'set-cookie': result.cookie } : {});
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/session') {
        const user = await authenticate(pool, req);
        return user ? json(res, 200, publicContext(user)) : json(res, 401, { error: 'AUTH_REQUIRED' });
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/logout') {
        const cookies = parseCookies(req.headers.cookie);
        if (cookies.zhirox_session) {
          await pool.query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sha256(cookies.zhirox_session)]);
        }
        return json(res, 200, { ok: true }, { 'set-cookie': clearSessionCookie({ production: config.production }) });
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/catalog/products/save') {
        const user = await authenticate(pool, req);
        if (!user) return json(res, 401, { error: 'AUTH_REQUIRED' });
        if (!['owner','admin','stock_staff'].includes(user.role_type)) return json(res, 403, { error: 'PERMISSION_DENIED' });
        if (!user.branch_id) return json(res, 409, { error: 'BRANCH_REQUIRED' });
        const key = String(req.headers['idempotency-key'] || '').trim();
        if (!key || key.length > 128) return json(res, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' });
        const body = await readJson(req);
        const id = body.id ? String(body.id) : null;
        const barcode = String(body.barcode || '').trim();
        const name = String(body.name || '').trim();
        const expectedVersion = id ? Number(body.version) : null;
        if ((id && (!validEntityId(id) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1)) || !validBarcode(barcode) || !name || name.length > 300 || !safeMoney(body.cost_price_iqd) || !safeMoney(body.sale_price_iqd) || !safeStock(body.stock_quantity || 0) || !safeStock(body.low_stock_limit || 0)) {
          return json(res, 422, { error: 'INVALID_PRODUCT' });
        }
        const normalized = {
          id, barcode, name, name_en: body.name_en ? String(body.name_en).slice(0,300) : null,
          description: body.description ? String(body.description).slice(0,2000) : null,
          unit: String(body.unit || 'دانە').slice(0,50), cost: Number(body.cost_price_iqd), sale: Number(body.sale_price_iqd),
          stock: Number(body.stock_quantity || 0), low: Number(body.low_stock_limit || 0), currency: body.currency === 'USD' ? 'USD' : 'IQD',
          is_trackable: body.is_trackable !== false, status: body.status === 'inactive' ? 'inactive' : 'active',
          image_url: body.image_url ? String(body.image_url).slice(0,2000) : null,
          barcodes: Array.isArray(body.barcodes) ? [...new Set(body.barcodes.map(value => String(value).trim()).filter(value => validBarcode(value) && value !== barcode))].slice(0,20) : [],
          category_id: body.category_id && validEntityId(body.category_id) ? String(body.category_id) : null,
          version: expectedVersion,
        };
        const requestHash = sha256(JSON.stringify(normalized));
        const result = await withTransaction(pool, async client => {
          const device=await registeredDevice(client,user,req); if(!device)return {status:409,body:{error:'DEVICE_NOT_REGISTERED'}}; await lockBranchWriter(client,user); const leaseGate=await enforceWriterLease(client,user,device.id); if(leaseGate)return {status:423,body:leaseGate}; await lockIdempotency(client, user.market_id, 'products.save', key);
          const existing = await client.query(`SELECT request_hash,response_json FROM idempotency_keys WHERE market_id=$1 AND scope='products.save' AND idempotency_key=$2`, [user.market_id,key]);
          if (existing.rows[0]) {
            if (existing.rows[0].request_hash !== requestHash) return { status:409, body:{error:'IDEMPOTENCY_CONFLICT'} };
            return { status:200, body:existing.rows[0].response_json };
          }
          const barcodeConflict = await client.query('SELECT id FROM products WHERE market_id=$1 AND barcode=$2 AND ($3::text IS NULL OR id<>$3) LIMIT 1', [user.market_id,barcode,id]);
          if (barcodeConflict.rows[0]) return { status:409, body:{error:'BARCODE_DUPLICATE'} };
          let saved;
          if (!id) {
            saved = await client.query(
              `INSERT INTO products (id,market_id,branch_id,category_id,barcode,barcodes,name,name_en,description,unit,cost_price_iqd,sale_price_iqd,currency,stock_quantity,low_stock_limit,image_url,is_trackable,status,created_by)
               VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
               RETURNING *`,
              [createId('product'),user.market_id,user.branch_id,normalized.category_id,barcode,JSON.stringify(normalized.barcodes),name,normalized.name_en,normalized.description,normalized.unit,normalized.cost,normalized.sale,normalized.currency,normalized.stock,normalized.low,normalized.image_url,normalized.is_trackable,normalized.status,user.id]
            );
          } else {
            const before = await client.query('SELECT stock_quantity FROM products WHERE id=$1 AND market_id=$2 AND branch_id=$3 FOR UPDATE', [id,user.market_id,user.branch_id]);
            if (!before.rows[0]) return { status:404, body:{error:'PRODUCT_NOT_FOUND'} };
            saved = await client.query(
              `UPDATE products SET category_id=$1,barcode=$2,barcodes=$3::jsonb,name=$4,name_en=$5,description=$6,unit=$7,cost_price_iqd=$8,sale_price_iqd=$9,currency=$10,stock_quantity=$11,low_stock_limit=$12,image_url=$13,is_trackable=$14,status=$15,version=version+1,updated_at=now()
                WHERE id=$16 AND market_id=$17 AND branch_id=$18 AND version=$19
                RETURNING *`,
              [normalized.category_id,barcode,JSON.stringify(normalized.barcodes),name,normalized.name_en,normalized.description,normalized.unit,normalized.cost,normalized.sale,normalized.currency,normalized.stock,normalized.low,normalized.image_url,normalized.is_trackable,normalized.status,id,user.market_id,user.branch_id,expectedVersion]
            );
            if (saved.rows[0] && Number(before.rows[0].stock_quantity) !== normalized.stock) {
              await client.query(
                `INSERT INTO stock_movements (id,market_id,branch_id,product_id,movement_type,quantity_delta,stock_before,stock_after,reference_type,reference_id,created_by)
                 VALUES ($1,$2,$3,$4,'adjustment',$5,$6,$7,'product.save',$8,$9)`,
                [createId('stock'),user.market_id,user.branch_id,id,normalized.stock-Number(before.rows[0].stock_quantity),Number(before.rows[0].stock_quantity),normalized.stock,key,user.id]
              );
            }
            if (!saved.rows[0]) {
              const current = await client.query('SELECT version FROM products WHERE id=$1 AND market_id=$2 AND branch_id=$3', [id,user.market_id,user.branch_id]);
              return current.rows[0] ? { status:409, body:{error:'VERSION_CONFLICT', current_version:Number(current.rows[0].version)} } : { status:404, body:{error:'PRODUCT_NOT_FOUND'} };
            }
          }
          const row = saved.rows[0];
          const payload = { product:{...row,cost_price_iqd:Number(row.cost_price_iqd),sale_price_iqd:Number(row.sale_price_iqd),stock_quantity:Number(row.stock_quantity),low_stock_limit:Number(row.low_stock_limit),version:Number(row.version)} };
          await client.query(`INSERT INTO idempotency_keys (market_id,scope,idempotency_key,request_hash,response_json,user_id) VALUES ($1,'products.save',$2,$3,$4::jsonb,$5)`, [user.market_id,key,requestHash,JSON.stringify(payload),user.id]);
          return { status:id?200:201, body:payload };
        });
        return json(res,result.status,result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/customers/save') {
        const user = await authenticate(pool, req);
        if (!user) return json(res,401,{error:'AUTH_REQUIRED'});
        if (!['owner','admin'].includes(user.role_type)) return json(res,403,{error:'PERMISSION_DENIED'});
        const key = String(req.headers['idempotency-key'] || '').trim();
        if (!key || key.length > 128) return json(res,400,{error:'IDEMPOTENCY_KEY_REQUIRED'});
        const body = await readJson(req);
        const id = body.id ? String(body.id) : null;
        const name = String(body.name || '').trim();
        const code = String(body.code || '').trim();
        const version = id ? Number(body.version) : null;
        const debtLimit = body.debt_limit_iqd === null || body.debt_limit_iqd === undefined || body.debt_limit_iqd === '' ? null : Number(body.debt_limit_iqd);
        if ((id && (!validEntityId(id) || !Number.isSafeInteger(version) || version < 1)) || !name || name.length>300 || !code || code.length>64 || (debtLimit!==null && (!Number.isSafeInteger(debtLimit)||debtLimit<0))) return json(res,422,{error:'INVALID_CUSTOMER'});
        const normalized = { id,name,code,phone:body.phone?String(body.phone).slice(0,100):null,address:body.address?String(body.address).slice(0,1000):null,notes:body.notes?String(body.notes).slice(0,2000):null,debt_limit_iqd:debtLimit,status:body.status==='blocked'?'blocked':'active',version };
        const requestHash = sha256(JSON.stringify(normalized));
        const result = await withTransaction(pool,async client=>{
          const device=await registeredDevice(client,user,req); if(!device)return {status:409,body:{error:'DEVICE_NOT_REGISTERED'}}; await lockBranchWriter(client,user); const leaseGate=await enforceWriterLease(client,user,device.id); if(leaseGate)return {status:423,body:leaseGate}; await lockIdempotency(client,user.market_id,'customers.save',key);
          const existing=await client.query(`SELECT request_hash,response_json FROM idempotency_keys WHERE market_id=$1 AND scope='customers.save' AND idempotency_key=$2`,[user.market_id,key]);
          if(existing.rows[0]){ if(existing.rows[0].request_hash!==requestHash)return {status:409,body:{error:'IDEMPOTENCY_CONFLICT'}}; return {status:200,body:existing.rows[0].response_json}; }
          const codeConflict=await client.query('SELECT id FROM customers WHERE market_id=$1 AND code=$2 AND ($3::text IS NULL OR id<>$3) LIMIT 1',[user.market_id,code,id]);
          if(codeConflict.rows[0])return {status:409,body:{error:'CUSTOMER_CODE_DUPLICATE'}};
          let saved;
          if(!id){
            saved=await client.query(`INSERT INTO customers (id,market_id,code,name,phone,address,notes,debt_limit_iqd,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[createId('customer'),user.market_id,code,name,normalized.phone,normalized.address,normalized.notes,debtLimit,normalized.status,user.id]);
          } else {
            saved=await client.query(`UPDATE customers SET code=$1,name=$2,phone=$3,address=$4,notes=$5,debt_limit_iqd=$6,status=$7,version=version+1,updated_at=now() WHERE id=$8 AND market_id=$9 AND version=$10 RETURNING *`,[code,name,normalized.phone,normalized.address,normalized.notes,debtLimit,normalized.status,id,user.market_id,version]);
            if(!saved.rows[0]){ const current=await client.query('SELECT version FROM customers WHERE id=$1 AND market_id=$2',[id,user.market_id]); return current.rows[0]?{status:409,body:{error:'VERSION_CONFLICT',current_version:Number(current.rows[0].version)}}:{status:404,body:{error:'CUSTOMER_NOT_FOUND'}}; }
          }
          const row=saved.rows[0];
          const balance=await client.query('SELECT COALESCE(balance_iqd,0) AS balance_iqd FROM customer_balances WHERE market_id=$1 AND customer_id=$2',[user.market_id,row.id]);
          const payload={customer:{...row,debt_limit_iqd:row.debt_limit_iqd===null?null:Number(row.debt_limit_iqd),version:Number(row.version),balance_iqd:Number(balance.rows[0]?.balance_iqd||0)}};
          await client.query(`INSERT INTO idempotency_keys (market_id,scope,idempotency_key,request_hash,response_json,user_id) VALUES ($1,'customers.save',$2,$3,$4::jsonb,$5)`,[user.market_id,key,requestHash,JSON.stringify(payload),user.id]);
          return {status:id?200:201,body:payload};
        });
        return json(res,result.status,result.body);
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/users') {
        const user=await authenticate(pool,req); if(!user)return json(res,401,{error:'AUTH_REQUIRED'}); if(user.role_type!=='owner')return json(res,403,{error:'PERMISSION_DENIED'});
        const result=await pool.query(`SELECT id,market_id,branch_id,username,full_name,role_type,status,last_login_at,version,created_at,updated_at FROM users WHERE market_id=$1 ORDER BY created_at,id`,[user.market_id]);
        return json(res,200,{items:result.rows.map(row=>({...row,version:Number(row.version)}))});
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/users/save') {
        const user=await authenticate(pool,req); if(!user)return json(res,401,{error:'AUTH_REQUIRED'}); if(user.role_type!=='owner')return json(res,403,{error:'PERMISSION_DENIED'});
        const body=await readJson(req); const id=body.id?String(body.id):null; const username=normalizeUsername(body.username); const fullName=String(body.full_name||'').trim(); const role=String(body.role_type||''); const status=body.status==='blocked'?'blocked':body.status==='inactive'?'inactive':'active'; const branchId=String(body.branch_id||user.branch_id||''); const version=id?Number(body.version):null;
        if((id&&(!validEntityId(id)||!Number.isSafeInteger(version)||version<1))||username.length<3||username.length>100||!fullName||fullName.length>300||!MANAGED_ROLES.has(role)||!validEntityId(branchId))return json(res,422,{error:'INVALID_USER'});
        if(!id&&!validatePasswordPolicy(String(body.password||'')))return json(res,422,{error:'PASSWORD_POLICY'});
        const result=await withTransaction(pool,async client=>{
          await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([user.market_id,'users.manage'])]);
          const branch=await client.query(`SELECT id FROM branches WHERE id=$1 AND market_id=$2 AND status='active'`,[branchId,user.market_id]); if(!branch.rows[0])return {status:409,body:{error:'BRANCH_UNAVAILABLE'}};
          const duplicate=await client.query(`SELECT id FROM users WHERE market_id=$1 AND lower(username)=$2 AND ($3::text IS NULL OR id<>$3) LIMIT 1`,[user.market_id,username,id]); if(duplicate.rows[0])return {status:409,body:{error:'USERNAME_DUPLICATE'}};
          if(!id){
            const password=await derivePassword(String(body.password)); const newId=createId('user');
            const saved=await client.query(`INSERT INTO users (id,market_id,branch_id,username,full_name,role_type,password_salt,password_hash,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,market_id,branch_id,username,full_name,role_type,status,last_login_at,version,created_at,updated_at`,[newId,user.market_id,branchId,username,fullName,role,password.saltHex,password.hashHex,status]);
            await writeSecurityAudit(client,user,'user.created','user',newId,{username,role_type:role,status,branch_id:branchId}); return {status:201,body:{user:{...saved.rows[0],version:Number(saved.rows[0].version)}}};
          }
          const currentResult=await client.query(`SELECT id,role_type,status,version FROM users WHERE id=$1 AND market_id=$2 FOR UPDATE`,[id,user.market_id]); const current=currentResult.rows[0]; if(!current)return {status:404,body:{error:'USER_NOT_FOUND'}};
          if(id===user.id&&(role!=='owner'||status!=='active'))return {status:409,body:{error:'CANNOT_DEMOTE_OR_BLOCK_SELF'}};
          if(current.role_type==='owner'&&(role!=='owner'||status!=='active')&&(await activeOwnerCount(client,user.market_id))<=1)return {status:409,body:{error:'LAST_OWNER_REQUIRED'}};
          const saved=await client.query(`UPDATE users SET branch_id=$1,username=$2,full_name=$3,role_type=$4,status=$5,version=version+1,updated_at=now() WHERE id=$6 AND market_id=$7 AND version=$8 RETURNING id,market_id,branch_id,username,full_name,role_type,status,last_login_at,version,created_at,updated_at`,[branchId,username,fullName,role,status,id,user.market_id,version]);
          if(!saved.rows[0])return {status:409,body:{error:'VERSION_CONFLICT',current_version:Number(current.version)}};
          if(current.role_type!==role||current.status!==status)await client.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',[id]);
          await writeSecurityAudit(client,user,'user.updated','user',id,{role_type:role,status,branch_id:branchId}); return {status:200,body:{user:{...saved.rows[0],version:Number(saved.rows[0].version)}}};
        }); return json(res,result.status,result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/users/reset-password') {
        const user=await authenticate(pool,req); if(!user)return json(res,401,{error:'AUTH_REQUIRED'}); if(user.role_type!=='owner')return json(res,403,{error:'PERMISSION_DENIED'});
        const body=await readJson(req); const targetId=String(body.user_id||''); const password=String(body.new_password||''); if(!validEntityId(targetId)||!validatePasswordPolicy(password))return json(res,422,{error:'PASSWORD_POLICY'});
        const result=await withTransaction(pool,async client=>{const target=await client.query('SELECT id FROM users WHERE id=$1 AND market_id=$2 FOR UPDATE',[targetId,user.market_id]);if(!target.rows[0])return {status:404,body:{error:'USER_NOT_FOUND'}};const derived=await derivePassword(password);await client.query('UPDATE users SET password_salt=$1,password_hash=$2,version=version+1,updated_at=now() WHERE id=$3',[derived.saltHex,derived.hashHex,targetId]);await client.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',[targetId]);await writeSecurityAudit(client,user,'user.password_reset','user',targetId,{});return {status:200,body:{ok:true}};});return json(res,result.status,result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/users/revoke-sessions') {
        const user=await authenticate(pool,req); if(!user)return json(res,401,{error:'AUTH_REQUIRED'}); if(user.role_type!=='owner')return json(res,403,{error:'PERMISSION_DENIED'});
        const body=await readJson(req); const targetId=String(body.user_id||''); if(!validEntityId(targetId))return json(res,422,{error:'INVALID_USER'});
        const result=await withTransaction(pool,async client=>{const target=await client.query('SELECT id FROM users WHERE id=$1 AND market_id=$2',[targetId,user.market_id]);if(!target.rows[0])return {status:404,body:{error:'USER_NOT_FOUND'}};const revoked=await client.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1 AND revoked_at IS NULL RETURNING id',[targetId]);await writeSecurityAudit(client,user,'user.sessions_revoked','user',targetId,{sessions:revoked.rowCount||0});return {status:200,body:{ok:true,revoked:revoked.rowCount||0}};});return json(res,result.status,result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/devices/register') {
        const user=await authenticate(pool,req); if(!user)return json(res,401,{error:'AUTH_REQUIRED'}); if(!user.branch_id)return json(res,409,{error:'BRANCH_REQUIRED'});
        const body=await readJson(req); const deviceId=String(body.device_id||'').trim(); const label=String(body.label||'POS Device').trim().slice(0,200);
        if(!validDeviceId(deviceId)||!label)return json(res,422,{error:'INVALID_DEVICE'});
        const result=await withTransaction(pool,async client=>{
          const existing=await client.query('SELECT market_id,branch_id,status FROM devices WHERE id=$1 FOR UPDATE',[deviceId]);
          if(existing.rows[0]&&(existing.rows[0].market_id!==user.market_id||existing.rows[0].branch_id!==user.branch_id))return {status:409,body:{error:'DEVICE_ID_CONFLICT'}};
          await client.query(`INSERT INTO devices (id,market_id,branch_id,label,registered_by,last_seen_at) VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT (id) DO UPDATE SET label=EXCLUDED.label,last_seen_at=now(),status='active'`,[deviceId,user.market_id,user.branch_id,label,user.id]);
          return {status:200,body:{device_id:deviceId,market_id:user.market_id,branch_id:user.branch_id}};
        }); return json(res,result.status,result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/offline/lease/acquire') {
        const user=await authenticate(pool,req); if(!user)return json(res,401,{error:'AUTH_REQUIRED'}); if(!['owner','admin','cashier'].includes(user.role_type))return json(res,403,{error:'PERMISSION_DENIED'}); if(!user.branch_id)return json(res,409,{error:'BRANCH_REQUIRED'});
        if(!config.offlineLeaseSecret)return json(res,503,{error:'OFFLINE_LEASE_NOT_CONFIGURED'});
        const key=String(req.headers['idempotency-key']||'').trim(); if(!key||key.length>128)return json(res,400,{error:'IDEMPOTENCY_KEY_REQUIRED'});
        const body=await readJson(req); const minutes=Math.min(240,Math.max(5,Number.parseInt(String(body.duration_minutes||30),10)||30)); const blockSize=Math.min(500,Math.max(10,Number.parseInt(String(body.block_size||100),10)||100)); const date=body.business_date?String(body.business_date):businessDate(config.timeZone); if(!validDate(date))return json(res,422,{error:'INVALID_BUSINESS_DATE'});
        const deviceId=deviceIdFromRequest(req); const requestHash=sha256(JSON.stringify({deviceId,minutes,blockSize,date}));
        const result=await withTransaction(pool,async client=>{
          const device=await registeredDevice(client,user,req); if(!device)return {status:409,body:{error:'DEVICE_NOT_REGISTERED'}};
          await lockBranchWriter(client,user,true); await lockIdempotency(client,user.market_id,'offline.lease.acquire',key);
          const existingKey=await client.query(`SELECT request_hash,response_json FROM idempotency_keys WHERE market_id=$1 AND scope='offline.lease.acquire' AND idempotency_key=$2`,[user.market_id,key]);
          if(existingKey.rows[0]){if(existingKey.rows[0].request_hash!==requestHash)return {status:409,body:{error:'IDEMPOTENCY_CONFLICT'}};const meta=existingKey.rows[0].response_json;return {status:200,body:{...meta,lease_token:leaseToken(config.offlineLeaseSecret,meta.lease_id,meta.device_id,meta.expires_at)}};}
          const active=await activeOfflineLease(client,user); if(active)return {status:409,body:{error:'OFFLINE_LEASE_ALREADY_ACTIVE',device_id:active.device_id,expires_at:active.expires_at}};
          const leaseId=createId('offline-lease'),starts=new Date(),expires=new Date(starts.getTime()+minutes*60_000);
          await client.query(`INSERT INTO offline_leases (id,market_id,branch_id,device_id,starts_at,expires_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[leaseId,user.market_id,user.branch_id,deviceId,starts,expires,user.id]);
          const block=await allocateReceiptBlock(client,user,deviceId,leaseId,date,blockSize); const meta={lease_id:leaseId,device_id:deviceId,starts_at:starts.toISOString(),expires_at:expires.toISOString(),block};
          await client.query(`INSERT INTO idempotency_keys (market_id,scope,idempotency_key,request_hash,response_json,user_id) VALUES ($1,'offline.lease.acquire',$2,$3,$4::jsonb,$5)`,[user.market_id,key,requestHash,JSON.stringify(meta),user.id]);
          return {status:201,body:{...meta,lease_token:leaseToken(config.offlineLeaseSecret,leaseId,deviceId,expires)}};
        }); return json(res,result.status,result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/offline/lease/release') {
        const user=await authenticate(pool,req); if(!user)return json(res,401,{error:'AUTH_REQUIRED'}); if(!user.branch_id)return json(res,409,{error:'BRANCH_REQUIRED'}); const body=await readJson(req); const deviceId=deviceIdFromRequest(req);
        const result=await withTransaction(pool,async client=>{await lockBranchWriter(client,user,true);const lease=await client.query(`SELECT id,device_id,expires_at FROM offline_leases WHERE id=$1 AND market_id=$2 AND branch_id=$3 FOR UPDATE`,[String(body.lease_id||''),user.market_id,user.branch_id]);if(!lease.rows[0]||lease.rows[0].device_id!==deviceId)return {status:404,body:{error:'OFFLINE_LEASE_NOT_FOUND'}};const expected=leaseToken(config.offlineLeaseSecret,lease.rows[0].id,deviceId,lease.rows[0].expires_at);if(!safeTokenEqual(expected,String(body.lease_token||'')))return {status:403,body:{error:'OFFLINE_LEASE_INVALID'}};await client.query('UPDATE offline_leases SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1',[lease.rows[0].id]);return {status:200,body:{ok:true}};}); return json(res,result.status,result.body);
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/catalog/products/lookup') {
        const user=await authenticate(pool,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});const barcode=String(url.searchParams.get('barcode')||'').trim();if(!validBarcode(barcode))return json(res,422,{error:'INVALID_BARCODE'});
        const result=await pool.query(`SELECT id,market_id,branch_id,category_id,barcode,barcodes,name,name_en,description,unit,cost_price_iqd,sale_price_iqd,currency,stock_quantity,low_stock_limit,image_url,is_trackable,status,version,created_at,updated_at FROM products WHERE market_id=$1 AND status='active' AND (barcode=$2 OR barcodes ? $2) ORDER BY (barcode=$2) DESC LIMIT 1`,[user.market_id,barcode]);
        if(!result.rows[0])return json(res,404,{error:'PRODUCT_NOT_FOUND'});const row=result.rows[0];return json(res,200,{product:{...row,cost_price_iqd:Number(row.cost_price_iqd),sale_price_iqd:Number(row.sale_price_iqd),stock_quantity:Number(row.stock_quantity),low_stock_limit:Number(row.low_stock_limit),version:Number(row.version)}});
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/catalog/products') {
        const user = await authenticate(pool, req);
        if (!user) return json(res, 401, { error: 'AUTH_REQUIRED' });
        const limit = safeLimit(url.searchParams.get('limit'));
        const afterId = String(url.searchParams.get('after_id') || '');
        const result = await pool.query(
          `SELECT id, market_id, branch_id, category_id, barcode, barcodes, name, name_en, description, unit,
                  cost_price_iqd, sale_price_iqd, currency, stock_quantity, low_stock_limit, image_url,
                  is_trackable, status, version, created_at, updated_at
             FROM products
            WHERE market_id = $1 AND ($2 = '' OR id > $2)
            ORDER BY id
            LIMIT $3`,
          [user.market_id, afterId, limit + 1]
        );
        const hasMore = result.rows.length > limit;
        const rows = result.rows.slice(0, limit).map(row => ({
          ...row,
          cost_price_iqd: Number(row.cost_price_iqd), sale_price_iqd: Number(row.sale_price_iqd),
          stock_quantity: Number(row.stock_quantity), low_stock_limit: Number(row.low_stock_limit), version: Number(row.version),
        }));
        return json(res, 200, { items: rows, next_after_id: hasMore ? rows.at(-1)?.id || null : null });
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/catalog/products/import') {
        const user = await authenticate(pool, req);
        if (!user) return json(res, 401, { error: 'AUTH_REQUIRED' });
        if (!['owner','admin','stock_staff'].includes(user.role_type)) return json(res, 403, { error: 'PERMISSION_DENIED' });
        if (!user.branch_id) return json(res, 409, { error: 'BRANCH_REQUIRED' });
        const key = String(req.headers['idempotency-key'] || '').trim();
        if (!key || key.length > 128) return json(res, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' });
        const body = await readJson(req, 2 * 1024 * 1024);
        if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 500) return json(res, 422, { error: 'INVALID_IMPORT_BATCH' });
        const normalized = [];
        const seenBarcodes = new Set();
        for (const raw of body.items) {
          const barcode = String(raw.barcode || '').trim();
          const name = String(raw.name || '').trim();
          if (!validBarcode(barcode) || !name || name.length > 300 || !safeMoney(raw.cost_price_iqd) || !safeMoney(raw.sale_price_iqd) || !safeStock(raw.stock_quantity || 0) || !safeStock(raw.low_stock_limit || 0)) {
            return json(res, 422, { error: 'INVALID_PRODUCT', barcode });
          }
          if (seenBarcodes.has(barcode)) return json(res, 422, { error: 'DUPLICATE_BARCODE_IN_BATCH', barcode });
          seenBarcodes.add(barcode);
          const extraBarcodes = Array.isArray(raw.barcodes) ? [...new Set(raw.barcodes.map(value => String(value).trim()).filter(value => validBarcode(value) && value !== barcode))].slice(0, 20) : [];
          normalized.push({
            source_id: validEntityId(raw.id) ? String(raw.id) : null,
            barcode, extraBarcodes, name, name_en: raw.name_en ? String(raw.name_en).slice(0, 300) : null,
            description: raw.description ? String(raw.description).slice(0, 2000) : null,
            unit: String(raw.unit || 'دانە').slice(0, 50),
            cost: Number(raw.cost_price_iqd), sale: Number(raw.sale_price_iqd), stock: Number(raw.stock_quantity || 0), low: Number(raw.low_stock_limit || 0),
            currency: raw.currency === 'USD' ? 'USD' : 'IQD', is_trackable: raw.is_trackable !== false,
            status: raw.status === 'inactive' ? 'inactive' : 'active', image_url: raw.image_url ? String(raw.image_url).slice(0, 2000) : null,
          });
        }
        const requestHash = sha256(JSON.stringify(normalized));
        const result = await withTransaction(pool, async client => {
          const device=await registeredDevice(client,user,req); if(!device)return {status:409,body:{error:'DEVICE_NOT_REGISTERED'}}; await lockBranchWriter(client,user); const leaseGate=await enforceWriterLease(client,user,device.id); if(leaseGate)return {status:423,body:leaseGate}; await lockIdempotency(client, user.market_id, 'products.import', key);
          const existing = await client.query(
            `SELECT request_hash, response_json FROM idempotency_keys WHERE market_id=$1 AND scope='products.import' AND idempotency_key=$2`,
            [user.market_id, key]
          );
          if (existing.rows[0]) {
            if (existing.rows[0].request_hash !== requestHash) return { status: 409, body: { error: 'IDEMPOTENCY_CONFLICT' } };
            return { status: 200, body: existing.rows[0].response_json };
          }
          const output = [];
          for (const item of normalized) {
            const id = item.source_id || createId('product');
            const saved = await client.query(
              `INSERT INTO products (id, market_id, branch_id, barcode, barcodes, name, name_en, description, unit, cost_price_iqd, sale_price_iqd, currency, stock_quantity, low_stock_limit, image_url, is_trackable, status, created_by)
               VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
               ON CONFLICT (market_id, barcode) DO UPDATE SET
                 branch_id=EXCLUDED.branch_id, barcodes=EXCLUDED.barcodes, name=EXCLUDED.name, name_en=EXCLUDED.name_en,
                 description=EXCLUDED.description, unit=EXCLUDED.unit, cost_price_iqd=EXCLUDED.cost_price_iqd,
                 sale_price_iqd=EXCLUDED.sale_price_iqd, currency=EXCLUDED.currency, stock_quantity=EXCLUDED.stock_quantity,
                 low_stock_limit=EXCLUDED.low_stock_limit, image_url=EXCLUDED.image_url, is_trackable=EXCLUDED.is_trackable,
                 status=EXCLUDED.status, version=products.version+1, updated_at=now()
               RETURNING id, barcode, version`,
              [id, user.market_id, user.branch_id, item.barcode, JSON.stringify(item.extraBarcodes), item.name, item.name_en, item.description, item.unit, item.cost, item.sale, item.currency, item.stock, item.low, item.image_url, item.is_trackable, item.status, user.id]
            );
            output.push({ source_id: item.source_id, server_id: saved.rows[0].id, barcode: saved.rows[0].barcode, version: Number(saved.rows[0].version) });
          }
          const payload = { imported: output.length, items: output };
          await client.query(
            `INSERT INTO idempotency_keys (market_id,scope,idempotency_key,request_hash,response_json,user_id) VALUES ($1,'products.import',$2,$3,$4::jsonb,$5)`,
            [user.market_id, key, requestHash, JSON.stringify(payload), user.id]
          );
          return { status: 201, body: payload };
        });
        return json(res, result.status, result.body);
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/customers') {
        const user = await authenticate(pool, req);
        if (!user) return json(res, 401, { error: 'AUTH_REQUIRED' });
        const limit = safeLimit(url.searchParams.get('limit'));
        const afterId = String(url.searchParams.get('after_id') || '');
        const result = await pool.query(
          `SELECT c.id,c.market_id,c.code,c.name,c.phone,c.address,c.notes,c.debt_limit_iqd,c.status,c.version,c.created_at,c.updated_at,
                  COALESCE(cb.balance_iqd,0) AS balance_iqd
             FROM customers c
             LEFT JOIN customer_balances cb ON cb.market_id=c.market_id AND cb.customer_id=c.id
            WHERE c.market_id=$1 AND ($2='' OR c.id>$2)
            ORDER BY c.id LIMIT $3`,
          [user.market_id, afterId, limit + 1]
        );
        const hasMore = result.rows.length > limit;
        const rows = result.rows.slice(0, limit).map(row => ({ ...row, debt_limit_iqd: row.debt_limit_iqd === null ? null : Number(row.debt_limit_iqd), balance_iqd: Number(row.balance_iqd) }));
        return json(res, 200, { items: rows, next_after_id: hasMore ? rows.at(-1)?.id || null : null });
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/customers/import') {
        const user = await authenticate(pool, req);
        if (!user) return json(res, 401, { error: 'AUTH_REQUIRED' });
        if (!['owner','admin'].includes(user.role_type)) return json(res, 403, { error: 'PERMISSION_DENIED' });
        const key = String(req.headers['idempotency-key'] || '').trim();
        if (!key || key.length > 128) return json(res, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' });
        const body = await readJson(req, 2 * 1024 * 1024);
        if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 500) return json(res, 422, { error: 'INVALID_IMPORT_BATCH' });
        const normalized = [];
        const seenCodes = new Set();
        for (const raw of body.items) {
          const code = String(raw.code || '').trim();
          const name = String(raw.name || '').trim();
          const debtLimit = raw.debt_limit_iqd === null || raw.debt_limit_iqd === undefined || raw.debt_limit_iqd === '' ? null : Number(raw.debt_limit_iqd);
          if (!code || code.length > 64 || !name || name.length > 300 || (debtLimit !== null && (!Number.isSafeInteger(debtLimit) || debtLimit < 0))) return json(res, 422, { error: 'INVALID_CUSTOMER', code });
          if (seenCodes.has(code)) return json(res, 422, { error: 'DUPLICATE_CUSTOMER_CODE_IN_BATCH', code });
          seenCodes.add(code);
          normalized.push({
            source_id: validEntityId(raw.id) ? String(raw.id) : null, code, name,
            phone: raw.phone ? String(raw.phone).slice(0, 100) : null, address: raw.address ? String(raw.address).slice(0, 1000) : null,
            notes: raw.notes ? String(raw.notes).slice(0, 2000) : null, debt_limit_iqd: debtLimit,
            status: raw.status === 'blocked' ? 'blocked' : 'active', opening_balance_iqd: Number(raw.opening_balance_iqd || 0),
          });
          if (!Number.isSafeInteger(normalized.at(-1).opening_balance_iqd) || normalized.at(-1).opening_balance_iqd < 0) return json(res, 422, { error: 'INVALID_OPENING_BALANCE', code });
        }
        const requestHash = sha256(JSON.stringify(normalized));
        const result = await withTransaction(pool, async client => {
          const device=await registeredDevice(client,user,req); if(!device)return {status:409,body:{error:'DEVICE_NOT_REGISTERED'}}; await lockBranchWriter(client,user); const leaseGate=await enforceWriterLease(client,user,device.id); if(leaseGate)return {status:423,body:leaseGate}; await lockIdempotency(client, user.market_id, 'customers.import', key);
          const existing = await client.query(`SELECT request_hash,response_json FROM idempotency_keys WHERE market_id=$1 AND scope='customers.import' AND idempotency_key=$2`, [user.market_id,key]);
          if (existing.rows[0]) {
            if (existing.rows[0].request_hash !== requestHash) return { status: 409, body: { error: 'IDEMPOTENCY_CONFLICT' } };
            return { status: 200, body: existing.rows[0].response_json };
          }
          const output = [];
          for (const item of normalized) {
            const id = item.source_id || createId('customer');
            const saved = await client.query(
              `INSERT INTO customers (id,market_id,code,name,phone,address,notes,debt_limit_iqd,status,created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               ON CONFLICT (market_id,code) DO UPDATE SET name=EXCLUDED.name,phone=EXCLUDED.phone,address=EXCLUDED.address,notes=EXCLUDED.notes,debt_limit_iqd=EXCLUDED.debt_limit_iqd,status=EXCLUDED.status,updated_at=now()
               RETURNING id,code`,
              [id,user.market_id,item.code,item.name,item.phone,item.address,item.notes,item.debt_limit_iqd,item.status,user.id]
            );
            await client.query(
              `INSERT INTO customer_balances (market_id,customer_id,balance_iqd,updated_at) VALUES ($1,$2,$3,now())
               ON CONFLICT (market_id,customer_id) DO UPDATE SET balance_iqd=EXCLUDED.balance_iqd,updated_at=now()`,
              [user.market_id,saved.rows[0].id,item.opening_balance_iqd]
            );
            output.push({ source_id:item.source_id, server_id:saved.rows[0].id, code:saved.rows[0].code });
          }
          const payload = { imported:output.length, items:output };
          await client.query(`INSERT INTO idempotency_keys (market_id,scope,idempotency_key,request_hash,response_json,user_id) VALUES ($1,'customers.import',$2,$3,$4::jsonb,$5)`, [user.market_id,key,requestHash,JSON.stringify(payload),user.id]);
          return { status:201, body:payload };
        });
        return json(res,result.status,result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/customer-receipts') {
        const user=await authenticate(pool,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});if(!['owner','admin','cashier'].includes(user.role_type))return json(res,403,{error:'PERMISSION_DENIED'});if(!user.branch_id)return json(res,409,{error:'BRANCH_REQUIRED'});
        const key=String(req.headers['idempotency-key']||'').trim();const body=await readJson(req);const customerId=String(body.customer_id||'');const amount=Number(body.amount_iqd);const method=String(body.method||'cash');if(!key||key.length>128)return json(res,400,{error:'IDEMPOTENCY_KEY_REQUIRED'});if(!validEntityId(customerId)||!safeMoney(amount)||amount<=0||!['cash','card','bank'].includes(method))return json(res,422,{error:'INVALID_RECEIPT'});const requestHash=sha256(JSON.stringify({customerId,amount,method,note:String(body.note||'')}));
        const result=await withTransaction(pool,async client=>{const gate=await operationDeviceGate(client,user,req);if(gate.error)return {status:gate.error==='BRANCH_OFFLINE_LEASE_ACTIVE'?423:409,body:gate};const idem=await operationIdempotency(client,user,'customer-receipt',key,requestHash);if(idem.conflict)return {status:409,body:{error:'IDEMPOTENCY_CONFLICT'}};if(idem.cached)return {status:200,body:idem.cached};const customer=await client.query(`SELECT c.id,c.status,COALESCE(cb.balance_iqd,0) AS balance_iqd FROM customers c LEFT JOIN customer_balances cb ON cb.market_id=c.market_id AND cb.customer_id=c.id WHERE c.id=$1 AND c.market_id=$2 FOR UPDATE OF c`,[customerId,user.market_id]);if(!customer.rows[0]||customer.rows[0].status!=='active')return {status:409,body:{error:'CUSTOMER_UNAVAILABLE'}};await client.query(`INSERT INTO customer_balances (market_id,customer_id,balance_iqd) VALUES ($1,$2,0) ON CONFLICT DO NOTHING`,[user.market_id,customerId]);const balance=await client.query('SELECT balance_iqd FROM customer_balances WHERE market_id=$1 AND customer_id=$2 FOR UPDATE',[user.market_id,customerId]);const before=Number(balance.rows[0].balance_iqd);if(amount>before)return {status:409,body:{error:'PAYMENT_EXCEEDS_DEBT',balance_iqd:before}};const {receiptNumber}=await nextReceipt(client,user,businessDate(config.timeZone));const receiptId=createId('customer-receipt');await client.query(`INSERT INTO customer_receipts (id,market_id,branch_id,customer_id,receipt_number,amount_iqd,method,received_by,device_id,note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[receiptId,user.market_id,user.branch_id,customerId,`RCV-${receiptNumber}`,amount,method,user.id,gate.device.id,String(body.note||'').slice(0,1000)||null]);let remaining=amount;const debts=await client.query(`SELECT id,debt_remaining_iqd FROM sales WHERE market_id=$1 AND customer_id=$2 AND debt_remaining_iqd>0 AND status<>'cancelled' ORDER BY created_at,id FOR UPDATE`,[user.market_id,customerId]);for(const sale of debts.rows){if(remaining<=0)break;const allocated=Math.min(remaining,Number(sale.debt_remaining_iqd));if(allocated<=0)continue;await client.query('UPDATE sales SET debt_remaining_iqd=debt_remaining_iqd-$1 WHERE id=$2',[allocated,sale.id]);await client.query('INSERT INTO customer_receipt_allocations (receipt_id,sale_id,amount_iqd) VALUES ($1,$2,$3)',[receiptId,sale.id,allocated]);remaining-=allocated;}if(remaining!==0)throw new Error('DEBT_ALLOCATION_MISMATCH');await client.query('UPDATE customer_balances SET balance_iqd=balance_iqd-$1,updated_at=now() WHERE market_id=$2 AND customer_id=$3',[amount,user.market_id,customerId]);const batch=createId('journal');await client.query(`INSERT INTO journal_batches (id,market_id,branch_id,reference_type,reference_id,description,posted_by) VALUES ($1,$2,$3,'customer-receipt',$4,$5,$6)`,[batch,user.market_id,user.branch_id,receiptId,`Customer receipt RCV-${receiptNumber}`,user.id]);await client.query('INSERT INTO journal_lines (id,batch_id,account_code,debit_iqd,credit_iqd) VALUES ($1,$2,$3,$4,0),($5,$2,$6,0,$4)',[createId('jl'),batch,paymentAccount(method),amount,createId('jl'),'1200-ACCOUNTS-RECEIVABLE']);const payload={receipt_id:receiptId,receipt_number:`RCV-${receiptNumber}`,amount_iqd:amount,method,balance_iqd:before-amount};await saveOperationIdempotency(client,user,'customer-receipt',key,requestHash,payload);return {status:201,body:payload};});return json(res,result.status,result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/sales/return') {
        const user=await authenticate(pool,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});if(!['owner','admin','cashier'].includes(user.role_type))return json(res,403,{error:'PERMISSION_DENIED'});if(!user.branch_id)return json(res,409,{error:'BRANCH_REQUIRED'});const key=String(req.headers['idempotency-key']||'').trim();const body=await readJson(req);const saleId=String(body.sale_id||'');if(!key||key.length>128)return json(res,400,{error:'IDEMPOTENCY_KEY_REQUIRED'});if(!validEntityId(saleId)||!Array.isArray(body.items)||body.items.length<1||body.items.length>250)return json(res,422,{error:'INVALID_RETURN'});const requested=body.items.map(x=>({sale_item_id:String(x.sale_item_id||''),quantity:Number(x.quantity)}));if(requested.some(x=>!validEntityId(x.sale_item_id)||!safeStock(x.quantity)||x.quantity<=0))return json(res,422,{error:'INVALID_RETURN_ITEMS'});const requestHash=sha256(JSON.stringify({saleId,requested,reason:String(body.reason||'')}));
        const result=await withTransaction(pool,async client=>{const gate=await operationDeviceGate(client,user,req);if(gate.error)return {status:gate.error==='BRANCH_OFFLINE_LEASE_ACTIVE'?423:409,body:gate};const idem=await operationIdempotency(client,user,'sale-return',key,requestHash);if(idem.conflict)return {status:409,body:{error:'IDEMPOTENCY_CONFLICT'}};if(idem.cached)return {status:200,body:idem.cached};const saleResult=await client.query('SELECT * FROM sales WHERE id=$1 AND market_id=$2 AND branch_id=$3 FOR UPDATE',[saleId,user.market_id,user.branch_id]);const sale=saleResult.rows[0];if(!sale||sale.status==='cancelled')return {status:409,body:{error:'SALE_UNAVAILABLE'}};const itemIds=[...new Set(requested.map(x=>x.sale_item_id))].sort();const items=await client.query(`SELECT si.id,si.product_id,si.quantity,si.line_total_iqd,si.unit_cost_iqd,p.stock_quantity FROM sale_items si JOIN products p ON p.id=si.product_id WHERE si.sale_id=$1 AND si.id=ANY($2::text[]) ORDER BY si.id FOR UPDATE OF p`,[saleId,itemIds]);if(items.rows.length!==itemIds.length)return {status:409,body:{error:'RETURN_ITEM_UNAVAILABLE'}};const prior=await client.query(`SELECT sri.sale_item_id,COALESCE(sum(sri.quantity),0) AS quantity,COALESCE(sum(sri.refund_iqd),0) AS refund_iqd FROM sale_return_items sri JOIN sale_returns sr ON sr.id=sri.return_id WHERE sr.sale_id=$1 GROUP BY sri.sale_item_id`,[saleId]);const priorMap=new Map(prior.rows.map(r=>[r.sale_item_id,{quantity:Number(r.quantity),refund:Number(r.refund_iqd)}]));let total=0,cost=0;const lines=[];for(const row of items.rows){const reqQty=requested.filter(x=>x.sale_item_id===row.id).reduce((s,x)=>s+x.quantity,0);const already=priorMap.get(row.id)?.quantity||0;const originalQty=Number(row.quantity);if(reqQty<=0||already+reqQty>originalQty+1e-9)return {status:409,body:{error:'RETURN_QUANTITY_EXCEEDED',sale_item_id:row.id}};const gross=Math.round(Number(row.line_total_iqd)*reqQty/originalQty);const proportional=Math.floor(gross*Number(sale.total_iqd)/Math.max(1,Number(sale.subtotal_iqd)));const lineCost=Math.round(Number(row.unit_cost_iqd)*reqQty);total+=proportional;cost+=lineCost;lines.push({row,quantity:reqQty,refund:proportional,cost:lineCost});}const allItems=await client.query('SELECT id,quantity FROM sale_items WHERE sale_id=$1',[saleId]);let allReturned=true;for(const original of allItems.rows){const current=priorMap.get(original.id)?.quantity||0;const now=lines.find(l=>l.row.id===original.id)?.quantity||0;if(current+now<Number(original.quantity)-1e-9){allReturned=false;break;}}const previousReturns=await client.query('SELECT COALESCE(sum(total_iqd),0) AS total FROM sale_returns WHERE sale_id=$1',[saleId]);const remainingSaleTotal=Number(sale.total_iqd)-Number(previousReturns.rows[0].total);if(allReturned)total=remainingSaleTotal;if(total<=0||total>remainingSaleTotal)return {status:409,body:{error:'RETURN_AMOUNT_INVALID'}};if(allReturned&&lines.length){const diff=total-lines.reduce((s,l)=>s+l.refund,0);lines[lines.length-1].refund+=diff;}const debtReversal=Math.min(total,Number(sale.debt_remaining_iqd));const refund=total-debtReversal;if(debtReversal>0&&!sale.customer_id)throw new Error('SALE_DEBT_WITHOUT_CUSTOMER');let refundMethod=null;if(refund>0)refundMethod=await originalPaidMethod(client,saleId);if(debtReversal>0){await client.query('UPDATE sales SET debt_remaining_iqd=debt_remaining_iqd-$1 WHERE id=$2',[debtReversal,saleId]);await client.query('UPDATE customer_balances SET balance_iqd=GREATEST(0,balance_iqd-$1),updated_at=now() WHERE market_id=$2 AND customer_id=$3',[debtReversal,user.market_id,sale.customer_id]);}const {receiptNumber}=await nextReceipt(client,user,businessDate(config.timeZone));const returnId=createId('return');await client.query(`INSERT INTO sale_returns (id,market_id,branch_id,sale_id,return_number,total_iqd,debt_reversal_iqd,refund_iqd,refund_method,returned_by,device_id,reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[returnId,user.market_id,user.branch_id,saleId,`RET-${receiptNumber}`,total,debtReversal,refund,refundMethod,user.id,gate.device.id,String(body.reason||'').slice(0,1000)||null]);for(const line of lines){await client.query('INSERT INTO sale_return_items (id,return_id,sale_item_id,product_id,quantity,refund_iqd,cost_iqd) VALUES ($1,$2,$3,$4,$5,$6,$7)',[createId('return-item'),returnId,line.row.id,line.row.product_id,line.quantity,line.refund,line.cost]);const before=Number(line.row.stock_quantity),after=before+line.quantity;await client.query('UPDATE products SET stock_quantity=$1,version=version+1,updated_at=now() WHERE id=$2',[after,line.row.product_id]);await client.query(`INSERT INTO stock_movements (id,market_id,branch_id,product_id,movement_type,quantity_delta,stock_before,stock_after,reference_type,reference_id,created_by) VALUES ($1,$2,$3,$4,'return',$5,$6,$7,'sale-return',$8,$9)`,[createId('stock'),user.market_id,user.branch_id,line.row.product_id,line.quantity,before,after,returnId,user.id]);}if(allReturned)await client.query("UPDATE sales SET status='returned' WHERE id=$1",[saleId]);const batch=createId('journal');await client.query(`INSERT INTO journal_batches (id,market_id,branch_id,reference_type,reference_id,description,posted_by) VALUES ($1,$2,$3,'sale-return',$4,$5,$6)`,[batch,user.market_id,user.branch_id,returnId,`Sale return RET-${receiptNumber}`,user.id]);const journal=[['4000-SALES-REVENUE',total,0]];if(debtReversal>0)journal.push(['1200-ACCOUNTS-RECEIVABLE',0,debtReversal]);if(refund>0)journal.push([paymentAccount(refundMethod),0,refund]);if(cost>0){journal.push(['1300-INVENTORY',cost,0]);journal.push(['5000-COGS',0,cost]);}for(const [account,debit,credit] of journal)await client.query('INSERT INTO journal_lines (id,batch_id,account_code,debit_iqd,credit_iqd) VALUES ($1,$2,$3,$4,$5)',[createId('jl'),batch,account,debit,credit]);const debit=journal.reduce((s,l)=>s+l[1],0),credit=journal.reduce((s,l)=>s+l[2],0);if(debit!==credit)throw new Error(`UNBALANCED_RETURN_JOURNAL:${debit}:${credit}`);const payload={return_id:returnId,return_number:`RET-${receiptNumber}`,total_iqd:total,debt_reversal_iqd:debtReversal,refund_iqd:refund,refund_method:refundMethod,fully_returned:allReturned};await saveOperationIdempotency(client,user,'sale-return',key,requestHash,payload);return {status:201,body:payload};});return json(res,result.status,result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/stock/adjust') {
        const user=await authenticate(pool,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});if(!['owner','admin','stock_staff'].includes(user.role_type))return json(res,403,{error:'PERMISSION_DENIED'});if(!user.branch_id)return json(res,409,{error:'BRANCH_REQUIRED'});const key=String(req.headers['idempotency-key']||'').trim();const body=await readJson(req);const productId=String(body.product_id||'');const counted=Number(body.counted_quantity);const reason=String(body.reason||'').trim();const kind=body.kind==='loss'?'loss':'adjustment';if(!key||key.length>128)return json(res,400,{error:'IDEMPOTENCY_KEY_REQUIRED'});if(!validEntityId(productId)||!safeStock(counted)||!reason)return json(res,422,{error:'INVALID_STOCK_ADJUSTMENT'});const requestHash=sha256(JSON.stringify({productId,counted,reason,kind}));const result=await withTransaction(pool,async client=>{const gate=await operationDeviceGate(client,user,req);if(gate.error)return {status:gate.error==='BRANCH_OFFLINE_LEASE_ACTIVE'?423:409,body:gate};const idem=await operationIdempotency(client,user,'stock-adjust',key,requestHash);if(idem.conflict)return {status:409,body:{error:'IDEMPOTENCY_CONFLICT'}};if(idem.cached)return {status:200,body:idem.cached};const p=await client.query('SELECT id,stock_quantity,cost_price_iqd FROM products WHERE id=$1 AND market_id=$2 AND branch_id=$3 FOR UPDATE',[productId,user.market_id,user.branch_id]);if(!p.rows[0])return {status:404,body:{error:'PRODUCT_NOT_FOUND'}};const before=Number(p.rows[0].stock_quantity),delta=counted-before;if(delta===0)return {status:422,body:{error:'NO_STOCK_CHANGE'}};await client.query('UPDATE products SET stock_quantity=$1,version=version+1,updated_at=now() WHERE id=$2',[counted,productId]);const movementId=createId('stock');await client.query(`INSERT INTO stock_movements (id,market_id,branch_id,product_id,movement_type,quantity_delta,stock_before,stock_after,reference_type,reference_id,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'stock-adjust',$9,$10)`,[movementId,user.market_id,user.branch_id,productId,kind,delta,before,counted,movementId,user.id]);const value=Math.round(Math.abs(delta)*Number(p.rows[0].cost_price_iqd));if(value>0){const batch=createId('journal');await client.query(`INSERT INTO journal_batches (id,market_id,branch_id,reference_type,reference_id,description,posted_by) VALUES ($1,$2,$3,'stock-adjust',$4,$5,$6)`,[batch,user.market_id,user.branch_id,movementId,reason,user.id]);const variance=kind==='loss'?'6100-INVENTORY-LOSS':'5190-INVENTORY-VARIANCE';if(delta<0){await client.query('INSERT INTO journal_lines (id,batch_id,account_code,debit_iqd,credit_iqd) VALUES ($1,$2,$3,$4,0),($5,$2,$6,0,$4)',[createId('jl'),batch,variance,value,createId('jl'),'1300-INVENTORY']);}else{await client.query('INSERT INTO journal_lines (id,batch_id,account_code,debit_iqd,credit_iqd) VALUES ($1,$2,$3,$4,0),($5,$2,$6,0,$4)',[createId('jl'),batch,'1300-INVENTORY',value,createId('jl'),variance]);}}const payload={movement_id:movementId,product_id:productId,stock_before:before,stock_after:counted,delta,value_iqd:value};await saveOperationIdempotency(client,user,'stock-adjust',key,requestHash,payload);return {status:201,body:payload};});return json(res,result.status,result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/expenses') {
        const user=await authenticate(pool,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});if(!['owner','admin','cashier','accountant'].includes(user.role_type))return json(res,403,{error:'PERMISSION_DENIED'});if(!user.branch_id)return json(res,409,{error:'BRANCH_REQUIRED'});const key=String(req.headers['idempotency-key']||'').trim();const body=await readJson(req);const amount=Number(body.amount_iqd);const method=String(body.method||'cash');const category=String(body.category||'خەرجی گشتی').trim().slice(0,200);if(!key||key.length>128)return json(res,400,{error:'IDEMPOTENCY_KEY_REQUIRED'});if(!safeMoney(amount)||amount<=0||!['cash','card','bank'].includes(method)||!category)return json(res,422,{error:'INVALID_EXPENSE'});const requestHash=sha256(JSON.stringify({amount,method,category,description:String(body.description||'')}));const result=await withTransaction(pool,async client=>{const gate=await operationDeviceGate(client,user,req);if(gate.error)return {status:gate.error==='BRANCH_OFFLINE_LEASE_ACTIVE'?423:409,body:gate};const idem=await operationIdempotency(client,user,'expense',key,requestHash);if(idem.conflict)return {status:409,body:{error:'IDEMPOTENCY_CONFLICT'}};if(idem.cached)return {status:200,body:idem.cached};const {receiptNumber}=await nextReceipt(client,user,businessDate(config.timeZone));const id=createId('expense');await client.query(`INSERT INTO expenses (id,market_id,branch_id,expense_number,category,description,amount_iqd,method,created_by,device_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,user.market_id,user.branch_id,`EXP-${receiptNumber}`,category,String(body.description||'').slice(0,1000)||null,amount,method,user.id,gate.device.id]);const batch=createId('journal');await client.query(`INSERT INTO journal_batches (id,market_id,branch_id,reference_type,reference_id,description,posted_by) VALUES ($1,$2,$3,'expense',$4,$5,$6)`,[batch,user.market_id,user.branch_id,id,category,user.id]);await client.query('INSERT INTO journal_lines (id,batch_id,account_code,debit_iqd,credit_iqd) VALUES ($1,$2,$3,$4,0),($5,$2,$6,0,$4)',[createId('jl'),batch,'6000-GENERAL-EXPENSE',amount,createId('jl'),paymentAccount(method)]);const payload={expense_id:id,expense_number:`EXP-${receiptNumber}`,amount_iqd:amount,method};await saveOperationIdempotency(client,user,'expense',key,requestHash,payload);return {status:201,body:payload};});return json(res,result.status,result.body);
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/cash-sessions/active') {
        const user=await authenticate(pool,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});const deviceId=deviceIdFromRequest(req);const result=await pool.query(`SELECT * FROM cash_sessions WHERE market_id=$1 AND branch_id=$2 AND device_id=$3 AND status='open' ORDER BY opened_at DESC LIMIT 1`,[user.market_id,user.branch_id,deviceId]);return json(res,200,{session:result.rows[0]?{...result.rows[0],opening_amount_iqd:Number(result.rows[0].opening_amount_iqd),version:Number(result.rows[0].version)}:null});
      }
      if (req.method === 'GET' && url.pathname === '/api/v1/cash-sessions') {
        const user=await authenticate(pool,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});const result=await pool.query(`SELECT * FROM cash_sessions WHERE market_id=$1 AND branch_id=$2 ORDER BY opened_at DESC LIMIT 50`,[user.market_id,user.branch_id]);return json(res,200,{items:result.rows.map(r=>({...r,opening_amount_iqd:Number(r.opening_amount_iqd),expected_amount_iqd:r.expected_amount_iqd===null?null:Number(r.expected_amount_iqd),counted_amount_iqd:r.counted_amount_iqd===null?null:Number(r.counted_amount_iqd),difference_iqd:r.difference_iqd===null?null:Number(r.difference_iqd),version:Number(r.version)}))});
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/cash-sessions/open') {
        const user=await authenticate(pool,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});if(!['owner','admin','cashier'].includes(user.role_type))return json(res,403,{error:'PERMISSION_DENIED'});const body=await readJson(req);const opening=Number(body.opening_amount_iqd);if(!safeMoney(opening))return json(res,422,{error:'INVALID_OPENING_AMOUNT'});const result=await withTransaction(pool,async client=>{const gate=await operationDeviceGate(client,user,req);if(gate.error)return {status:gate.error==='BRANCH_OFFLINE_LEASE_ACTIVE'?423:409,body:gate};const active=await client.query(`SELECT id FROM cash_sessions WHERE market_id=$1 AND branch_id=$2 AND device_id=$3 AND status='open' FOR UPDATE`,[user.market_id,user.branch_id,gate.device.id]);if(active.rows[0])return {status:409,body:{error:'CASH_SESSION_ALREADY_OPEN'}};const id=createId('cash-session');const saved=await client.query(`INSERT INTO cash_sessions (id,market_id,branch_id,device_id,cashier_id,opening_amount_iqd) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,[id,user.market_id,user.branch_id,gate.device.id,user.id,opening]);return {status:201,body:{session:{...saved.rows[0],opening_amount_iqd:opening,version:1}}};});return json(res,result.status,result.body);
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/cash-sessions/close') {
        const user=await authenticate(pool,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});const body=await readJson(req);const id=String(body.session_id||'');const counted=Number(body.counted_amount_iqd);const version=Number(body.version);if(!validEntityId(id)||!safeMoney(counted)||!Number.isSafeInteger(version)||version<1)return json(res,422,{error:'INVALID_CASH_SESSION'});const result=await withTransaction(pool,async client=>{const gate=await operationDeviceGate(client,user,req);if(gate.error)return {status:gate.error==='BRANCH_OFFLINE_LEASE_ACTIVE'?423:409,body:gate};const s=await client.query(`SELECT * FROM cash_sessions WHERE id=$1 AND market_id=$2 AND branch_id=$3 AND device_id=$4 FOR UPDATE`,[id,user.market_id,user.branch_id,gate.device.id]);const session=s.rows[0];if(!session||session.status!=='open')return {status:409,body:{error:'CASH_SESSION_NOT_OPEN'}};if(Number(session.version)!==version)return {status:409,body:{error:'VERSION_CONFLICT',current_version:Number(session.version)}};const values=await client.query(`SELECT
 COALESCE((SELECT sum(p.amount_iqd) FROM payments p WHERE p.market_id=$1 AND p.branch_id=$2 AND p.method='cash' AND p.received_by=$3 AND p.created_at>=$4),0) AS sale_cash,
 COALESCE((SELECT sum(cr.amount_iqd) FROM customer_receipts cr WHERE cr.market_id=$1 AND cr.branch_id=$2 AND cr.method='cash' AND cr.received_by=$3 AND cr.created_at>=$4),0) AS debt_cash,
 COALESCE((SELECT sum(sr.refund_iqd) FROM sale_returns sr WHERE sr.market_id=$1 AND sr.branch_id=$2 AND sr.refund_method='cash' AND sr.returned_by=$3 AND sr.created_at>=$4),0) AS refund_cash,
 COALESCE((SELECT sum(e.amount_iqd) FROM expenses e WHERE e.market_id=$1 AND e.branch_id=$2 AND e.method='cash' AND e.created_by=$3 AND e.created_at>=$4),0) AS expense_cash`,[user.market_id,user.branch_id,session.cashier_id,session.opened_at]);const v=values.rows[0],expected=Number(session.opening_amount_iqd)+Number(v.sale_cash)+Number(v.debt_cash)-Number(v.refund_cash)-Number(v.expense_cash),difference=counted-expected;const saved=await client.query(`UPDATE cash_sessions SET expected_amount_iqd=$1,counted_amount_iqd=$2,difference_iqd=$3,status='closed',closed_at=now(),version=version+1 WHERE id=$4 RETURNING *`,[expected,counted,difference,id]);return {status:200,body:{session:{...saved.rows[0],opening_amount_iqd:Number(saved.rows[0].opening_amount_iqd),expected_amount_iqd:expected,counted_amount_iqd:counted,difference_iqd:difference,version:Number(saved.rows[0].version)}}};});return json(res,result.status,result.body);
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/suppliers') {
        const user=await authenticate(pool,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});const result=await pool.query(`SELECT s.id,s.market_id,s.code,s.name,s.phone,s.address,s.notes,s.status,s.version,s.created_at,s.updated_at,COALESCE(sb.balance_iqd,0) AS balance_iqd FROM suppliers s LEFT JOIN supplier_balances sb ON sb.market_id=s.market_id AND sb.supplier_id=s.id WHERE s.market_id=$1 ORDER BY s.name,s.id`,[user.market_id]);return json(res,200,{items:result.rows.map(r=>({...r,version:Number(r.version),balance_iqd:Number(r.balance_iqd)}))});
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/suppliers/save') {
        const user=await authenticate(pool,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});if(!['owner','admin','accountant'].includes(user.role_type))return json(res,403,{error:'PERMISSION_DENIED'});const body=await readJson(req);const id=body.id?String(body.id):null;const code=String(body.code||'').trim();const name=String(body.name||'').trim();const version=id?Number(body.version):null;if((id&&(!validEntityId(id)||!Number.isSafeInteger(version)||version<1))||!code||code.length>64||!name||name.length>300)return json(res,422,{error:'INVALID_SUPPLIER'});const result=await withTransaction(pool,async client=>{const duplicate=await client.query('SELECT id FROM suppliers WHERE market_id=$1 AND code=$2 AND ($3::text IS NULL OR id<>$3) LIMIT 1',[user.market_id,code,id]);if(duplicate.rows[0])return {status:409,body:{error:'SUPPLIER_CODE_DUPLICATE'}};let saved;if(!id){saved=await client.query(`INSERT INTO suppliers (id,market_id,code,name,phone,address,notes,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[createId('supplier'),user.market_id,code,name,body.phone?String(body.phone).slice(0,100):null,body.address?String(body.address).slice(0,1000):null,body.notes?String(body.notes).slice(0,2000):null,body.status==='blocked'?'blocked':'active',user.id]);await client.query('INSERT INTO supplier_balances (market_id,supplier_id,balance_iqd) VALUES ($1,$2,0)',[user.market_id,saved.rows[0].id]);}else{saved=await client.query(`UPDATE suppliers SET code=$1,name=$2,phone=$3,address=$4,notes=$5,status=$6,version=version+1,updated_at=now() WHERE id=$7 AND market_id=$8 AND version=$9 RETURNING *`,[code,name,body.phone?String(body.phone).slice(0,100):null,body.address?String(body.address).slice(0,1000):null,body.notes?String(body.notes).slice(0,2000):null,body.status==='blocked'?'blocked':'active',id,user.market_id,version]);if(!saved.rows[0]){const current=await client.query('SELECT version FROM suppliers WHERE id=$1 AND market_id=$2',[id,user.market_id]);return current.rows[0]?{status:409,body:{error:'VERSION_CONFLICT',current_version:Number(current.rows[0].version)}}:{status:404,body:{error:'SUPPLIER_NOT_FOUND'}};}}const balance=await client.query('SELECT balance_iqd FROM supplier_balances WHERE market_id=$1 AND supplier_id=$2',[user.market_id,saved.rows[0].id]);return {status:id?200:201,body:{supplier:{...saved.rows[0],version:Number(saved.rows[0].version),balance_iqd:Number(balance.rows[0]?.balance_iqd||0)}}};});return json(res,result.status,result.body);
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/purchases') {
        const user=await authenticate(pool,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});const limit=safeLimit(url.searchParams.get('limit'));const result=await pool.query(`SELECT p.*,s.name AS supplier_name FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.market_id=$1 AND p.branch_id=$2 ORDER BY p.created_at DESC LIMIT $3`,[user.market_id,user.branch_id,limit]);return json(res,200,{items:result.rows.map(r=>({...r,subtotal_iqd:Number(r.subtotal_iqd),discount_iqd:Number(r.discount_iqd),total_iqd:Number(r.total_iqd),paid_iqd:Number(r.paid_iqd),debt_iqd:Number(r.debt_iqd),debt_remaining_iqd:Number(r.debt_remaining_iqd)}))});
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/purchases/commit') {
        const user=await authenticate(pool,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});if(!['owner','admin','stock_staff','accountant'].includes(user.role_type))return json(res,403,{error:'PERMISSION_DENIED'});if(!user.branch_id)return json(res,409,{error:'BRANCH_REQUIRED'});const key=String(req.headers['idempotency-key']||'').trim();const body=await readJson(req);if(!key||key.length>128)return json(res,400,{error:'IDEMPOTENCY_KEY_REQUIRED'});const supplierId=body.supplier_id?String(body.supplier_id):null;const paymentMethod=String(body.payment_method||'credit');const paidIqd=Number(body.paid_iqd||0),discountIqd=Number(body.discount_iqd||0);if(!validOperationId(body.client_operation_id)||!['cash','card','bank','credit','mixed'].includes(paymentMethod)||!safeMoney(paidIqd)||!safeMoney(discountIqd)||!Array.isArray(body.items)||body.items.length<1||body.items.length>250)return json(res,422,{error:'INVALID_PURCHASE'});const normalized=body.items.map(x=>({product_id:String(x.product_id||''),quantity:Number(x.quantity),unit_cost_iqd:Number(x.unit_cost_iqd)}));if(normalized.some(x=>!validEntityId(x.product_id)||!safeStock(x.quantity)||x.quantity<=0||!safeMoney(x.unit_cost_iqd)))return json(res,422,{error:'INVALID_PURCHASE_ITEMS'});const requestHash=sha256(JSON.stringify({supplierId,paymentMethod,paidIqd,discountIqd,client_operation_id:body.client_operation_id,items:[...normalized].sort((a,b)=>a.product_id.localeCompare(b.product_id))}));const result=await withTransaction(pool,async client=>{const gate=await operationDeviceGate(client,user,req);if(gate.error)return {status:gate.error==='BRANCH_OFFLINE_LEASE_ACTIVE'?423:409,body:gate};const idem=await operationIdempotency(client,user,'purchase.commit',key,requestHash);if(idem.conflict)return {status:409,body:{error:'IDEMPOTENCY_CONFLICT'}};if(idem.cached)return {status:200,body:idem.cached};const existing=await client.query('SELECT id FROM purchases WHERE market_id=$1 AND client_operation_id=$2',[user.market_id,body.client_operation_id]);if(existing.rows[0])return {status:409,body:{error:'CLIENT_OPERATION_ALREADY_USED'}};let supplier=null;if(supplierId){const sr=await client.query('SELECT id,status FROM suppliers WHERE id=$1 AND market_id=$2 FOR UPDATE',[supplierId,user.market_id]);supplier=sr.rows[0];if(!supplier||supplier.status!=='active')return {status:409,body:{error:'SUPPLIER_UNAVAILABLE'}};await client.query('INSERT INTO supplier_balances (market_id,supplier_id,balance_iqd) VALUES ($1,$2,0) ON CONFLICT DO NOTHING',[user.market_id,supplierId]);await client.query('SELECT balance_iqd FROM supplier_balances WHERE market_id=$1 AND supplier_id=$2 FOR UPDATE',[user.market_id,supplierId]);}const ids=[...new Set(normalized.map(x=>x.product_id))].sort();const products=await client.query(`SELECT id,name,barcode,stock_quantity FROM products WHERE market_id=$1 AND branch_id=$2 AND id=ANY($3::text[]) ORDER BY id FOR UPDATE`,[user.market_id,user.branch_id,ids]);if(products.rows.length!==ids.length)return {status:409,body:{error:'PRODUCT_UNAVAILABLE'}};let subtotal=0;const lines=[];for(const p of products.rows){const rows=normalized.filter(x=>x.product_id===p.id);const quantity=rows.reduce((s,x)=>s+x.quantity,0);const costs=[...new Set(rows.map(x=>x.unit_cost_iqd))];if(costs.length!==1)return {status:422,body:{error:'PRODUCT_COST_CONFLICT',product_id:p.id}};const unitCost=costs[0],lineTotal=Math.round(unitCost*quantity);subtotal+=lineTotal;lines.push({p,quantity,unitCost,lineTotal,before:Number(p.stock_quantity),after:Number(p.stock_quantity)+quantity});}if(discountIqd>subtotal)return {status:422,body:{error:'DISCOUNT_EXCEEDS_SUBTOTAL'}};const total=subtotal-discountIqd;if(paidIqd>total)return {status:422,body:{error:'PAID_EXCEEDS_TOTAL'}};const debt=total-paidIqd;if(debt>0&&!supplierId)return {status:422,body:{error:'SUPPLIER_REQUIRED_FOR_CREDIT'}};if(['cash','card','bank'].includes(paymentMethod)&&debt!==0)return {status:422,body:{error:'PAYMENT_METHOD_REQUIRES_FULL_PAYMENT'}};if(paymentMethod==='credit'&&paidIqd!==0)return {status:422,body:{error:'INVALID_PAYMENT_SPLIT'}};if(paymentMethod==='mixed'&&(paidIqd<=0||debt<=0))return {status:422,body:{error:'INVALID_PAYMENT_SPLIT'}};const paidMethod=paymentMethod==='mixed'?String(body.paid_method||'cash'):paymentMethod;if(paidIqd>0&&!['cash','card','bank'].includes(paidMethod))return {status:422,body:{error:'INVALID_PAID_METHOD'}};const {receiptNumber}=await nextReceipt(client,user,businessDate(config.timeZone));const purchaseId=createId('purchase');await client.query(`INSERT INTO purchases (id,market_id,branch_id,supplier_id,purchase_number,client_operation_id,payment_method,subtotal_iqd,discount_iqd,total_iqd,paid_iqd,debt_iqd,debt_remaining_iqd,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13)`,[purchaseId,user.market_id,user.branch_id,supplierId,`PUR-${receiptNumber}`,body.client_operation_id,paymentMethod,subtotal,discountIqd,total,paidIqd,debt,user.id]);for(const line of lines){const itemId=createId('purchase-item');await client.query(`INSERT INTO purchase_items (id,purchase_id,product_id,product_name,barcode,quantity,unit_cost_iqd,line_total_iqd) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,[itemId,purchaseId,line.p.id,line.p.name,line.p.barcode,line.quantity,line.unitCost,line.lineTotal]);await client.query('UPDATE products SET stock_quantity=$1,cost_price_iqd=$2,version=version+1,updated_at=now() WHERE id=$3',[line.after,line.unitCost,line.p.id]);await client.query(`INSERT INTO stock_movements (id,market_id,branch_id,product_id,movement_type,quantity_delta,stock_before,stock_after,reference_type,reference_id,created_by) VALUES ($1,$2,$3,$4,'purchase',$5,$6,$7,'purchase',$8,$9)`,[createId('stock'),user.market_id,user.branch_id,line.p.id,line.quantity,line.before,line.after,purchaseId,user.id]);}if(debt>0)await client.query('UPDATE supplier_balances SET balance_iqd=balance_iqd+$1,updated_at=now() WHERE market_id=$2 AND supplier_id=$3',[debt,user.market_id,supplierId]);const batch=createId('journal');await client.query(`INSERT INTO journal_batches (id,market_id,branch_id,reference_type,reference_id,description,posted_by) VALUES ($1,$2,$3,'purchase',$4,$5,$6)`,[batch,user.market_id,user.branch_id,purchaseId,`Purchase PUR-${receiptNumber}`,user.id]);const journal=[['1300-INVENTORY',total,0]];if(paidIqd>0)journal.push([paymentAccount(paidMethod),0,paidIqd]);if(debt>0)journal.push(['2100-ACCOUNTS-PAYABLE',0,debt]);const debits=journal.reduce((s,l)=>s+l[1],0),credits=journal.reduce((s,l)=>s+l[2],0);if(debits!==credits)throw new Error(`UNBALANCED_PURCHASE_JOURNAL:${debits}:${credits}`);for(const [account,debit,credit] of journal)await client.query('INSERT INTO journal_lines (id,batch_id,account_code,debit_iqd,credit_iqd) VALUES ($1,$2,$3,$4,$5)',[createId('jl'),batch,account,debit,credit]);const payload={purchase_id:purchaseId,purchase_number:`PUR-${receiptNumber}`,subtotal_iqd:subtotal,discount_iqd:discountIqd,total_iqd:total,paid_iqd:paidIqd,debt_iqd:debt,supplier_balance_iqd:supplierId?Number((await client.query('SELECT balance_iqd FROM supplier_balances WHERE market_id=$1 AND supplier_id=$2',[user.market_id,supplierId])).rows[0].balance_iqd):null};await saveOperationIdempotency(client,user,'purchase.commit',key,requestHash,payload);return {status:201,body:payload};});return json(res,result.status,result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/supplier-payments') {
        const user=await authenticate(pool,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});if(!['owner','admin','accountant'].includes(user.role_type))return json(res,403,{error:'PERMISSION_DENIED'});const key=String(req.headers['idempotency-key']||'').trim();const body=await readJson(req);const supplierId=String(body.supplier_id||''),amount=Number(body.amount_iqd),method=String(body.method||'cash');if(!key||key.length>128)return json(res,400,{error:'IDEMPOTENCY_KEY_REQUIRED'});if(!validEntityId(supplierId)||!safeMoney(amount)||amount<=0||!['cash','card','bank'].includes(method))return json(res,422,{error:'INVALID_SUPPLIER_PAYMENT'});const requestHash=sha256(JSON.stringify({supplierId,amount,method,note:String(body.note||'')}));const result=await withTransaction(pool,async client=>{const gate=await operationDeviceGate(client,user,req);if(gate.error)return {status:gate.error==='BRANCH_OFFLINE_LEASE_ACTIVE'?423:409,body:gate};const idem=await operationIdempotency(client,user,'supplier-payment',key,requestHash);if(idem.conflict)return {status:409,body:{error:'IDEMPOTENCY_CONFLICT'}};if(idem.cached)return {status:200,body:idem.cached};const s=await client.query('SELECT id,status FROM suppliers WHERE id=$1 AND market_id=$2 FOR UPDATE',[supplierId,user.market_id]);if(!s.rows[0]||s.rows[0].status!=='active')return {status:409,body:{error:'SUPPLIER_UNAVAILABLE'}};await client.query('INSERT INTO supplier_balances (market_id,supplier_id,balance_iqd) VALUES ($1,$2,0) ON CONFLICT DO NOTHING',[user.market_id,supplierId]);const b=await client.query('SELECT balance_iqd FROM supplier_balances WHERE market_id=$1 AND supplier_id=$2 FOR UPDATE',[user.market_id,supplierId]);const before=Number(b.rows[0].balance_iqd);if(amount>before)return {status:409,body:{error:'PAYMENT_EXCEEDS_PAYABLE',balance_iqd:before}};const {receiptNumber}=await nextReceipt(client,user,businessDate(config.timeZone));const paymentId=createId('supplier-payment');await client.query(`INSERT INTO supplier_payments (id,market_id,branch_id,supplier_id,payment_number,amount_iqd,method,paid_by,device_id,note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[paymentId,user.market_id,user.branch_id,supplierId,`SPY-${receiptNumber}`,amount,method,user.id,gate.device.id,String(body.note||'').slice(0,1000)||null]);let remaining=amount;const debts=await client.query(`SELECT id,debt_remaining_iqd FROM purchases WHERE market_id=$1 AND supplier_id=$2 AND debt_remaining_iqd>0 AND status<>'cancelled' ORDER BY created_at,id FOR UPDATE`,[user.market_id,supplierId]);for(const purchase of debts.rows){if(remaining<=0)break;const allocated=Math.min(remaining,Number(purchase.debt_remaining_iqd));if(allocated<=0)continue;await client.query('UPDATE purchases SET debt_remaining_iqd=debt_remaining_iqd-$1 WHERE id=$2',[allocated,purchase.id]);await client.query('INSERT INTO supplier_payment_allocations (payment_id,purchase_id,amount_iqd) VALUES ($1,$2,$3)',[paymentId,purchase.id,allocated]);remaining-=allocated;}if(remaining!==0)throw new Error('PAYABLE_ALLOCATION_MISMATCH');await client.query('UPDATE supplier_balances SET balance_iqd=balance_iqd-$1,updated_at=now() WHERE market_id=$2 AND supplier_id=$3',[amount,user.market_id,supplierId]);const batch=createId('journal');await client.query(`INSERT INTO journal_batches (id,market_id,branch_id,reference_type,reference_id,description,posted_by) VALUES ($1,$2,$3,'supplier-payment',$4,$5,$6)`,[batch,user.market_id,user.branch_id,paymentId,`Supplier payment SPY-${receiptNumber}`,user.id]);await client.query('INSERT INTO journal_lines (id,batch_id,account_code,debit_iqd,credit_iqd) VALUES ($1,$2,$3,$4,0),($5,$2,$6,0,$4)',[createId('jl'),batch,'2100-ACCOUNTS-PAYABLE',amount,createId('jl'),paymentAccount(method)]);const payload={payment_id:paymentId,payment_number:`SPY-${receiptNumber}`,amount_iqd:amount,method,balance_iqd:before-amount};await saveOperationIdempotency(client,user,'supplier-payment',key,requestHash,payload);return {status:201,body:payload};});return json(res,result.status,result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/purchases/return') {
        const user=await authenticate(pool,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});if(!['owner','admin','stock_staff','accountant'].includes(user.role_type))return json(res,403,{error:'PERMISSION_DENIED'});const key=String(req.headers['idempotency-key']||'').trim();const body=await readJson(req);const purchaseId=String(body.purchase_id||'');if(!key||key.length>128)return json(res,400,{error:'IDEMPOTENCY_KEY_REQUIRED'});if(!validEntityId(purchaseId)||!Array.isArray(body.items)||body.items.length<1)return json(res,422,{error:'INVALID_PURCHASE_RETURN'});const requested=body.items.map(x=>({purchase_item_id:String(x.purchase_item_id||''),quantity:Number(x.quantity)}));if(requested.some(x=>!validEntityId(x.purchase_item_id)||!safeStock(x.quantity)||x.quantity<=0))return json(res,422,{error:'INVALID_PURCHASE_RETURN_ITEMS'});const requestHash=sha256(JSON.stringify({purchaseId,requested,reason:String(body.reason||'')}));const result=await withTransaction(pool,async client=>{const gate=await operationDeviceGate(client,user,req);if(gate.error)return {status:gate.error==='BRANCH_OFFLINE_LEASE_ACTIVE'?423:409,body:gate};const idem=await operationIdempotency(client,user,'purchase.return',key,requestHash);if(idem.conflict)return {status:409,body:{error:'IDEMPOTENCY_CONFLICT'}};if(idem.cached)return {status:200,body:idem.cached};const pr=await client.query('SELECT * FROM purchases WHERE id=$1 AND market_id=$2 AND branch_id=$3 FOR UPDATE',[purchaseId,user.market_id,user.branch_id]);const purchase=pr.rows[0];if(!purchase||purchase.status==='cancelled')return {status:409,body:{error:'PURCHASE_UNAVAILABLE'}};const ids=[...new Set(requested.map(x=>x.purchase_item_id))].sort();const items=await client.query(`SELECT pi.id,pi.product_id,pi.quantity,pi.unit_cost_iqd,p.stock_quantity FROM purchase_items pi JOIN products p ON p.id=pi.product_id WHERE pi.purchase_id=$1 AND pi.id=ANY($2::text[]) ORDER BY pi.id FOR UPDATE OF p`,[purchaseId,ids]);if(items.rows.length!==ids.length)return {status:409,body:{error:'PURCHASE_RETURN_ITEM_UNAVAILABLE'}};const prior=await client.query(`SELECT pri.purchase_item_id,COALESCE(sum(pri.quantity),0) AS quantity FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id=pri.return_id WHERE pr.purchase_id=$1 GROUP BY pri.purchase_item_id`,[purchaseId]);const priorMap=new Map(prior.rows.map(r=>[r.purchase_item_id,Number(r.quantity)]));let total=0;const lines=[];for(const row of items.rows){const qty=requested.filter(x=>x.purchase_item_id===row.id).reduce((s,x)=>s+x.quantity,0),already=priorMap.get(row.id)||0,original=Number(row.quantity);if(qty<=0||already+qty>original+1e-9)return {status:409,body:{error:'RETURN_QUANTITY_EXCEEDED',purchase_item_id:row.id}};if(Number(row.stock_quantity)+1e-9<qty)return {status:409,body:{error:'STOCK_INSUFFICIENT_FOR_PURCHASE_RETURN',product_id:row.product_id}};const amount=Math.round(Number(row.unit_cost_iqd)*qty);total+=amount;lines.push({row,qty,amount,before:Number(row.stock_quantity),after:Number(row.stock_quantity)-qty});}const previous=await client.query('SELECT COALESCE(sum(total_iqd),0) total FROM purchase_returns WHERE purchase_id=$1',[purchaseId]);const remainingTotal=Number(purchase.total_iqd)-Number(previous.rows[0].total);if(total>remainingTotal)total=remainingTotal;if(total<=0)return {status:409,body:{error:'PURCHASE_RETURN_AMOUNT_INVALID'}};const payableReversal=Math.min(total,Number(purchase.debt_remaining_iqd)),refund=total-payableReversal;let refundMethod=null;if(refund>0){const method=purchase.payment_method==='mixed'?String(body.refund_method||'cash'):purchase.payment_method;refundMethod=['cash','card','bank'].includes(method)?method:'cash';}if(payableReversal>0){await client.query('UPDATE purchases SET debt_remaining_iqd=debt_remaining_iqd-$1 WHERE id=$2',[payableReversal,purchaseId]);if(!purchase.supplier_id)throw new Error('PURCHASE_DEBT_WITHOUT_SUPPLIER');await client.query('UPDATE supplier_balances SET balance_iqd=GREATEST(0,balance_iqd-$1),updated_at=now() WHERE market_id=$2 AND supplier_id=$3',[payableReversal,user.market_id,purchase.supplier_id]);}const {receiptNumber}=await nextReceipt(client,user,businessDate(config.timeZone));const returnId=createId('purchase-return');await client.query(`INSERT INTO purchase_returns (id,market_id,branch_id,purchase_id,return_number,total_iqd,payable_reversal_iqd,refund_iqd,refund_method,returned_by,device_id,reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[returnId,user.market_id,user.branch_id,purchaseId,`PRT-${receiptNumber}`,total,payableReversal,refund,refundMethod,user.id,gate.device.id,String(body.reason||'').slice(0,1000)||null]);let allReturned=true;const all=await client.query('SELECT id,quantity FROM purchase_items WHERE purchase_id=$1',[purchaseId]);for(const line of lines){await client.query('INSERT INTO purchase_return_items (id,return_id,purchase_item_id,product_id,quantity,amount_iqd) VALUES ($1,$2,$3,$4,$5,$6)',[createId('purchase-return-item'),returnId,line.row.id,line.row.product_id,line.qty,line.amount]);await client.query('UPDATE products SET stock_quantity=$1,version=version+1,updated_at=now() WHERE id=$2',[line.after,line.row.product_id]);await client.query(`INSERT INTO stock_movements (id,market_id,branch_id,product_id,movement_type,quantity_delta,stock_before,stock_after,reference_type,reference_id,created_by) VALUES ($1,$2,$3,$4,'return',$5,$6,$7,'purchase-return',$8,$9)`,[createId('stock'),user.market_id,user.branch_id,line.row.product_id,-line.qty,line.before,line.after,returnId,user.id]);}for(const original of all.rows){const before=priorMap.get(original.id)||0,now=lines.find(l=>l.row.id===original.id)?.qty||0;if(before+now<Number(original.quantity)-1e-9){allReturned=false;break;}}if(allReturned)await client.query("UPDATE purchases SET status='returned' WHERE id=$1",[purchaseId]);const batch=createId('journal');await client.query(`INSERT INTO journal_batches (id,market_id,branch_id,reference_type,reference_id,description,posted_by) VALUES ($1,$2,$3,'purchase-return',$4,$5,$6)`,[batch,user.market_id,user.branch_id,returnId,`Purchase return PRT-${receiptNumber}`,user.id]);const journal=[];if(payableReversal>0)journal.push(['2100-ACCOUNTS-PAYABLE',payableReversal,0]);if(refund>0)journal.push([paymentAccount(refundMethod),refund,0]);journal.push(['1300-INVENTORY',0,total]);const d=journal.reduce((s,l)=>s+l[1],0),c=journal.reduce((s,l)=>s+l[2],0);if(d!==c)throw new Error(`UNBALANCED_PURCHASE_RETURN_JOURNAL:${d}:${c}`);for(const [account,debit,credit] of journal)await client.query('INSERT INTO journal_lines (id,batch_id,account_code,debit_iqd,credit_iqd) VALUES ($1,$2,$3,$4,$5)',[createId('jl'),batch,account,debit,credit]);const payload={return_id:returnId,return_number:`PRT-${receiptNumber}`,total_iqd:total,payable_reversal_iqd:payableReversal,refund_iqd:refund,refund_method:refundMethod,fully_returned:allReturned};await saveOperationIdempotency(client,user,'purchase.return',key,requestHash,payload);return {status:201,body:payload};});return json(res,result.status,result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/sales/commit') {
        const user = await authenticate(pool, req);
        if (!user) return json(res, 401, { error: 'AUTH_REQUIRED' });
        if (!['owner', 'admin', 'cashier'].includes(user.role_type)) return json(res, 403, { error: 'PERMISSION_DENIED' });
        if (!user.branch_id) return json(res, 409, { error: 'BRANCH_REQUIRED' });

        const idempotencyKey = String(req.headers['idempotency-key'] ?? '').trim();
        if (!idempotencyKey || idempotencyKey.length > 128) return json(res, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' });
        const body = await readJson(req);
        if (!validOperationId(body.client_operation_id) || !validPaymentMethod(body.payment_method) || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 250) {
          return json(res, 422, { error: 'INVALID_SALE_REQUEST' });
        }
        if (body.payment_method === 'debt' && Number(body.paid_iqd || 0) !== 0) return json(res, 422, { error: 'INVALID_PAYMENT_SPLIT' });
        const paidIqd = Number(body.paid_iqd || 0);
        const discountIqd = Number(body.discount_iqd || 0);
        if (!Number.isSafeInteger(paidIqd) || paidIqd < 0 || !Number.isSafeInteger(discountIqd) || discountIqd < 0) return json(res, 422, { error: 'INVALID_MONEY' });
        if (discountIqd > 0 && !['owner', 'admin'].includes(user.role_type)) return json(res, 403, { error: 'DISCOUNT_REQUIRES_APPROVAL' });

        const normalizedItems = body.items.map(item => ({ product_id: String(item.product_id || ''), quantity: Number(item.quantity) }));
        if (normalizedItems.some(item => !item.product_id || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 1_000_000 || Math.round(item.quantity * 1000) !== item.quantity * 1000)) {
          return json(res, 422, { error: 'INVALID_ITEM_QUANTITY' });
        }
        const requestHash = stableSaleHash({ ...body, items: normalizedItems, paid_iqd: paidIqd, discount_iqd: discountIqd });
        const date = businessDate(config.timeZone);

        const result = await withTransaction(pool, async client => {
          const device=await registeredDevice(client,user,req); if(!device)return {status:409,body:{error:'DEVICE_NOT_REGISTERED'}};
          await lockBranchWriter(client,user);
          const offlineReceipt=body.offline_receipt||null;
          if(!offlineReceipt){const leaseGate=await enforceWriterLease(client,user,device.id);if(leaseGate)return {status:423,body:leaseGate};}
          await client.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            [JSON.stringify([user.market_id, 'sale.commit', idempotencyKey])]
          );
          const existing = await client.query(
            `SELECT request_hash, response_json FROM idempotency_keys
              WHERE market_id = $1 AND scope = 'sale.commit' AND idempotency_key = $2
              FOR UPDATE`,
            [user.market_id, idempotencyKey]
          );
          if (existing.rows[0]) {
            if (existing.rows[0].request_hash !== requestHash) return { status: 409, body: { error: 'IDEMPOTENCY_CONFLICT' } };
            return { status: 200, body: existing.rows[0].response_json };
          }

          const operation = await client.query(
            'SELECT receipt_number, total_iqd, paid_iqd, debt_iqd FROM sales WHERE market_id = $1 AND client_operation_id = $2',
            [user.market_id, body.client_operation_id]
          );
          if (operation.rows[0]) return { status: 409, body: { error: 'CLIENT_OPERATION_ALREADY_USED' } };

          const itemByProduct = new Map();
          for (const item of normalizedItems) itemByProduct.set(item.product_id, (itemByProduct.get(item.product_id) || 0) + item.quantity);
          const productIds = [...itemByProduct.keys()].sort();
          const locked = await client.query(
            `SELECT id, barcode, name, cost_price_iqd, sale_price_iqd, stock_quantity
               FROM products
              WHERE market_id = $1 AND branch_id = $2 AND status = 'active' AND id = ANY($3::text[])
              ORDER BY id
              FOR UPDATE`,
            [user.market_id, user.branch_id, productIds]
          );
          if (locked.rows.length !== productIds.length) return { status: 409, body: { error: 'PRODUCT_UNAVAILABLE' } };

          let subtotal = 0;
          let cogs = 0;
          const lines = [];
          for (const product of locked.rows) {
            const quantity = itemByProduct.get(product.id);
            const stockBefore = Number(product.stock_quantity);
            if (stockBefore + 1e-9 < quantity) return { status: 409, body: { error: 'STOCK_INSUFFICIENT', product_id: product.id, available: stockBefore } };
            const lineTotal = Math.round(Number(product.sale_price_iqd) * quantity);
            const lineCost = Math.round(Number(product.cost_price_iqd) * quantity);
            subtotal += lineTotal;
            cogs += lineCost;
            lines.push({ product, quantity, stockBefore, stockAfter: stockBefore - quantity, lineTotal, lineCost });
          }

          if (discountIqd > subtotal) return { status: 422, body: { error: 'DISCOUNT_EXCEEDS_SUBTOTAL' } };
          const total = subtotal - discountIqd;
          if (paidIqd > total) return { status: 422, body: { error: 'PAID_EXCEEDS_TOTAL' } };
          const debt = total - paidIqd;
          if (debt > 0 && !body.customer_id) return { status: 422, body: { error: 'CUSTOMER_REQUIRED_FOR_DEBT' } };
          if (body.payment_method === 'cash' || body.payment_method === 'card' || body.payment_method === 'bank') {
            if (debt !== 0) return { status: 422, body: { error: 'PAYMENT_METHOD_REQUIRES_FULL_PAYMENT' } };
          }
          if (body.payment_method === 'mixed' && (paidIqd <= 0 || debt <= 0)) return { status: 422, body: { error: 'INVALID_PAYMENT_SPLIT' } };

          let customer = null;
          let balanceBefore = 0;
          if (body.customer_id) {
            const customerResult = await client.query(
              `SELECT id, debt_limit_iqd, status
                 FROM customers
                WHERE id = $1 AND market_id = $2
                FOR UPDATE`,
              [String(body.customer_id), user.market_id]
            );
            customer = customerResult.rows[0];
            if (!customer || customer.status !== 'active') return { status: 409, body: { error: 'CUSTOMER_UNAVAILABLE' } };

            await client.query(
              `INSERT INTO customer_balances (market_id, customer_id, balance_iqd, updated_at)
               VALUES ($1,$2,0,now())
               ON CONFLICT (market_id, customer_id) DO NOTHING`,
              [user.market_id, String(body.customer_id)]
            );
            const balanceResult = await client.query(
              `SELECT balance_iqd
                 FROM customer_balances
                WHERE market_id = $1 AND customer_id = $2
                FOR UPDATE`,
              [user.market_id, String(body.customer_id)]
            );
            balanceBefore = Number(balanceResult.rows[0]?.balance_iqd || 0);
            if (debt > 0 && customer.debt_limit_iqd !== null && balanceBefore + debt > Number(customer.debt_limit_iqd)) {
              return { status: 409, body: { error: 'CREDIT_LIMIT_EXCEEDED', balance_iqd: balanceBefore, debt_limit_iqd: Number(customer.debt_limit_iqd) } };
            }
          }

          let receiptNumber; let saleActorId=user.id;
          if(offlineReceipt){const verified=await validateOfflineReceipt(client,user,device.id,offlineReceipt,config.offlineLeaseSecret);if(verified.error)return {status:409,body:{error:verified.error}};receiptNumber=verified.receiptNumber;saleActorId=verified.capturedByUserId;}else{receiptNumber=(await nextReceipt(client,user,date)).receiptNumber;}
          const saleId = createId('sale');
          await client.query(
            `INSERT INTO sales (id, market_id, branch_id, receipt_number, cashier_id, customer_id, client_operation_id, payment_method, subtotal_iqd, discount_iqd, total_iqd, paid_iqd, debt_iqd, debt_remaining_iqd)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)`,
            [saleId, user.market_id, user.branch_id, receiptNumber, saleActorId, body.customer_id || null, body.client_operation_id, body.payment_method, subtotal, discountIqd, total, paidIqd, debt]
          );

          for (const line of lines) {
            const itemId = createId('sale-item');
            await client.query(
              `INSERT INTO sale_items (id, sale_id, product_id, product_name, barcode, quantity, unit_price_iqd, unit_cost_iqd, line_total_iqd)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [itemId, saleId, line.product.id, line.product.name, line.product.barcode, line.quantity, Number(line.product.sale_price_iqd), Number(line.product.cost_price_iqd), line.lineTotal]
            );
            await client.query('UPDATE products SET stock_quantity = $1, version = version + 1, updated_at = now() WHERE id = $2', [line.stockAfter, line.product.id]);
            await client.query(
              `INSERT INTO stock_movements (id, market_id, branch_id, product_id, movement_type, quantity_delta, stock_before, stock_after, reference_type, reference_id, created_by)
               VALUES ($1,$2,$3,$4,'sale',$5,$6,$7,'sale',$8,$9)`,
              [createId('stock'), user.market_id, user.branch_id, line.product.id, -line.quantity, line.stockBefore, line.stockAfter, saleId, saleActorId]
            );
          }

          const paidMethod = body.payment_method === 'mixed' ? String(body.paid_method || 'cash') : body.payment_method;
          if (paidIqd > 0) {
            if (!['cash','card','bank'].includes(paidMethod)) return { status: 422, body: { error: 'INVALID_PAID_METHOD' } };
            await client.query(
              `INSERT INTO payments (id, market_id, branch_id, sale_id, customer_id, method, amount_iqd, received_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [createId('payment'), user.market_id, user.branch_id, saleId, body.customer_id || null, paidMethod, paidIqd, saleActorId]
            );
          }
          if (debt > 0) {
            await client.query(
              `INSERT INTO customer_balances (market_id, customer_id, balance_iqd, updated_at)
               VALUES ($1,$2,$3,now())
               ON CONFLICT (market_id, customer_id) DO UPDATE SET balance_iqd = customer_balances.balance_iqd + EXCLUDED.balance_iqd, updated_at = now()`,
              [user.market_id, body.customer_id, debt]
            );
          }

          const batchId = createId('journal');
          await client.query(
            `INSERT INTO journal_batches (id, market_id, branch_id, reference_type, reference_id, description, posted_by)
             VALUES ($1,$2,$3,'sale',$4,$5,$6)`,
            [batchId, user.market_id, user.branch_id, saleId, `Sale ${receiptNumber}`, saleActorId]
          );
          const journal = [];
          if (paidIqd > 0) journal.push([paymentAccount(paidMethod), paidIqd, 0]);
          if (debt > 0) journal.push(['1200-ACCOUNTS-RECEIVABLE', debt, 0]);
          journal.push(['4000-SALES-REVENUE', 0, total]);
          if (cogs > 0) {
            journal.push(['5000-COGS', cogs, 0]);
            journal.push(['1300-INVENTORY', 0, cogs]);
          }
          const debits = journal.reduce((sum, line) => sum + line[1], 0);
          const credits = journal.reduce((sum, line) => sum + line[2], 0);
          if (debits !== credits) throw new Error(`UNBALANCED_JOURNAL:${debits}:${credits}`);
          for (const [account, debit, credit] of journal) {
            if (!account) throw new Error('JOURNAL_ACCOUNT_MISSING');
            await client.query('INSERT INTO journal_lines (id, batch_id, account_code, debit_iqd, credit_iqd) VALUES ($1,$2,$3,$4,$5)', [createId('journal-line'), batchId, account, debit, credit]);
          }

          const response = {
            sale_id: saleId,
            receipt_number: receiptNumber,
            payment_method: body.payment_method,
            paid_method: paidIqd > 0 ? paidMethod : null,
            customer_id: body.customer_id || null,
            subtotal_iqd: subtotal,
            discount_iqd: discountIqd,
            total_iqd: total,
            paid_iqd: paidIqd,
            debt_iqd: debt,
            customer_balance_iqd: customer ? balanceBefore + debt : null,
            items: lines.map(line => ({
              product_id: line.product.id,
              product_name: line.product.name,
              barcode: line.product.barcode,
              quantity: line.quantity,
              unit_price_iqd: Number(line.product.sale_price_iqd),
              unit_cost_iqd: Number(line.product.cost_price_iqd),
              line_total_iqd: line.lineTotal,
              stock_after: line.stockAfter,
            })),
          };
          await client.query(
            `INSERT INTO idempotency_keys (market_id, scope, idempotency_key, request_hash, response_json, user_id)
             VALUES ($1,'sale.commit',$2,$3,$4::jsonb,$5)`,
            [user.market_id, idempotencyKey, requestHash, JSON.stringify(response), user.id]
          );
          return { status: 201, body: response };
        });
        return json(res, result.status, result.body);
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
