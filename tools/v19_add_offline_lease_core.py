from pathlib import Path

server=Path('source/server')
(server/'db/005_offline_leases.sql').write_text(r'''BEGIN;

CREATE TABLE IF NOT EXISTS devices (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  label text NOT NULL,
  registered_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS devices_market_branch_idx ON devices(market_id,branch_id,status);

CREATE TABLE IF NOT EXISTS offline_leases (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > starts_at)
);
CREATE INDEX IF NOT EXISTS offline_leases_branch_idx ON offline_leases(market_id,branch_id,expires_at DESC);

CREATE TABLE IF NOT EXISTS receipt_blocks (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  lease_id text NOT NULL REFERENCES offline_leases(id) ON DELETE RESTRICT,
  business_date date NOT NULL,
  receipt_prefix text NOT NULL,
  start_sequence bigint NOT NULL CHECK (start_sequence > 0),
  end_sequence bigint NOT NULL CHECK (end_sequence >= start_sequence),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id,branch_id,business_date,start_sequence,end_sequence)
);
CREATE INDEX IF NOT EXISTS receipt_blocks_lease_idx ON receipt_blocks(lease_id,business_date);

COMMIT;
''',encoding='utf-8')

app_path=server/'src/app.mjs'
app=app_path.read_text(encoding='utf-8')
app=app.replace("import { createHash } from 'node:crypto';","import { createHash, createHmac, timingSafeEqual } from 'node:crypto';",1)

# Config secret.
old_cfg="""    trustProxy: configInput.trustProxy ?? process.env.TRUST_PROXY === '1',
  };"""
new_cfg="""    trustProxy: configInput.trustProxy ?? process.env.TRUST_PROXY === '1',
    offlineLeaseSecret: configInput.offlineLeaseSecret ?? process.env.OFFLINE_LEASE_SECRET ?? '',
  };"""
if old_cfg not in app: raise SystemExit('config marker missing')
app=app.replace(old_cfg,new_cfg,1)

helper_marker="async function lockIdempotency(client, marketId, scope, key) {"
idx=app.find(helper_marker)
if idx<0: raise SystemExit('lockIdempotency marker missing')
end=app.find("}\n",idx)+2
lease_helpers=r'''

const validDeviceId = value => /^[A-Za-z0-9._:-]{8,128}$/.test(String(value ?? ''));
const deviceIdFromRequest = req => String(req.headers['x-device-id'] || '').trim();
const leaseSignature = (secret, leaseId, deviceId, expiresAt) => createHmac('sha256', secret).update(JSON.stringify([leaseId,deviceId,new Date(expiresAt).toISOString()])).digest('base64url');
const leaseToken = (secret, leaseId, deviceId, expiresAt) => `${leaseId}.${leaseSignature(secret,leaseId,deviceId,expiresAt)}`;
const safeTokenEqual = (left,right) => { const a=Buffer.from(String(left)); const b=Buffer.from(String(right)); return a.length===b.length && timingSafeEqual(a,b); };

async function registeredDevice(client,user,req){
  const deviceId=deviceIdFromRequest(req);
  if(!validDeviceId(deviceId)) return null;
  const result=await client.query(`SELECT id,market_id,branch_id,status FROM devices WHERE id=$1 AND market_id=$2 AND branch_id=$3 AND status='active'`,[deviceId,user.market_id,user.branch_id]);
  return result.rows[0]||null;
}
async function lockBranchWriter(client,user){
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([user.market_id,user.branch_id,'branch-writer'])]);
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
  const leaseResult=await client.query(`SELECT id,device_id,starts_at,expires_at,revoked_at FROM offline_leases WHERE id=$1 AND market_id=$2 AND branch_id=$3`,[String(offline.lease_id),user.market_id,user.branch_id]);
  const lease=leaseResult.rows[0]; if(!lease||lease.device_id!==deviceId)return {error:'OFFLINE_LEASE_INVALID'};
  const expected=leaseToken(secret,lease.id,deviceId,lease.expires_at); if(!safeTokenEqual(expected,String(offline.lease_token||'')))return {error:'OFFLINE_LEASE_INVALID'};
  const captured=new Date(String(offline.captured_at||'')); if(Number.isNaN(captured.getTime())||captured<new Date(lease.starts_at)||captured>new Date(lease.expires_at)||(lease.revoked_at&&captured>new Date(lease.revoked_at)))return {error:'OFFLINE_CAPTURE_OUTSIDE_LEASE'};
  const blockResult=await client.query(`SELECT id,receipt_prefix,start_sequence,end_sequence,business_date FROM receipt_blocks WHERE id=$1 AND lease_id=$2 AND device_id=$3 AND market_id=$4 AND branch_id=$5`,[String(offline.block_id),lease.id,deviceId,user.market_id,user.branch_id]);
  const block=blockResult.rows[0]; const sequence=Number(offline.sequence); if(!block||String(block.business_date).slice(0,10)!==String(offline.business_date)||sequence<Number(block.start_sequence)||sequence>Number(block.end_sequence))return {error:'OFFLINE_RECEIPT_BLOCK_INVALID'};
  const receiptNumber=`${block.receipt_prefix}-${String(offline.business_date).replaceAll('-','')}-${String(sequence).padStart(6,'0')}`;
  if(receiptNumber!==String(offline.receipt_number||''))return {error:'OFFLINE_RECEIPT_NUMBER_INVALID'};
  return {receiptNumber};
}
'''
app=app[:end]+lease_helpers+app[end:]

