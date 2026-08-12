from pathlib import Path
import runpy

# Recreate the financial core deterministically, then apply the concurrency/idempotency hardening.
runpy.run_path('tools/v19_add_financial_core.py', run_name='__main__')

app_path = Path('source/server/src/app.mjs')
app = app_path.read_text(encoding='utf-8')

old_hash = """  payment_method: body.payment_method,
  paid_iqd: body.paid_iqd,"""
new_hash = """  payment_method: body.payment_method,
  paid_method: body.paid_method || null,
  paid_iqd: body.paid_iqd,"""
if old_hash not in app:
    raise SystemExit('stableSaleHash payment method pattern not found')
app = app.replace(old_hash, new_hash, 1)

old_customer = r'''          let customer = null;
          let balanceBefore = 0;
          if (body.customer_id) {
            const customerResult = await client.query(
              `SELECT c.id, c.debt_limit_iqd, c.status, COALESCE(cb.balance_iqd, 0) AS balance_iqd
                 FROM customers c
                 LEFT JOIN customer_balances cb ON cb.market_id = c.market_id AND cb.customer_id = c.id
                WHERE c.id = $1 AND c.market_id = $2
                FOR UPDATE OF c`,
              [String(body.customer_id), user.market_id]
            );
            customer = customerResult.rows[0];
            if (!customer || customer.status !== 'active') return { status: 409, body: { error: 'CUSTOMER_UNAVAILABLE' } };
            balanceBefore = Number(customer.balance_iqd || 0);
            if (debt > 0 && customer.debt_limit_iqd !== null && balanceBefore + debt > Number(customer.debt_limit_iqd)) {
              return { status: 409, body: { error: 'CREDIT_LIMIT_EXCEEDED', balance_iqd: balanceBefore, debt_limit_iqd: Number(customer.debt_limit_iqd) } };
            }
          }
'''
new_customer = r'''          let customer = null;
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
              return { status: 409, body: { error: 'CREDIT_LIMIT_EXCEEDED', balance_iqd: balanceBefore, debt_limit_iqd: Number(customer.debt_limit_iqd) };
            }
          }
'''
if old_customer not in app:
    raise SystemExit('customer balance locking block not found')
app = app.replace(old_customer, new_customer, 1)
app_path.write_text(app, encoding='utf-8')

test_path = Path('source/server/test/server.test.mjs')
test = test_path.read_text(encoding='utf-8')

# Restore an authenticated owner session after the earlier logout test.
financial_marker = "test('authoritative sale commit updates stock, debt and balanced journal exactly once', async () => {\n"
if financial_marker not in test:
    raise SystemExit('financial test marker not found')
financial_login = financial_marker + "  cookie = '';\n  const login = await request('/api/v1/login', { method: 'POST', body: { username: 'owner', password: 'SecurePass9' } });\n  assert.equal(login.response.status, 200);\n"
test = test.replace(financial_marker, financial_login, 1)

# Verify idempotency includes the paid channel, not only the amount.
retry_marker = """  assert.equal(retry.json.receipt_number, first.json.receipt_number);

  const stock = await pool.query("SELECT id, stock_quantity FROM products WHERE id IN ('prod-1','prod-2') ORDER BY id");"""
retry_replacement = """  assert.equal(retry.json.receipt_number, first.json.receipt_number);

  const changedChannel = await request('/api/v1/sales/commit', {
    method: 'POST',
    headers: { 'idempotency-key': 'sale-key-0001' },
    body: { ...body, paid_method: 'bank' },
  });
  assert.equal(changedChannel.response.status, 409);
  assert.equal(changedChannel.json.error, 'IDEMPOTENCY_CONFLICT');

  const stock = await pool.query("SELECT id, stock_quantity FROM products WHERE id IN ('prod-1','prod-2') ORDER BY id");"""
if retry_marker not in test:
    raise SystemExit('financial retry assertion marker not found')
test = test.replace(retry_marker, retry_replacement, 1)

# Add a race test for customer credit limit serialization.
if "concurrent debt sales serialize credit limit checks" not in test:
    test += r'''

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
'''

test_path.write_text(test, encoding='utf-8')
print('Financial test session restored; debt balance locking and paid-channel idempotency hardened.')
