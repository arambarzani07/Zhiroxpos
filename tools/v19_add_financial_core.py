from pathlib import Path

server = Path('source/server')

(server / 'db/002_financial.sql').write_text(r'''BEGIN;

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  barcode text NOT NULL,
  name text NOT NULL,
  cost_price_iqd bigint NOT NULL CHECK (cost_price_iqd >= 0),
  sale_price_iqd bigint NOT NULL CHECK (sale_price_iqd >= 0),
  stock_quantity numeric(18,3) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_limit numeric(18,3) NOT NULL DEFAULT 0 CHECK (low_stock_limit >= 0),
  version bigint NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, barcode)
);
CREATE INDEX IF NOT EXISTS products_market_branch_idx ON products(market_id, branch_id, status);

CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  debt_limit_iqd bigint,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, code)
);

CREATE TABLE IF NOT EXISTS customer_balances (
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  balance_iqd bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id, customer_id)
);

CREATE TABLE IF NOT EXISTS sales (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  receipt_number text NOT NULL,
  cashier_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  customer_id text REFERENCES customers(id) ON DELETE RESTRICT,
  client_operation_id text NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('cash','card','bank','debt','mixed')),
  subtotal_iqd bigint NOT NULL CHECK (subtotal_iqd >= 0),
  discount_iqd bigint NOT NULL DEFAULT 0 CHECK (discount_iqd >= 0),
  total_iqd bigint NOT NULL CHECK (total_iqd >= 0),
  paid_iqd bigint NOT NULL CHECK (paid_iqd >= 0),
  debt_iqd bigint NOT NULL CHECK (debt_iqd >= 0),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','cancelled','returned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, receipt_number),
  UNIQUE (market_id, client_operation_id)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id text PRIMARY KEY,
  sale_id text NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  barcode text NOT NULL,
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  unit_price_iqd bigint NOT NULL CHECK (unit_price_iqd >= 0),
  unit_cost_iqd bigint NOT NULL CHECK (unit_cost_iqd >= 0),
  line_total_iqd bigint NOT NULL CHECK (line_total_iqd >= 0)
);
CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items(sale_id);

CREATE TABLE IF NOT EXISTS payments (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  sale_id text NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  customer_id text REFERENCES customers(id) ON DELETE RESTRICT,
  method text NOT NULL CHECK (method IN ('cash','card','bank')),
  amount_iqd bigint NOT NULL CHECK (amount_iqd > 0),
  received_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('sale','return','purchase','adjustment','loss')),
  quantity_delta numeric(18,3) NOT NULL,
  stock_before numeric(18,3) NOT NULL,
  stock_after numeric(18,3) NOT NULL CHECK (stock_after >= 0),
  reference_type text NOT NULL,
  reference_id text NOT NULL,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements(market_id, product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS journal_batches (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  reference_type text NOT NULL,
  reference_id text NOT NULL,
  description text NOT NULL,
  posted_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  posted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, reference_type, reference_id)
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id text PRIMARY KEY,
  batch_id text NOT NULL REFERENCES journal_batches(id) ON DELETE RESTRICT,
  account_code text NOT NULL,
  debit_iqd bigint NOT NULL DEFAULT 0 CHECK (debit_iqd >= 0),
  credit_iqd bigint NOT NULL DEFAULT 0 CHECK (credit_iqd >= 0),
  CHECK ((debit_iqd = 0) <> (credit_iqd = 0))
);
CREATE INDEX IF NOT EXISTS journal_lines_batch_idx ON journal_lines(batch_id);

COMMIT;
''', encoding='utf-8')

app_path = server / 'src/app.mjs'
app = app_path.read_text(encoding='utf-8')

marker = "const validPrefix = value => /^[A-Z0-9]{2,8}$/.test(String(value ?? ''));"
helpers = marker + r'''
const validOperationId = value => /^[A-Za-z0-9._:-]{8,128}$/.test(String(value ?? ''));
const validPaymentMethod = value => ['cash', 'card', 'bank', 'debt', 'mixed'].includes(String(value ?? ''));

const stableSaleHash = body => sha256(JSON.stringify({
  client_operation_id: body.client_operation_id,
  customer_id: body.customer_id || null,
  payment_method: body.payment_method,
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
'''
if marker not in app:
    raise SystemExit('financial helper insertion marker not found')
app = app.replace(marker, helpers, 1)

route_marker = "      if (req.method === 'POST' && url.pathname === '/api/v1/receipts/reserve') {"
sale_route = r'''      if (req.method === 'POST' && url.pathname === '/api/v1/sales/commit') {
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

''' + route_marker
if route_marker not in app:
    raise SystemExit('receipt route marker not found for financial insertion')
app = app.replace(route_marker, sale_route, 1)
app_path.write_text(app, encoding='utf-8')

# Extend integration test setup and add authoritative transaction tests.
test_path = server / 'test/server.test.mjs'
test = test_path.read_text(encoding='utf-8')
test = test.replace(
    "  const migration = await fs.readFile(new URL('../db/001_core.sql', import.meta.url), 'utf8');\n  await pool.query(migration);\n  await pool.query('TRUNCATE idempotency_keys, receipt_sequences, auth_throttle, sessions, users, branches, markets CASCADE');",
    "  const migration = await fs.readFile(new URL('../db/001_core.sql', import.meta.url), 'utf8');\n  const financial = await fs.readFile(new URL('../db/002_financial.sql', import.meta.url), 'utf8');\n  await pool.query(migration);\n  await pool.query(financial);\n  await pool.query('TRUNCATE journal_lines, journal_batches, stock_movements, payments, sale_items, sales, customer_balances, customers, products, idempotency_keys, receipt_sequences, auth_throttle, sessions, users, branches, markets CASCADE');",
    1,
)
append = r'''

test('authoritative sale commit updates stock, debt and balanced journal exactly once', async () => {
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
'''
if "authoritative sale commit updates stock" not in test:
    test += append
test_path.write_text(test, encoding='utf-8')

print('Authoritative financial sale core generated.')