# Add device/lease routes before catalog products.
route_marker="      if (req.method === 'GET' && url.pathname === '/api/v1/catalog/products') {"
if route_marker not in app: raise SystemExit('device route marker missing')
routes=r'''      if (req.method === 'POST' && url.pathname === '/api/v1/devices/register') {
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
          await lockBranchWriter(client,user); await lockIdempotency(client,user.market_id,'offline.lease.acquire',key);
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
        const result=await withTransaction(pool,async client=>{await lockBranchWriter(client,user);const lease=await client.query(`SELECT id,device_id,expires_at FROM offline_leases WHERE id=$1 AND market_id=$2 AND branch_id=$3 FOR UPDATE`,[String(body.lease_id||''),user.market_id,user.branch_id]);if(!lease.rows[0]||lease.rows[0].device_id!==deviceId)return {status:404,body:{error:'OFFLINE_LEASE_NOT_FOUND'}};const expected=leaseToken(config.offlineLeaseSecret,lease.rows[0].id,deviceId,lease.rows[0].expires_at);if(!safeTokenEqual(expected,String(body.lease_token||'')))return {status:403,body:{error:'OFFLINE_LEASE_INVALID'}};await client.query('UPDATE offline_leases SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1',[lease.rows[0].id]);return {status:200,body:{ok:true}};}); return json(res,result.status,result.body);
      }

''' + route_marker
app=app.replace(route_marker,routes,1)

# Enforce registered device and branch lease in product save/customer save/sale commit transactions.
for scope in ("products.save","customers.save"):
    needle=f"await lockIdempotency(client, user.market_id, '{scope}', key);" if scope=='products.save' else "await lockIdempotency(client,user.market_id,'customers.save',key);"
    if needle not in app: raise SystemExit(f'{scope} transaction marker missing')
    prefix="const device=await registeredDevice(client,user,req); if(!device)return {status:409,body:{error:'DEVICE_NOT_REGISTERED'}}; await lockBranchWriter(client,user); const leaseGate=await enforceWriterLease(client,user,device.id); if(leaseGate)return {status:423,body:leaseGate}; "
    app=app.replace(needle,prefix+needle,1)

sale_tx="""        const result = await withTransaction(pool, async client => {
          await client.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',"""
if sale_tx not in app: raise SystemExit('sale transaction marker missing')
sale_tx_new="""        const result = await withTransaction(pool, async client => {
          const device=await registeredDevice(client,user,req); if(!device)return {status:409,body:{error:'DEVICE_NOT_REGISTERED'}};
          await lockBranchWriter(client,user);
          const offlineReceipt=body.offline_receipt||null;
          if(!offlineReceipt){const leaseGate=await enforceWriterLease(client,user,device.id);if(leaseGate)return {status:423,body:leaseGate};}
          await client.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',"""
app=app.replace(sale_tx,sale_tx_new,1)

# Use reserved offline receipt if provided; otherwise central next receipt.
receipt_line="          const { receiptNumber } = await nextReceipt(client, user, date);"
replacement="""          let receiptNumber;
          if(offlineReceipt){const verified=await validateOfflineReceipt(client,user,device.id,offlineReceipt,config.offlineLeaseSecret);if(verified.error)return {status:409,body:{error:verified.error}};receiptNumber=verified.receiptNumber;}else{receiptNumber=(await nextReceipt(client,user,date)).receiptNumber;}"""
