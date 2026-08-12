from pathlib import Path
import runpy

# Rebuild the financial core and apply the previous concurrency hardening first.
runpy.run_path('tools/v19_fix_financial_concurrency.py', run_name='__main__')

app_path = Path('source/server/src/app.mjs')
app = app_path.read_text(encoding='utf-8')

bad = "return { status: 409, body: { error: 'CREDIT_LIMIT_EXCEEDED', balance_iqd: balanceBefore, debt_limit_iqd: Number(customer.debt_limit_iqd) };"
good = "return { status: 409, body: { error: 'CREDIT_LIMIT_EXCEEDED', balance_iqd: balanceBefore, debt_limit_iqd: Number(customer.debt_limit_iqd) } };"
if bad not in app:
    raise SystemExit('Expected credit-limit syntax typo not found')
app = app.replace(bad, good, 1)

# Serialize concurrent retries carrying the exact same market/scope/idempotency key.
needle = """        const result = await withTransaction(pool, async client => {
          const existing = await client.query(
            `SELECT request_hash, response_json FROM idempotency_keys
              WHERE market_id = $1 AND scope = 'sale.commit' AND idempotency_key = $2
              FOR UPDATE`,"""
replacement = """        const result = await withTransaction(pool, async client => {
          await client.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            [`${user.market_id}\\0sale.commit\\0${idempotencyKey}`]
          );
          const existing = await client.query(
            `SELECT request_hash, response_json FROM idempotency_keys
              WHERE market_id = $1 AND scope = 'sale.commit' AND idempotency_key = $2
              FOR UPDATE`,"""
if needle not in app:
    raise SystemExit('Sale idempotency transaction marker not found')
app = app.replace(needle, replacement, 1)
app_path.write_text(app, encoding='utf-8')

test_path = Path('source/server/test/server.test.mjs')
test = test_path.read_text(encoding='utf-8')
if "concurrent identical idempotency retries commit exactly once" not in test:
    test += r'''

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
'''
test_path.write_text(test, encoding='utf-8')

print('Financial syntax fixed and concurrent idempotency retries serialized.')
