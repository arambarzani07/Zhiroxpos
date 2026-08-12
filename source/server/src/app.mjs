import { createHash } from 'node:crypto';
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
const validOperationId = value => /^[A-Za-z0-9._:-]{8,128}$/.test(String(value ?? ''));
const validPaymentMethod = value => ['cash', 'card', 'bank', 'debt', 'mixed'].includes(String(value ?? ''));

const stableSaleHash = body => sha256(JSON.stringify({
  client_operation_id: body.client_operation_id,
  customer_id: body.customer_id || null,
  payment_method: body.payment_method,
  paid_method: body.paid_method || null,
  paid_iqd: body.paid_iqd,
  discount_iqd: body.discount_iqd || 0,
  items: [...body.items].map(item => ({ product_id: item.product_id, quantity: Number(item.quantity) })).sort((a, b) => a.product_id.localeCompare(b.product_id)),
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

          const { receiptNumber } = await nextReceipt(client, user, date);
          const saleId = createId('sale');
          await client.query(
            `INSERT INTO sales (id, market_id, branch_id, receipt_number, cashier_id, customer_id, client_operation_id, payment_method, subtotal_iqd, discount_iqd, total_iqd, paid_iqd, debt_iqd)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [saleId, user.market_id, user.branch_id, receiptNumber, user.id, body.customer_id || null, body.client_operation_id, body.payment_method, subtotal, discountIqd, total, paidIqd, debt]
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
              [createId('stock'), user.market_id, user.branch_id, line.product.id, -line.quantity, line.stockBefore, line.stockAfter, saleId, user.id]
            );
          }

          const paidMethod = body.payment_method === 'mixed' ? String(body.paid_method || 'cash') : body.payment_method;
          if (paidIqd > 0) {
            if (!['cash','card','bank'].includes(paidMethod)) return { status: 422, body: { error: 'INVALID_PAID_METHOD' } };
            await client.query(
              `INSERT INTO payments (id, market_id, branch_id, sale_id, customer_id, method, amount_iqd, received_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [createId('payment'), user.market_id, user.branch_id, saleId, body.customer_id || null, paidMethod, paidIqd, user.id]
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
            [batchId, user.market_id, user.branch_id, saleId, `Sale ${receiptNumber}`, user.id]
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
            subtotal_iqd: subtotal,
            discount_iqd: discountIqd,
            total_iqd: total,
            paid_iqd: paidIqd,
            debt_iqd: debt,
            customer_balance_iqd: customer ? balanceBefore + debt : null,
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
