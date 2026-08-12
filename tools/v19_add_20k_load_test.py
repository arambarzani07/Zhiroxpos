from pathlib import Path
import re

server=Path('source/server')
app_path=server/'src/app.mjs';app=app_path.read_text(encoding='utf-8')

# Route-specific JSON body limits: default 64KiB, bulk imports max 2MiB.
app=app.replace("const readJson = req => new Promise((resolve, reject) => {", "const readJson = (req, maxBytes = JSON_LIMIT) => new Promise((resolve, reject) => {",1)
app=app.replace("    if (bytes > JSON_LIMIT) {", "    if (bytes > maxBytes) {",1)
# Only bulk imports need a larger body budget.
product_import_marker="if (req.method === 'POST' && url.pathname === '/api/v1/catalog/products/import') {"
customer_import_marker="if (req.method === 'POST' && url.pathname === '/api/v1/customers/import') {"
for marker in (product_import_marker,customer_import_marker):
    start=app.find(marker)
    if start<0: raise SystemExit(f'import route missing: {marker}')
    body_pos=app.find('const body = await readJson(req);',start)
    if body_pos<0 or body_pos>start+3500: raise SystemExit(f'import readJson missing near {marker}')
    app=app[:body_pos]+app[body_pos:].replace('const body = await readJson(req);','const body = await readJson(req, 2 * 1024 * 1024);',1)

# Online writers may run concurrently. Lease acquire/release remain exclusive.
old_lock="""async function lockBranchWriter(client,user){
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([user.market_id,user.branch_id,'branch-writer'])]);
}"""
new_lock="""async function lockBranchWriter(client,user,exclusive=false){
  const fn=exclusive?'pg_advisory_xact_lock':'pg_advisory_xact_lock_shared';
  await client.query(`SELECT ${fn}(hashtextextended($1,0))`,[JSON.stringify([user.market_id,user.branch_id,'branch-writer'])]);
}"""
if old_lock not in app: raise SystemExit('branch writer lock helper missing')
app=app.replace(old_lock,new_lock,1)
# Lease acquire/release must be exclusive. Use route-local distinctive snippets.
acquire="""          const device=await registeredDevice(client,user,req); if(!device)return {status:409,body:{error:'DEVICE_NOT_REGISTERED'}};
          await lockBranchWriter(client,user); await lockIdempotency(client,user.market_id,'offline.lease.acquire',key);"""
acquire_new=acquire.replace('await lockBranchWriter(client,user);','await lockBranchWriter(client,user,true);')
if acquire not in app: raise SystemExit('lease acquire lock marker missing')
app=app.replace(acquire,acquire_new,1)
release="""const result=await withTransaction(pool,async client=>{await lockBranchWriter(client,user);const lease=await client.query(`SELECT id,device_id,expires_at FROM offline_leases"""
release_new=release.replace('await lockBranchWriter(client,user);','await lockBranchWriter(client,user,true);')
if release not in app: raise SystemExit('lease release lock marker missing')
app=app.replace(release,release_new,1)

# Bulk imports are financial/stock writes too: require device and respect offline lease.
for scope,pattern in [
    ('products.import',"await lockIdempotency(client, user.market_id, 'products.import', key);"),
    ('customers.import',"await lockIdempotency(client, user.market_id, 'customers.import', key);"),
]:
    if pattern not in app: raise SystemExit(f'{scope} idempotency marker missing')
    prefix="const device=await registeredDevice(client,user,req); if(!device)return {status:409,body:{error:'DEVICE_NOT_REGISTERED'}}; await lockBranchWriter(client,user); const leaseGate=await enforceWriterLease(client,user,device.id); if(leaseGate)return {status:423,body:leaseGate}; "
    app=app.replace(pattern,prefix+pattern,1)

# Exact barcode lookup for online refresh/diagnostics; primary and secondary barcodes.
route_marker="      if (req.method === 'GET' && url.pathname === '/api/v1/catalog/products') {"
lookup=r'''      if (req.method === 'GET' && url.pathname === '/api/v1/catalog/products/lookup') {
        const user=await authenticate(pool,req);if(!user)return json(res,401,{error:'AUTH_REQUIRED'});const barcode=String(url.searchParams.get('barcode')||'').trim();if(!validBarcode(barcode))return json(res,422,{error:'INVALID_BARCODE'});
        const result=await pool.query(`SELECT id,market_id,branch_id,category_id,barcode,barcodes,name,name_en,description,unit,cost_price_iqd,sale_price_iqd,currency,stock_quantity,low_stock_limit,image_url,is_trackable,status,version,created_at,updated_at FROM products WHERE market_id=$1 AND status='active' AND (barcode=$2 OR barcodes ? $2) ORDER BY (barcode=$2) DESC LIMIT 1`,[user.market_id,barcode]);
        if(!result.rows[0])return json(res,404,{error:'PRODUCT_NOT_FOUND'});const row=result.rows[0];return json(res,200,{product:{...row,cost_price_iqd:Number(row.cost_price_iqd),sale_price_iqd:Number(row.sale_price_iqd),stock_quantity:Number(row.stock_quantity),low_stock_limit:Number(row.low_stock_limit),version:Number(row.version)}});
      }

'''+route_marker
if route_marker not in app: raise SystemExit('catalog route marker missing')
app=app.replace(route_marker,lookup,1)
app_path.write_text(app,encoding='utf-8')

# GIN index for secondary barcodes.
(server/'db/008_catalog_performance.sql').write_text(r'''BEGIN;
CREATE INDEX IF NOT EXISTS products_barcodes_gin_idx ON products USING gin (barcodes);
CREATE INDEX IF NOT EXISTS products_market_status_id_idx ON products(market_id,status,id);
COMMIT;
''',encoding='utf-8')

