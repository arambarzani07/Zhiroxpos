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
let activeDeviceId = '';

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      origin: 'http://127.0.0.1',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(activeDeviceId ? { 'x-device-id': activeDeviceId } : {}),
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
  const offlineLeases = await fs.readFile(new URL('../db/005_offline_leases.sql', import.meta.url), 'utf8');
  const userManagement = await fs.readFile(new URL('../db/006_user_management.sql', import.meta.url), 'utf8');
  const operations = await fs.readFile(new URL('../db/009_operations.sql', import.meta.url), 'utf8');
  const procurement = await fs.readFile(new URL('../db/010_procurement.sql', import.meta.url), 'utf8');
  await pool.query(migration);
  await pool.query(financial);
  await pool.query(catalog);
  await pool.query(dailyAuthority);
  await pool.query(offlineLeases);
  await pool.query(userManagement);
  await pool.query(operations);
  await pool.query(procurement);
  await pool.query('TRUNCATE purchase_return_items,purchase_returns,supplier_payment_allocations,supplier_payments,purchase_items,purchases,supplier_balances,suppliers,cash_sessions,expenses,sale_return_items,sale_returns,customer_receipt_allocations,customer_receipts,security_audit, receipt_blocks, offline_leases, devices, journal_lines, journal_batches, stock_movements, payments, sale_items, sales, customer_balances, customers, products, idempotency_keys, receipt_sequences, auth_throttle, sessions, users, branches, markets CASCADE');
  const handler = createHandler(pool, {
    production: false,
    bootstrapToken: 'integration-bootstrap-token',
    offlineLeaseSecret: 'integration-offline-lease-secret-which-is-not-production',
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
  activeDeviceId = 'test-device-main-0001';
  const registered = await request('/api/v1/devices/register', { method:'POST', body:{ device_id:activeDeviceId, label:'Main test POS' } });
  assert.equal(registered.response.status,200);

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


test('offline writer lease blocks a different device and reserves a unique receipt block', async () => {
  const acquired=await request('/api/v1/offline/lease/acquire',{method:'POST',headers:{'idempotency-key':'lease-acquire-1'},body:{duration_minutes:30,block_size:20,business_date:'2026-08-12'}});
  assert.equal(acquired.response.status,201); assert.equal(acquired.json.block.end_sequence-acquired.json.block.start_sequence+1,20); assert.ok(acquired.json.lease_token);
  const retry=await request('/api/v1/offline/lease/acquire',{method:'POST',headers:{'idempotency-key':'lease-acquire-1'},body:{duration_minutes:30,block_size:20,business_date:'2026-08-12'}});
  assert.equal(retry.response.status,200); assert.equal(retry.json.lease_id,acquired.json.lease_id); assert.equal(retry.json.lease_token,acquired.json.lease_token);

  const mainDevice=activeDeviceId; activeDeviceId='test-device-other-0002';
  const reg=await request('/api/v1/devices/register',{method:'POST',body:{device_id:activeDeviceId,label:'Other POS'}}); assert.equal(reg.response.status,200);
  const context=await pool.query('SELECT market_id,branch_id FROM users WHERE username=$1',['owner']); const {market_id:marketId,branch_id:branchId}=context.rows[0];
  await pool.query(`INSERT INTO products (id,market_id,branch_id,barcode,name,cost_price_iqd,sale_price_iqd,stock_quantity) VALUES ('lease-product',$1,$2,'LEASE-P','Lease Product',100,500,3) ON CONFLICT (id) DO UPDATE SET stock_quantity=3`,[marketId,branchId]);
  const blocked=await request('/api/v1/sales/commit',{method:'POST',headers:{'idempotency-key':'blocked-other-sale'},body:{client_operation_id:'blocked-other-operation',payment_method:'cash',paid_iqd:500,items:[{product_id:'lease-product',quantity:1}]}});
  assert.equal(blocked.response.status,423); assert.equal(blocked.json.error,'BRANCH_OFFLINE_LEASE_ACTIVE');
  activeDeviceId=mainDevice;

  const seq=acquired.json.block.start_sequence; const receipt=`${acquired.json.block.receipt_prefix}-20260812-${String(seq).padStart(6,'0')}`;
  const offlineBody={client_operation_id:'offline-operation-1',payment_method:'cash',paid_iqd:500,items:[{product_id:'lease-product',quantity:1}],offline_receipt:{lease_id:acquired.json.lease_id,lease_token:acquired.json.lease_token,block_id:acquired.json.block.id,receipt_number:receipt,business_date:'2026-08-12',sequence:seq,captured_at:new Date(acquired.json.starts_at).toISOString()}};
  const offline=await request('/api/v1/sales/commit',{method:'POST',headers:{'idempotency-key':'offline-sale-key-1'},body:offlineBody}); assert.equal(offline.response.status,201); assert.equal(offline.json.receipt_number,receipt);
  const attribution=await pool.query('SELECT cashier_id FROM sales WHERE id=$1',[offline.json.sale_id]); const leaseActor=await pool.query('SELECT created_by FROM offline_leases WHERE id=$1',[acquired.json.lease_id]); assert.equal(attribution.rows[0].cashier_id,leaseActor.rows[0].created_by);
  const release=await request('/api/v1/offline/lease/release',{method:'POST',body:{lease_id:acquired.json.lease_id,lease_token:acquired.json.lease_token}}); assert.equal(release.response.status,200);
  const stock=await pool.query("SELECT stock_quantity FROM products WHERE id='lease-product'"); assert.equal(Number(stock.rows[0].stock_quantity),2);
});

test('offline receipt outside assigned block is rejected without stock mutation', async () => {
  const acquired=await request('/api/v1/offline/lease/acquire',{method:'POST',headers:{'idempotency-key':'lease-acquire-2'},body:{duration_minutes:30,block_size:10,business_date:'2026-08-12'}}); assert.equal(acquired.response.status,201);
  const before=await pool.query("SELECT stock_quantity FROM products WHERE id='lease-product'");
  const seq=acquired.json.block.end_sequence+1; const receipt=`${acquired.json.block.receipt_prefix}-20260812-${String(seq).padStart(6,'0')}`;
  const invalid=await request('/api/v1/sales/commit',{method:'POST',headers:{'idempotency-key':'offline-invalid-key'},body:{client_operation_id:'offline-invalid-operation',payment_method:'cash',paid_iqd:500,items:[{product_id:'lease-product',quantity:1}],offline_receipt:{lease_id:acquired.json.lease_id,lease_token:acquired.json.lease_token,block_id:acquired.json.block.id,receipt_number:receipt,business_date:'2026-08-12',sequence:seq,captured_at:new Date(acquired.json.starts_at).toISOString()}}});
  assert.equal(invalid.response.status,409); assert.equal(invalid.json.error,'OFFLINE_RECEIPT_BLOCK_INVALID'); const after=await pool.query("SELECT stock_quantity FROM products WHERE id='lease-product'"); assert.equal(Number(after.rows[0].stock_quantity),Number(before.rows[0].stock_quantity));
  await request('/api/v1/offline/lease/release',{method:'POST',body:{lease_id:acquired.json.lease_id,lease_token:acquired.json.lease_token}});
});


test('owner can create and block a cashier while server stores only a password hash', async () => {
  const context=await pool.query('SELECT branch_id FROM users WHERE username=$1',['owner']); const branchId=context.rows[0].branch_id;
  const created=await request('/api/v1/users/save',{method:'POST',body:{branch_id:branchId,username:'cashier19',full_name:'Cashier 19',role_type:'cashier',status:'active',password:'CashierPass19'}}); assert.equal(created.response.status,201); const cashier=created.json.user; assert.equal(cashier.version,1);
  const stored=await pool.query('SELECT password_hash,password_salt FROM users WHERE id=$1',[cashier.id]); assert.notEqual(stored.rows[0].password_hash,'CashierPass19'); assert.ok(stored.rows[0].password_salt);
  const ownerCookie=cookie; cookie=''; const cashierLogin=await request('/api/v1/login',{method:'POST',body:{username:'cashier19',password:'CashierPass19'}}); assert.equal(cashierLogin.response.status,200); const cashierCookie=cookie;
  const forbidden=await request('/api/v1/users'); assert.equal(forbidden.response.status,403);
  cookie=ownerCookie; const blocked=await request('/api/v1/users/save',{method:'POST',body:{id:cashier.id,version:1,branch_id:branchId,username:'cashier19',full_name:'Cashier 19',role_type:'cashier',status:'blocked'}}); assert.equal(blocked.response.status,200); assert.equal(blocked.json.user.version,2);
  cookie=cashierCookie; const staleSession=await request('/api/v1/session'); assert.equal(staleSession.response.status,401); const blockedLogin=await request('/api/v1/login',{method:'POST',body:{username:'cashier19',password:'CashierPass19'}}); assert.equal(blockedLogin.response.status,401); cookie=ownerCookie;
});

test('stale user version is rejected and sole owner cannot demote or block self', async () => {
  const owner=await pool.query("SELECT id,branch_id,username,full_name,version FROM users WHERE username='owner'"); const row=owner.rows[0];
  const stale=await request('/api/v1/users/save',{method:'POST',body:{id:row.id,version:999,branch_id:row.branch_id,username:row.username,full_name:row.full_name,role_type:'owner',status:'active'}}); assert.equal(stale.response.status,409); assert.equal(stale.json.error,'VERSION_CONFLICT');
  const selfBlock=await request('/api/v1/users/save',{method:'POST',body:{id:row.id,version:Number(row.version),branch_id:row.branch_id,username:row.username,full_name:row.full_name,role_type:'owner',status:'blocked'}}); assert.equal(selfBlock.response.status,409); assert.equal(selfBlock.json.error,'CANNOT_DEMOTE_OR_BLOCK_SELF');
});

test('password reset revokes active sessions and requires the new password', async () => {
  const cashier=await pool.query("SELECT id FROM users WHERE username='cashier19'"); const id=cashier.rows[0].id; await pool.query("UPDATE users SET status='active' WHERE id=$1",[id]);
  const ownerCookie=cookie; cookie=''; let login=await request('/api/v1/login',{method:'POST',body:{username:'cashier19',password:'CashierPass19'}}); assert.equal(login.response.status,200); const oldSession=cookie;
  cookie=ownerCookie; const reset=await request('/api/v1/users/reset-password',{method:'POST',body:{user_id:id,new_password:'NewCashierPass20'}}); assert.equal(reset.response.status,200);
  cookie=oldSession; const revoked=await request('/api/v1/session'); assert.equal(revoked.response.status,401);
  cookie=''; const oldPassword=await request('/api/v1/login',{method:'POST',body:{username:'cashier19',password:'CashierPass19'}}); assert.equal(oldPassword.response.status,401); const newPassword=await request('/api/v1/login',{method:'POST',body:{username:'cashier19',password:'NewCashierPass20'}}); assert.equal(newPassword.response.status,200); cookie=ownerCookie;
  const audit=await pool.query("SELECT action FROM security_audit WHERE target_id=$1 ORDER BY created_at",[id]); assert.ok(audit.rows.some(row=>row.action==='user.created')); assert.ok(audit.rows.some(row=>row.action==='user.password_reset'));
});


test('customer debt receipt allocates oldest sale debt atomically and journals AR', async () => {
  const context=await pool.query('SELECT market_id,branch_id FROM users WHERE username=$1',['owner']);const {market_id:marketId,branch_id:branchId}=context.rows[0];
  await pool.query(`INSERT INTO customers (id,market_id,code,name,debt_limit_iqd) VALUES ('ops-customer',$1,'OPS-C','Ops Customer',20000) ON CONFLICT (id) DO NOTHING`,[marketId]);await pool.query(`INSERT INTO customer_balances (market_id,customer_id,balance_iqd) VALUES ($1,'ops-customer',3000) ON CONFLICT (market_id,customer_id) DO UPDATE SET balance_iqd=3000`,[marketId]);
  await pool.query(`INSERT INTO sales (id,market_id,branch_id,receipt_number,cashier_id,customer_id,client_operation_id,payment_method,subtotal_iqd,total_iqd,paid_iqd,debt_iqd,debt_remaining_iqd,status) VALUES ('ops-debt-sale',$1,$2,'OPS-DEBT-1',(SELECT id FROM users WHERE username='owner'),'ops-customer','ops-debt-operation','debt',3000,3000,0,3000,3000,'completed') ON CONFLICT (id) DO UPDATE SET debt_remaining_iqd=3000,status='completed'`,[marketId,branchId]);
  const r=await request('/api/v1/customer-receipts',{method:'POST',headers:{'idempotency-key':'ops-debt-pay-key'},body:{customer_id:'ops-customer',amount_iqd:1200,method:'cash'}});assert.equal(r.response.status,201);assert.equal(r.json.balance_iqd,1800);const sale=await pool.query("SELECT debt_remaining_iqd FROM sales WHERE id='ops-debt-sale'");assert.equal(Number(sale.rows[0].debt_remaining_iqd),1800);const journal=await pool.query(`SELECT sum(debit_iqd)::bigint debit,sum(credit_iqd)::bigint credit FROM journal_lines jl JOIN journal_batches jb ON jb.id=jl.batch_id WHERE jb.reference_type='customer-receipt' AND jb.reference_id=$1`,[r.json.receipt_id]);assert.equal(Number(journal.rows[0].debit),1200);assert.equal(Number(journal.rows[0].credit),1200);
  const retry=await request('/api/v1/customer-receipts',{method:'POST',headers:{'idempotency-key':'ops-debt-pay-key'},body:{customer_id:'ops-customer',amount_iqd:1200,method:'cash'}});assert.equal(retry.response.status,200);const balance=await pool.query("SELECT balance_iqd FROM customer_balances WHERE customer_id='ops-customer'");assert.equal(Number(balance.rows[0].balance_iqd),1800);
});

test('partial and final sale return restore stock, reverse debt and keep journal balanced', async () => {
  const context=await pool.query('SELECT market_id,branch_id FROM users WHERE username=$1',['owner']);const {market_id:marketId,branch_id:branchId}=context.rows[0];await pool.query(`INSERT INTO products (id,market_id,branch_id,barcode,name,cost_price_iqd,sale_price_iqd,stock_quantity) VALUES ('ops-return-product',$1,$2,'OPS-R','Return Product',400,1000,10) ON CONFLICT (id) DO UPDATE SET stock_quantity=10`,[marketId,branchId]);
  const sale=await request('/api/v1/sales/commit',{method:'POST',headers:{'idempotency-key':'ops-return-sale-key'},body:{client_operation_id:'ops-return-sale-op',customer_id:'ops-customer',payment_method:'mixed',paid_method:'cash',paid_iqd:1000,items:[{product_id:'ops-return-product',quantity:2}]}});assert.equal(sale.response.status,201);const item=await pool.query('SELECT id FROM sale_items WHERE sale_id=$1',[sale.json.sale_id]);const first=await request('/api/v1/sales/return',{method:'POST',headers:{'idempotency-key':'ops-return-key-1'},body:{sale_id:sale.json.sale_id,items:[{sale_item_id:item.rows[0].id,quantity:1}],reason:'partial'}});assert.equal(first.response.status,201);assert.equal(first.json.debt_reversal_iqd,1000);assert.equal(first.json.refund_iqd,0);const second=await request('/api/v1/sales/return',{method:'POST',headers:{'idempotency-key':'ops-return-key-2'},body:{sale_id:sale.json.sale_id,items:[{sale_item_id:item.rows[0].id,quantity:1}],reason:'final'}});assert.equal(second.response.status,201);assert.equal(second.json.fully_returned,true);assert.equal(second.json.refund_iqd,1000);const p=await pool.query("SELECT stock_quantity FROM products WHERE id='ops-return-product'");assert.equal(Number(p.rows[0].stock_quantity),10);const s=await pool.query('SELECT status,debt_remaining_iqd FROM sales WHERE id=$1',[sale.json.sale_id]);assert.equal(s.rows[0].status,'returned');assert.equal(Number(s.rows[0].debt_remaining_iqd),0);for(const id of [first.json.return_id,second.json.return_id]){const j=await pool.query(`SELECT sum(debit_iqd)::bigint debit,sum(credit_iqd)::bigint credit FROM journal_lines jl JOIN journal_batches jb ON jb.id=jl.batch_id WHERE jb.reference_id=$1`,[id]);assert.equal(Number(j.rows[0].debit),Number(j.rows[0].credit));}
});

test('stock adjustment is idempotent and writes inventory variance journal', async () => {const before=await pool.query("SELECT stock_quantity FROM products WHERE id='ops-return-product'");const r=await request('/api/v1/stock/adjust',{method:'POST',headers:{'idempotency-key':'ops-stock-key'},body:{product_id:'ops-return-product',counted_quantity:Number(before.rows[0].stock_quantity)-2,reason:'damaged',kind:'loss'}});assert.equal(r.response.status,201);assert.equal(r.json.delta,-2);const retry=await request('/api/v1/stock/adjust',{method:'POST',headers:{'idempotency-key':'ops-stock-key'},body:{product_id:'ops-return-product',counted_quantity:Number(before.rows[0].stock_quantity)-2,reason:'damaged',kind:'loss'}});assert.equal(retry.response.status,200);const after=await pool.query("SELECT stock_quantity FROM products WHERE id='ops-return-product'");assert.equal(Number(after.rows[0].stock_quantity),Number(before.rows[0].stock_quantity)-2);});

test('cash session expected amount uses server cash sales, debt receipts, refunds and expenses', async () => {const opened=await request('/api/v1/cash-sessions/open',{method:'POST',body:{opening_amount_iqd:50000}});assert.equal(opened.response.status,201);const expense=await request('/api/v1/expenses',{method:'POST',headers:{'idempotency-key':'ops-expense-key'},body:{amount_iqd:500,method:'cash',category:'test'}});assert.equal(expense.response.status,201);const closed=await request('/api/v1/cash-sessions/close',{method:'POST',body:{session_id:opened.json.session.id,counted_amount_iqd:50000,version:opened.json.session.version}});assert.equal(closed.response.status,200);assert.ok(Number.isSafeInteger(closed.json.session.expected_amount_iqd));assert.equal(closed.json.session.difference_iqd,50000-closed.json.session.expected_amount_iqd);});


test('credit purchase increments inventory and accounts payable in one balanced transaction', async()=>{const context=await pool.query('SELECT market_id,branch_id FROM users WHERE username=$1',['owner']);const {market_id:marketId,branch_id:branchId}=context.rows[0];await pool.query(`INSERT INTO suppliers (id,market_id,code,name,created_by) VALUES ('sup-ops',$1,'SUP-1','Supplier Ops',(SELECT id FROM users WHERE username='owner')) ON CONFLICT (id) DO NOTHING`,[marketId]);await pool.query(`INSERT INTO supplier_balances (market_id,supplier_id,balance_iqd) VALUES ($1,'sup-ops',0) ON CONFLICT (market_id,supplier_id) DO UPDATE SET balance_iqd=0`,[marketId]);await pool.query(`INSERT INTO products (id,market_id,branch_id,barcode,name,cost_price_iqd,sale_price_iqd,stock_quantity) VALUES ('pur-product',$1,$2,'PUR-P','Purchase Product',300,900,5) ON CONFLICT (id) DO UPDATE SET stock_quantity=5`,[marketId,branchId]);const r=await request('/api/v1/purchases/commit',{method:'POST',headers:{'idempotency-key':'purchase-key-1'},body:{client_operation_id:'purchase-operation-1',supplier_id:'sup-ops',payment_method:'credit',paid_iqd:0,items:[{product_id:'pur-product',quantity:3,unit_cost_iqd:450}]}});assert.equal(r.response.status,201);assert.equal(r.json.total_iqd,1350);assert.equal(r.json.debt_iqd,1350);const stock=await pool.query("SELECT stock_quantity,cost_price_iqd FROM products WHERE id='pur-product'");assert.equal(Number(stock.rows[0].stock_quantity),8);assert.equal(Number(stock.rows[0].cost_price_iqd),450);const balance=await pool.query("SELECT balance_iqd FROM supplier_balances WHERE supplier_id='sup-ops'");assert.equal(Number(balance.rows[0].balance_iqd),1350);const j=await pool.query(`SELECT sum(debit_iqd)::bigint debit,sum(credit_iqd)::bigint credit FROM journal_lines jl JOIN journal_batches jb ON jb.id=jl.batch_id WHERE jb.reference_id=$1`,[r.json.purchase_id]);assert.equal(Number(j.rows[0].debit),1350);assert.equal(Number(j.rows[0].credit),1350);const retry=await request('/api/v1/purchases/commit',{method:'POST',headers:{'idempotency-key':'purchase-key-1'},body:{client_operation_id:'purchase-operation-1',supplier_id:'sup-ops',payment_method:'credit',paid_iqd:0,items:[{product_id:'pur-product',quantity:3,unit_cost_iqd:450}]}});assert.equal(retry.response.status,200);const stock2=await pool.query("SELECT stock_quantity FROM products WHERE id='pur-product'");assert.equal(Number(stock2.rows[0].stock_quantity),8);});

test('supplier payment allocates purchase payable once',async()=>{const r=await request('/api/v1/supplier-payments',{method:'POST',headers:{'idempotency-key':'supplier-payment-key-1'},body:{supplier_id:'sup-ops',amount_iqd:500,method:'cash'}});assert.equal(r.response.status,201);assert.equal(r.json.balance_iqd,850);const purchase=await pool.query("SELECT debt_remaining_iqd FROM purchases WHERE client_operation_id='purchase-operation-1'");assert.equal(Number(purchase.rows[0].debt_remaining_iqd),850);const retry=await request('/api/v1/supplier-payments',{method:'POST',headers:{'idempotency-key':'supplier-payment-key-1'},body:{supplier_id:'sup-ops',amount_iqd:500,method:'cash'}});assert.equal(retry.response.status,200);const balance=await pool.query("SELECT balance_iqd FROM supplier_balances WHERE supplier_id='sup-ops'");assert.equal(Number(balance.rows[0].balance_iqd),850);});

test('purchase return decreases stock and reverses AP before cash refund',async()=>{const p=await pool.query("SELECT id FROM purchases WHERE client_operation_id='purchase-operation-1'");const item=await pool.query('SELECT id FROM purchase_items WHERE purchase_id=$1',[p.rows[0].id]);const r=await request('/api/v1/purchases/return',{method:'POST',headers:{'idempotency-key':'purchase-return-key-1'},body:{purchase_id:p.rows[0].id,items:[{purchase_item_id:item.rows[0].id,quantity:2}],reason:'damaged supplier return'}});assert.equal(r.response.status,201);assert.equal(r.json.total_iqd,900);assert.equal(r.json.payable_reversal_iqd,850);assert.equal(r.json.refund_iqd,50);const stock=await pool.query("SELECT stock_quantity FROM products WHERE id='pur-product'");assert.equal(Number(stock.rows[0].stock_quantity),6);const balance=await pool.query("SELECT balance_iqd FROM supplier_balances WHERE supplier_id='sup-ops'");assert.equal(Number(balance.rows[0].balance_iqd),0);const j=await pool.query(`SELECT sum(debit_iqd)::bigint debit,sum(credit_iqd)::bigint credit FROM journal_lines jl JOIN journal_batches jb ON jb.id=jl.batch_id WHERE jb.reference_id=$1`,[r.json.return_id]);assert.equal(Number(j.rows[0].debit),Number(j.rows[0].credit));});

test('concurrent purchase retries do not double-increment stock',async()=>{const body={client_operation_id:'purchase-race-op',supplier_id:'sup-ops',payment_method:'cash',paid_iqd:400,items:[{product_id:'pur-product',quantity:1,unit_cost_iqd:400}]};const make=()=>request('/api/v1/purchases/commit',{method:'POST',headers:{'idempotency-key':'purchase-race-key'},body});const before=await pool.query("SELECT stock_quantity FROM products WHERE id='pur-product'");const results=await Promise.all([make(),make()]);assert.deepEqual(results.map(x=>x.response.status).sort(),[200,201]);const after=await pool.query("SELECT stock_quantity FROM products WHERE id='pur-product'");assert.equal(Number(after.rows[0].stock_quantity),Number(before.rows[0].stock_quantity)+1);});
