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
  const financial = await fs.readFile(new URL('../db/002_financial.sql', import.meta.url), 'utf8');
  const catalog = await fs.readFile(new URL('../db/003_catalog.sql', import.meta.url), 'utf8');
  const dailyAuthority = await fs.readFile(new URL('../db/004_daily_authority.sql', import.meta.url), 'utf8');
  await pool.query(migration);
  await pool.query(financial);
  await pool.query(catalog);
  await pool.query(dailyAuthority);
  await pool.query('TRUNCATE journal_lines, journal_batches, stock_movements, payments, sale_items, sales, customer_balances, customers, products, idempotency_keys, receipt_sequences, auth_throttle, sessions, users, branches, markets CASCADE');
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


test('authoritative sale commit updates stock, debt and balanced journal exactly once', async () => {
  cookie = '';
  const login = await request('/api/v1/login', { method: 'POST', body: { username: 'owner', password: 'SecurePass9' } });
  assert.equal(login.response.status, 200);
  const context = await pool.query('SELECT u.market_id, u.branch_id FROM users u WHERE u.username = $1', ['owner']);
  const { market_id: marketId, branch_id: branchId } = context.rows[0];
  await pool.query(
    `INSERT INTO products (id, market_id, branch_id, barcode, name, cost_price_iqd, sale_price_iqd, stock_quantity)
     VALUES ('prod-1',$1,$2,'1001','Water',400,1000,10), ('prod-2',$1,$2,'1002','Juice',700,1500,10)`,
    [marketId, branchId]
  );
  await pool.query(
    `INSERT INTO customers (id, market_id, code, name, debt_limit_iqd) VALUES ('cust-1',$1,'C001','Customer',10000)`,
    [marketId]
  );

  const body = {
    client_operation_id: 'device-A-sale-0001',
    customer_id: 'cust-1',
    payment_method: 'mixed',
    paid_method: 'cash',
    paid_iqd: 2000,
    items: [{ product_id: 'prod-1', quantity: 2 }, { product_id: 'prod-2', quantity: 1 }],
  };
  const first = await request('/api/v1/sales/commit', { method: 'POST', headers: { 'idempotency-key': 'sale-key-0001' }, body });
  assert.equal(first.response.status, 201);
  assert.equal(first.json.total_iqd, 3500);
  assert.equal(first.json.paid_iqd, 2000);
  assert.equal(first.json.debt_iqd, 1500);

  const retry = await request('/api/v1/sales/commit', { method: 'POST', headers: { 'idempotency-key': 'sale-key-0001' }, body });
  assert.equal(retry.response.status, 200);
  assert.equal(retry.json.sale_id, first.json.sale_id);
  assert.equal(retry.json.receipt_number, first.json.receipt_number);

  const changedChannel = await request('/api/v1/sales/commit', {
    method: 'POST',
    headers: { 'idempotency-key': 'sale-key-0001' },
    body: { ...body, paid_method: 'bank' },
  });
  assert.equal(changedChannel.response.status, 409);
  assert.equal(changedChannel.json.error, 'IDEMPOTENCY_CONFLICT');

  const stock = await pool.query("SELECT id, stock_quantity FROM products WHERE id IN ('prod-1','prod-2') ORDER BY id");
  assert.deepEqual(stock.rows.map(row => [row.id, Number(row.stock_quantity)]), [['prod-1', 8], ['prod-2', 9]]);
  const balance = await pool.query("SELECT balance_iqd FROM customer_balances WHERE customer_id = 'cust-1'");
  assert.equal(Number(balance.rows[0].balance_iqd), 1500);
  const saleCount = await pool.query("SELECT count(*)::int AS count FROM sales WHERE client_operation_id = 'device-A-sale-0001'");
  assert.equal(saleCount.rows[0].count, 1);
  const journal = await pool.query(
    `SELECT COALESCE(sum(jl.debit_iqd),0)::bigint AS debit, COALESCE(sum(jl.credit_iqd),0)::bigint AS credit
       FROM journal_lines jl JOIN journal_batches jb ON jb.id = jl.batch_id WHERE jb.reference_id = $1`,
    [first.json.sale_id]
  );
  assert.equal(Number(journal.rows[0].debit), Number(journal.rows[0].credit));
});

