from pathlib import Path

server = Path('source/server')

(server / 'db/003_catalog.sql').write_text(r'''BEGIN;

CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_en text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, name)
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id text REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcodes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'دانە';
ALTER TABLE products ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'IQD' CHECK (currency IN ('IQD','USD'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_trackable boolean NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by text REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by text REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_market_id_idx ON products(market_id, id);
CREATE INDEX IF NOT EXISTS customers_market_id_idx ON customers(market_id, id);

COMMIT;
''', encoding='utf-8')

app_path = server / 'src/app.mjs'
app = app_path.read_text(encoding='utf-8')

helper_marker = "const validOperationId = value => /^[A-Za-z0-9._:-]{8,128}$/.test(String(value ?? ''));"
helpers = helper_marker + r'''
const validEntityId = value => /^[A-Za-z0-9._:-]{3,128}$/.test(String(value ?? ''));
const validBarcode = value => typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 64;
const safeLimit = value => Math.min(500, Math.max(1, Number.parseInt(String(value || '200'), 10) || 200));
const safeStock = value => Number.isFinite(Number(value)) && Number(value) >= 0 && Math.round(Number(value) * 1000) === Number(value) * 1000;
const safeMoney = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0;

async function lockIdempotency(client, marketId, scope, key) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify([marketId, scope, key])]);
}
'''
if helper_marker not in app:
    raise SystemExit('catalog helper marker not found')
app = app.replace(helper_marker, helpers, 1)

route_marker = "      if (req.method === 'POST' && url.pathname === '/api/v1/sales/commit') {"
routes = r'''      if (req.method === 'GET' && url.pathname === '/api/v1/catalog/products') {
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
        const body = await readJson(req);
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
          await lockIdempotency(client, user.market_id, 'products.import', key);
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
          `SELECT c.id,c.market_id,c.code,c.name,c.phone,c.address,c.notes,c.debt_limit_iqd,c.status,c.created_at,c.updated_at,
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
        const body = await readJson(req);
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
          await lockIdempotency(client, user.market_id, 'customers.import', key);
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

''' + route_marker
if route_marker not in app:
    raise SystemExit('catalog route insertion marker not found')
app = app.replace(route_marker, routes, 1)
app_path.write_text(app, encoding='utf-8')

# Extend integration-test migrations and add catalog authority tests.
test_path = server / 'test/server.test.mjs'
test = test_path.read_text(encoding='utf-8')
old_migrations = """  const financial = await fs.readFile(new URL('../db/002_financial.sql', import.meta.url), 'utf8');
  await pool.query(migration);
  await pool.query(financial);"""
new_migrations = """  const financial = await fs.readFile(new URL('../db/002_financial.sql', import.meta.url), 'utf8');
  const catalog = await fs.readFile(new URL('../db/003_catalog.sql', import.meta.url), 'utf8');
  await pool.query(migration);
  await pool.query(financial);
  await pool.query(catalog);"""
if old_migrations not in test:
    raise SystemExit('catalog test migration marker not found')
test = test.replace(old_migrations, new_migrations, 1)

if "catalog imports bind products to authenticated tenant" not in test:
    test += r'''

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
'''
test_path.write_text(test, encoding='utf-8')

print('Authoritative product/customer catalog API generated.')