# 20k integration/load test (separate from normal npm test).
(server/'test/load-20k.mjs').write_text(r'''import assert from 'node:assert/strict';import fs from 'node:fs/promises';import http from 'node:http';import pg from 'pg';import {createHandler} from '../src/app.mjs';
const {Pool}=pg;if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');const pool=new Pool({connectionString:process.env.DATABASE_URL,max:30});const migrations=['001_core.sql','002_financial.sql','003_catalog.sql','004_daily_authority.sql','005_offline_leases.sql','006_user_management.sql','007_backup_ops.sql','008_catalog_performance.sql'];for(const file of migrations)await pool.query(await fs.readFile(new URL(`../db/${file}`,import.meta.url),'utf8'));await pool.query('TRUNCATE backup_runs,security_audit,receipt_blocks,offline_leases,devices,journal_lines,journal_batches,stock_movements,payments,sale_items,sales,customer_balances,customers,products,categories,idempotency_keys,receipt_sequences,auth_throttle,sessions,users,branches,markets CASCADE');
let cookie='';const deviceId='load-device-main-0001';const handler=createHandler(pool,{production:false,bootstrapToken:'load-bootstrap-token',offlineLeaseSecret:'load-offline-secret-which-is-long-enough',timeZone:'Asia/Baghdad'});const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
async function request(path,{method='GET',body,headers={}}={}){const response=await fetch(base+path,{method,headers:{origin:'http://127.0.0.1','x-device-id':deviceId,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];let json={};try{json=await response.json();}catch{}return{response,json};}
const started=performance.now();let r=await request('/api/v1/bootstrap',{method:'POST',headers:{'x-bootstrap-token':'load-bootstrap-token'},body:{marketName:'20K Load Market',fullName:'Load Owner',username:'loadowner',password:'LoadPassword20',receiptPrefix:'LOAD'}});assert.equal(r.response.status,201);r=await request('/api/v1/devices/register',{method:'POST',body:{device_id:deviceId,label:'20K Load POS'}});assert.equal(r.response.status,200);
const products=Array.from({length:20000},(_,i)=>{const n=i+1;return{id:`load-product-${String(n).padStart(5,'0')}`,barcode:`LOAD-${String(n).padStart(8,'0')}`,barcodes:[`ALT-${String(n).padStart(8,'0')}`],name:`کالای تاقیکردنەوە ${n}`,cost_price_iqd:500+(n%50),sale_price_iqd:1000+(n%100),stock_quantity:100,low_stock_limit:5,currency:'IQD'};});
const importStart=performance.now();for(let offset=0;offset<products.length;offset+=500){const batch=products.slice(offset,offset+500);const imported=await request('/api/v1/catalog/products/import',{method:'POST',headers:{'idempotency-key':`load-import-${offset/500}`},body:{items:batch}});assert.equal(imported.response.status,201,`import batch ${offset}: ${JSON.stringify(imported.json)}`);assert.equal(imported.json.imported,batch.length);}const importMs=performance.now()-importStart;const count=await pool.query('SELECT count(*)::int AS count FROM products');assert.equal(count.rows[0].count,20000);
const listStart=performance.now();let after='';let listed=0;do{const query=new URLSearchParams({limit:'500'});if(after)query.set('after_id',after);const page=await request(`/api/v1/catalog/products?${query}`);assert.equal(page.response.status,200);listed+=page.json.items.length;after=page.json.next_after_id||'';}while(after);const listMs=performance.now()-listStart;assert.equal(listed,20000);
const lookupStart=performance.now();for(let i=1;i<=500;i++){const n=((i*37)%20000)+1;const barcode=i%2===0?`ALT-${String(n).padStart(8,'0')}`:`LOAD-${String(n).padStart(8,'0')}`;const found=await request(`/api/v1/catalog/products/lookup?barcode=${encodeURIComponent(barcode)}`);assert.equal(found.response.status,200);assert.equal(found.json.product.id,`load-product-${String(n).padStart(5,'0')}`);}const lookupMs=performance.now()-lookupStart;
const saleStart=performance.now();const sales=Array.from({length:100},(_,i)=>{const n=i+1;const price=1000+(n%100);return request('/api/v1/sales/commit',{method:'POST',headers:{'idempotency-key':`load-sale-key-${i}`},body:{client_operation_id:`load-sale-operation-${i}`,payment_method:'cash',paid_iqd:price,items:[{product_id:`load-product-${String(n).padStart(5,'0')}`,quantity:1}]}});});const results=await Promise.all(sales);assert.ok(results.every(x=>x.response.status===201),results.filter(x=>x.response.status!==201).slice(0,3).map(x=>x.json));assert.equal(new Set(results.map(x=>x.json.receipt_number)).size,100);const saleMs=performance.now()-saleStart;const stock=await pool.query("SELECT count(*)::int AS count FROM products WHERE id LIKE 'load-product-%' AND stock_quantity=99");assert.equal(stock.rows[0].count,100);
const totalMs=performance.now()-started;const metrics={products:20000,import_ms:Math.round(importMs),list_ms:Math.round(listMs),lookup_500_ms:Math.round(lookupMs),concurrent_sales_100_ms:Math.round(saleMs),total_ms:Math.round(totalMs)};console.log(JSON.stringify(metrics));assert.ok(importMs<180000,`20k import too slow: ${importMs}ms`);assert.ok(listMs<30000,`20k listing too slow: ${listMs}ms`);assert.ok(lookupMs<30000,`500 lookups too slow: ${lookupMs}ms`);assert.ok(saleMs<30000,`100 concurrent sales too slow: ${saleMs}ms`);await new Promise(resolve=>server.close(resolve));await pool.end();
''',encoding='utf-8')

print('20k load test, import body budget, shared online writer locks and barcode lookup generated.')