test('concurrent cashiers cannot oversell the same locked stock', async () => {
  const before = await pool.query("SELECT stock_quantity FROM products WHERE id = 'prod-2'");
  await pool.query("UPDATE products SET stock_quantity = 1 WHERE id = 'prod-2'");
  const make = index => request('/api/v1/sales/commit', {
    method: 'POST',
    headers: { 'idempotency-key': `oversell-key-${index}` },
    body: {
      client_operation_id: `oversell-operation-${index}`,
      payment_method: 'cash',
      paid_iqd: 1500,
      items: [{ product_id: 'prod-2', quantity: 1 }],
    },
  });
  const results = await Promise.all([make(1), make(2)]);
  assert.deepEqual(results.map(result => result.response.status).sort(), [201, 409]);
  const after = await pool.query("SELECT stock_quantity FROM products WHERE id = 'prod-2'");
  assert.equal(Number(after.rows[0].stock_quantity), 0);
  await pool.query('UPDATE products SET stock_quantity = $1 WHERE id = $2', [before.rows[0].stock_quantity, 'prod-2']);
});

test('debt sale is rejected before mutation when customer credit limit would be exceeded', async () => {
  await pool.query("UPDATE customers SET debt_limit_iqd = 1000 WHERE id = 'cust-1'");
  const stockBefore = await pool.query("SELECT stock_quantity FROM products WHERE id = 'prod-1'");
  const result = await request('/api/v1/sales/commit', {
    method: 'POST',
    headers: { 'idempotency-key': 'credit-limit-key-1' },
    body: {
      client_operation_id: 'credit-limit-operation-1',
      customer_id: 'cust-1',
      payment_method: 'debt',
      paid_iqd: 0,
      items: [{ product_id: 'prod-1', quantity: 1 }],
    },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.json.error, 'CREDIT_LIMIT_EXCEEDED');
  const stockAfter = await pool.query("SELECT stock_quantity FROM products WHERE id = 'prod-1'");
  assert.equal(Number(stockAfter.rows[0].stock_quantity), Number(stockBefore.rows[0].stock_quantity));
});


test('concurrent debt sales serialize credit limit checks', async () => {
  const context = await pool.query('SELECT market_id, branch_id FROM users WHERE username = $1', ['owner']);
  const { market_id: marketId, branch_id: branchId } = context.rows[0];
  await pool.query(
    `INSERT INTO products (id, market_id, branch_id, barcode, name, cost_price_iqd, sale_price_iqd, stock_quantity)
     VALUES ('prod-debt-race',$1,$2,'1999','Debt Race Product',300,1000,3)
     ON CONFLICT (id) DO UPDATE SET stock_quantity = 3, sale_price_iqd = 1000`,
    [marketId, branchId]
  );
  await pool.query("UPDATE customers SET debt_limit_iqd = 1500 WHERE id = 'cust-1'");
  await pool.query(
    `INSERT INTO customer_balances (market_id, customer_id, balance_iqd, updated_at)
     VALUES ($1,'cust-1',0,now())
     ON CONFLICT (market_id, customer_id) DO UPDATE SET balance_iqd = 0, updated_at = now()`,
    [marketId]
  );

  const make = index => request('/api/v1/sales/commit', {
    method: 'POST',
    headers: { 'idempotency-key': `debt-race-key-${index}` },
    body: {
      client_operation_id: `debt-race-operation-${index}`,
      customer_id: 'cust-1',
      payment_method: 'debt',
      paid_iqd: 0,
      items: [{ product_id: 'prod-debt-race', quantity: 1 }],
    },
  });
  const results = await Promise.all([make(1), make(2)]);
  assert.deepEqual(results.map(result => result.response.status).sort(), [201, 409]);
  const rejected = results.find(result => result.response.status === 409);
  assert.equal(rejected.json.error, 'CREDIT_LIMIT_EXCEEDED');

  const balance = await pool.query("SELECT balance_iqd FROM customer_balances WHERE customer_id = 'cust-1'");
  assert.equal(Number(balance.rows[0].balance_iqd), 1000);
  const stock = await pool.query("SELECT stock_quantity FROM products WHERE id = 'prod-debt-race'");
  assert.equal(Number(stock.rows[0].stock_quantity), 2);
  const saleCount = await pool.query("SELECT count(*)::int AS count FROM sales WHERE client_operation_id LIKE 'debt-race-operation-%'");
  assert.equal(saleCount.rows[0].count, 1);
});


test('concurrent identical idempotency retries commit exactly once', async () => {
  const context = await pool.query('SELECT market_id, branch_id FROM users WHERE username = $1', ['owner']);
  const { market_id: marketId, branch_id: branchId } = context.rows[0];
  await pool.query(
    `INSERT INTO products (id, market_id, branch_id, barcode, name, cost_price_iqd, sale_price_iqd, stock_quantity)
     VALUES ('prod-idem-race',$1,$2,'1888','Idempotency Race Product',300,900,2)
     ON CONFLICT (id) DO UPDATE SET stock_quantity = 2, sale_price_iqd = 900`,
    [marketId, branchId]
  );

  const body = {
    client_operation_id: 'idem-race-operation-1',
    payment_method: 'cash',
    paid_iqd: 900,
    items: [{ product_id: 'prod-idem-race', quantity: 1 }],
  };
  const make = () => request('/api/v1/sales/commit', {
    method: 'POST',
    headers: { 'idempotency-key': 'idem-race-key-1' },
    body,
  });
  const results = await Promise.all([make(), make()]);
  assert.deepEqual(results.map(result => result.response.status).sort(), [200, 201]);
  assert.equal(results[0].json.sale_id, results[1].json.sale_id);
  assert.equal(results[0].json.receipt_number, results[1].json.receipt_number);

  const stock = await pool.query("SELECT stock_quantity FROM products WHERE id = 'prod-idem-race'");
  assert.equal(Number(stock.rows[0].stock_quantity), 1);
  const sales = await pool.query("SELECT count(*)::int AS count FROM sales WHERE client_operation_id = 'idem-race-operation-1'");
  assert.equal(sales.rows[0].count, 1);
});


test('catalog imports bind products to authenticated tenant and are idempotent', async () => {
  const context = await pool.query('SELECT market_id,branch_id FROM users WHERE username=$1', ['owner']);
  const { market_id: marketId, branch_id: branchId } = context.rows[0];
  const body = { items: [{ id:'prod-import-1', market_id:'evil-market', branch_id:'evil-branch', barcode:'CAT-001', name:'Imported Product', cost_price_iqd:500, sale_price_iqd:1000, stock_quantity:7, low_stock_limit:2 }] };
  const first = await request('/api/v1/catalog/products/import', { method:'POST', headers:{'idempotency-key':'product-import-key-1'}, body });
  assert.equal(first.response.status,201);
  assert.equal(first.json.imported,1);
  const retry = await request('/api/v1/catalog/products/import', { method:'POST', headers:{'idempotency-key':'product-import-key-1'}, body });
  assert.equal(retry.response.status,200);
  assert.equal(retry.json.items[0].server_id,first.json.items[0].server_id);

  const row = await pool.query("SELECT market_id,branch_id,stock_quantity FROM products WHERE barcode='CAT-001'");
  assert.equal(row.rows[0].market_id,marketId);
  assert.equal(row.rows[0].branch_id,branchId);
  assert.equal(Number(row.rows[0].stock_quantity),7);

  const conflict = await request('/api/v1/catalog/products/import', { method:'POST', headers:{'idempotency-key':'product-import-key-1'}, body:{items:[{...body.items[0],sale_price_iqd:1200}]} });
  assert.equal(conflict.response.status,409);
  assert.equal(conflict.json.error,'IDEMPOTENCY_CONFLICT');

  const list = await request('/api/v1/catalog/products?limit=500');
  assert.equal(list.response.status,200);
  assert.ok(list.json.items.some(item => item.barcode === 'CAT-001' && item.market_id === marketId));
});

test('customer import creates authoritative opening balance and ignores injected tenant', async () => {
  const context = await pool.query('SELECT market_id FROM users WHERE username=$1', ['owner']);
  const marketId = context.rows[0].market_id;
  const body = { items:[{ id:'cust-import-1', market_id:'evil-market', code:'C-IMPORT-1', name:'Imported Customer', debt_limit_iqd:5000, opening_balance_iqd:1250 }] };
  const imported = await request('/api/v1/customers/import', { method:'POST', headers:{'idempotency-key':'customer-import-key-1'}, body });
  assert.equal(imported.response.status,201);
  const row = await pool.query("SELECT c.market_id,cb.balance_iqd FROM customers c JOIN customer_balances cb ON cb.customer_id=c.id AND cb.market_id=c.market_id WHERE c.code='C-IMPORT-1'");
  assert.equal(row.rows[0].market_id,marketId);
  assert.equal(Number(row.rows[0].balance_iqd),1250);
  const list = await request('/api/v1/customers?limit=500');
  assert.equal(list.response.status,200);
  assert.ok(list.json.items.some(item => item.code === 'C-IMPORT-1' && item.balance_iqd === 1250));
});


test('product save rejects stale optimistic version and tenant injection', async () => {
  const create=await request('/api/v1/catalog/products/save',{method:'POST',headers:{'idempotency-key':'prod-save-create-1'},body:{market_id:'evil',branch_id:'evil',barcode:'SAVE-001',name:'Saved Product',cost_price_iqd:100,sale_price_iqd:250,stock_quantity:4,low_stock_limit:1}});
  assert.equal(create.response.status,201); const p=create.json.product; assert.equal(p.version,1);
  const context=await pool.query('SELECT market_id,branch_id FROM users WHERE username=$1',['owner']);
  assert.equal(p.market_id,context.rows[0].market_id); assert.equal(p.branch_id,context.rows[0].branch_id);
  const edit=await request('/api/v1/catalog/products/save',{method:'POST',headers:{'idempotency-key':'prod-save-edit-1'},body:{id:p.id,version:1,barcode:'SAVE-001',name:'Saved Product v2',cost_price_iqd:100,sale_price_iqd:300,stock_quantity:4,low_stock_limit:1}});
  assert.equal(edit.response.status,200); assert.equal(edit.json.product.version,2);
  const stale=await request('/api/v1/catalog/products/save',{method:'POST',headers:{'idempotency-key':'prod-save-stale-1'},body:{id:p.id,version:1,barcode:'SAVE-001',name:'stale',cost_price_iqd:100,sale_price_iqd:999,stock_quantity:4,low_stock_limit:1}});
  assert.equal(stale.response.status,409); assert.equal(stale.json.error,'VERSION_CONFLICT');
});

test('customer save rejects stale optimistic version', async () => {
  const create=await request('/api/v1/customers/save',{method:'POST',headers:{'idempotency-key':'cust-save-create-1'},body:{code:'SAVE-C-1',name:'Saved Customer',debt_limit_iqd:5000}});
  assert.equal(create.response.status,201); const c=create.json.customer; assert.equal(c.version,1);
  const edit=await request('/api/v1/customers/save',{method:'POST',headers:{'idempotency-key':'cust-save-edit-1'},body:{id:c.id,version:1,code:'SAVE-C-1',name:'Saved Customer v2',debt_limit_iqd:6000}});
  assert.equal(edit.response.status,200); assert.equal(edit.json.customer.version,2);
  const stale=await request('/api/v1/customers/save',{method:'POST',headers:{'idempotency-key':'cust-save-stale-1'},body:{id:c.id,version:1,code:'SAVE-C-1',name:'stale',debt_limit_iqd:9000}});
  assert.equal(stale.response.status,409); assert.equal(stale.json.error,'VERSION_CONFLICT');
});

test('sale response contains authoritative item pricing and stock-after', async () => {
  const context=await pool.query('SELECT market_id,branch_id FROM users WHERE username=$1',['owner']); const {market_id:marketId,branch_id:branchId}=context.rows[0];
  await pool.query(`INSERT INTO products (id,market_id,branch_id,barcode,name,cost_price_iqd,sale_price_iqd,stock_quantity) VALUES ('prod-response',$1,$2,'RESP-1','Response Product',300,777,5) ON CONFLICT (id) DO UPDATE SET sale_price_iqd=777,stock_quantity=5`,[marketId,branchId]);
  const sale=await request('/api/v1/sales/commit',{method:'POST',headers:{'idempotency-key':'response-sale-key'},body:{client_operation_id:'response-sale-operation',payment_method:'cash',paid_iqd:1554,items:[{product_id:'prod-response',quantity:2}]}});
  assert.equal(sale.response.status,201); assert.equal(sale.json.items[0].unit_price_iqd,777); assert.equal(sale.json.items[0].line_total_iqd,1554); assert.equal(sale.json.items[0].stock_after,3);
});