if receipt_line not in app: raise SystemExit('nextReceipt line missing')
app=app.replace(receipt_line,replacement,1)
# Include offline receipt identity in idempotency hash.
old_hash="  items: [...body.items].map(item => ({ product_id: item.product_id, quantity: Number(item.quantity) })).sort((a, b) => a.product_id.localeCompare(b.product_id)),"
new_hash=old_hash+"\n  offline_receipt: body.offline_receipt ? { lease_id:body.offline_receipt.lease_id, block_id:body.offline_receipt.block_id, receipt_number:body.offline_receipt.receipt_number, sequence:Number(body.offline_receipt.sequence), business_date:body.offline_receipt.business_date, captured_at:body.offline_receipt.captured_at } : null,"
if old_hash not in app: raise SystemExit('stable hash items line missing')
app=app.replace(old_hash,new_hash,1)
app_path.write_text(app,encoding='utf-8')

# Server startup requires offline secret in production.
index_path=server/'src/index.mjs'; index=index_path.read_text(encoding='utf-8')
marker="if (process.env.NODE_ENV === 'production' && !process.env.BOOTSTRAP_TOKEN) throw new Error('BOOTSTRAP_TOKEN is required in production until bootstrap is disabled');"
if marker not in index: raise SystemExit('server production secret marker missing')
index=index.replace(marker,marker+"\nif (process.env.NODE_ENV === 'production' && !process.env.OFFLINE_LEASE_SECRET) throw new Error('OFFLINE_LEASE_SECRET is required in production');",1)
index_path.write_text(index,encoding='utf-8')

env_path=server/'.env.example'; env=env_path.read_text(encoding='utf-8')
if 'OFFLINE_LEASE_SECRET=' not in env: env=env.replace('BOOTSTRAP_TOKEN=replace-with-64-random-characters','BOOTSTRAP_TOKEN=replace-with-64-random-characters\nOFFLINE_LEASE_SECRET=replace-with-a-different-64-random-character-secret')
env_path.write_text(env,encoding='utf-8')

# Tests: migration + default device registration + lease safety.
test_path=server/'test/server.test.mjs'; test=test_path.read_text(encoding='utf-8')
old="""  const dailyAuthority = await fs.readFile(new URL('../db/004_daily_authority.sql', import.meta.url), 'utf8');
  await pool.query(migration);"""
new="""  const dailyAuthority = await fs.readFile(new URL('../db/004_daily_authority.sql', import.meta.url), 'utf8');
  const offlineLeases = await fs.readFile(new URL('../db/005_offline_leases.sql', import.meta.url), 'utf8');
  await pool.query(migration);"""
if old not in test: raise SystemExit('offline migration declaration anchor missing')
test=test.replace(old,new,1)
test=test.replace("  await pool.query(dailyAuthority);","  await pool.query(dailyAuthority);\n  await pool.query(offlineLeases);",1)
test=test.replace("TRUNCATE journal_lines, journal_batches, stock_movements", "TRUNCATE receipt_blocks, offline_leases, devices, journal_lines, journal_batches, stock_movements",1)
# config secret
cfg="""    bootstrapToken: 'integration-bootstrap-token',
    timeZone: 'Asia/Baghdad',"""
if cfg not in test: raise SystemExit('test config marker missing')
test=test.replace(cfg,"""    bootstrapToken: 'integration-bootstrap-token',
    offlineLeaseSecret: 'integration-offline-lease-secret-which-is-not-production',
    timeZone: 'Asia/Baghdad',""",1)
# request helper default device after set
if "let activeDeviceId" not in test: test=test.replace("let cookie = '';","let cookie = '';\nlet activeDeviceId = '';",1)
old_headers="""      ...(cookie ? { cookie } : {}),
      ...headers,"""
if old_headers not in test: raise SystemExit('request helper header marker missing')
test=test.replace(old_headers,"""      ...(cookie ? { cookie } : {}),
      ...(activeDeviceId ? { 'x-device-id': activeDeviceId } : {}),
      ...headers,""",1)
# after successful login test, register device
login_assert="""  assert.equal(result.response.status, 200);
  assert.ok(cookie.startsWith('zhirox_session='));

  result = await request('/api/v1/session');"""
if login_assert not in test: raise SystemExit('login test marker missing')
test=test.replace(login_assert,"""  assert.equal(result.response.status, 200);
  assert.ok(cookie.startsWith('zhirox_session='));
  activeDeviceId = 'test-device-main-0001';
  const registered = await request('/api/v1/devices/register', { method:'POST', body:{ device_id:activeDeviceId, label:'Main test POS' } });
  assert.equal(registered.response.status,200);

  result = await request('/api/v1/session');""",1)
# Logout test clears session; financial login should preserve activeDeviceId, okay.
if "offline writer lease blocks a different device" not in test:
    test += r'''

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
'''
test_path.write_text(test,encoding='utf-8')

print('Offline writer lease and unique receipt-block authority generated.')
