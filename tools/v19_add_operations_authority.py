from pathlib import Path

server=Path('source/server')
(server/'db/009_operations.sql').write_text(r'''BEGIN;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS debt_remaining_iqd bigint NOT NULL DEFAULT 0 CHECK (debt_remaining_iqd >= 0);
UPDATE sales SET debt_remaining_iqd=debt_iqd WHERE debt_iqd>0 AND debt_remaining_iqd=0;

CREATE TABLE IF NOT EXISTS customer_receipts (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  receipt_number text NOT NULL,
  amount_iqd bigint NOT NULL CHECK (amount_iqd > 0),
  method text NOT NULL CHECK (method IN ('cash','card','bank')),
  received_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id,receipt_number)
);
CREATE TABLE IF NOT EXISTS customer_receipt_allocations (
  receipt_id text NOT NULL REFERENCES customer_receipts(id) ON DELETE RESTRICT,
  sale_id text NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  amount_iqd bigint NOT NULL CHECK (amount_iqd > 0),
  PRIMARY KEY (receipt_id,sale_id)
);

CREATE TABLE IF NOT EXISTS sale_returns (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  sale_id text NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  return_number text NOT NULL,
  total_iqd bigint NOT NULL CHECK (total_iqd > 0),
  debt_reversal_iqd bigint NOT NULL DEFAULT 0 CHECK (debt_reversal_iqd >= 0),
  refund_iqd bigint NOT NULL DEFAULT 0 CHECK (refund_iqd >= 0),
  refund_method text CHECK (refund_method IN ('cash','card','bank')),
  returned_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id,return_number)
);
CREATE TABLE IF NOT EXISTS sale_return_items (
  id text PRIMARY KEY,
  return_id text NOT NULL REFERENCES sale_returns(id) ON DELETE RESTRICT,
  sale_item_id text NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  refund_iqd bigint NOT NULL CHECK (refund_iqd >= 0),
  cost_iqd bigint NOT NULL CHECK (cost_iqd >= 0)
);
CREATE INDEX IF NOT EXISTS sale_return_items_sale_item_idx ON sale_return_items(sale_item_id);

CREATE TABLE IF NOT EXISTS expenses (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  expense_number text NOT NULL,
  category text NOT NULL,
  description text,
  amount_iqd bigint NOT NULL CHECK (amount_iqd > 0),
  method text NOT NULL CHECK (method IN ('cash','card','bank')),
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id,expense_number)
);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  cashier_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  opening_amount_iqd bigint NOT NULL CHECK (opening_amount_iqd >= 0),
  expected_amount_iqd bigint,
  counted_amount_iqd bigint,
  difference_iqd bigint,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  version bigint NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_device_open_uidx ON cash_sessions(market_id,branch_id,device_id) WHERE status='open';
CREATE INDEX IF NOT EXISTS cash_sessions_branch_opened_idx ON cash_sessions(market_id,branch_id,opened_at DESC);

COMMIT;
''',encoding='utf-8')

app_path=server/'src/app.mjs';app=app_path.read_text(encoding='utf-8')
# New sale rows must initialize remaining debt.
old_insert="""`INSERT INTO sales (id, market_id, branch_id, receipt_number, cashier_id, customer_id, client_operation_id, payment_method, subtotal_iqd, discount_iqd, total_iqd, paid_iqd, debt_iqd)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [saleId, user.market_id, user.branch_id, receiptNumber, saleActorId, body.customer_id || null, body.client_operation_id, body.payment_method, subtotal, discountIqd, total, paidIqd, debt]"""
new_insert="""`INSERT INTO sales (id, market_id, branch_id, receipt_number, cashier_id, customer_id, client_operation_id, payment_method, subtotal_iqd, discount_iqd, total_iqd, paid_iqd, debt_iqd, debt_remaining_iqd)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)`,
            [saleId, user.market_id, user.branch_id, receiptNumber, saleActorId, body.customer_id || null, body.client_operation_id, body.payment_method, subtotal, discountIqd, total, paidIqd, debt]"""
if old_insert not in app: raise SystemExit('sales insert marker missing')
app=app.replace(old_insert,new_insert,1)

# Helpers for operational writes.
marker="async function lockIdempotency(client, marketId, scope, key) {"
idx=app.find(marker);end=app.find("}\n",idx)+2
if idx<0: raise SystemExit('idempotency helper missing')
helpers=r'''

const safeSignedStock = value => Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 1_000_000 && Math.round(Number(value)*1000)===Number(value)*1000;
async function operationDeviceGate(client,user,req){const device=await registeredDevice(client,user,req);if(!device)return {error:'DEVICE_NOT_REGISTERED'};await lockBranchWriter(client,user);const leaseGate=await enforceWriterLease(client,user,device.id);if(leaseGate)return leaseGate;return {device};}
async function operationIdempotency(client,user,scope,key,requestHash){await lockIdempotency(client,user.market_id,scope,key);const existing=await client.query('SELECT request_hash,response_json FROM idempotency_keys WHERE market_id=$1 AND scope=$2 AND idempotency_key=$3',[user.market_id,scope,key]);if(existing.rows[0]){if(existing.rows[0].request_hash!==requestHash)return {conflict:true};return {cached:existing.rows[0].response_json};}return {};}
async function saveOperationIdempotency(client,user,scope,key,requestHash,payload){await client.query('INSERT INTO idempotency_keys (market_id,scope,idempotency_key,request_hash,response_json,user_id) VALUES ($1,$2,$3,$4,$5::jsonb,$6)',[user.market_id,scope,key,requestHash,JSON.stringify(payload),user.id]);}
async function originalPaidMethod(client,saleId){const result=await client.query('SELECT method FROM payments WHERE sale_id=$1 ORDER BY created_at,id LIMIT 1',[saleId]);return result.rows[0]?.method||'cash';}
'''
app=app[:end]+helpers+app[end:]

route_marker="      if (req.method === 'POST' && url.pathname === '/api/v1/sales/commit') {"
if route_marker not in app: raise SystemExit('sale route marker missing')
routes=r'''      if (req.method === 'POST' && url.pathname === '/api/v1/customer-receipts') {
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

''' + route_marker
app=app.replace(route_marker,routes,1)
app_path.write_text(app,encoding='utf-8')

# Tests migration + authoritative operations.
test_path=server/'test/server.test.mjs';test=test_path.read_text(encoding='utf-8')
old="""  const userManagement = await fs.readFile(new URL('../db/006_user_management.sql', import.meta.url), 'utf8');
  await pool.query(migration);"""
new="""  const userManagement = await fs.readFile(new URL('../db/006_user_management.sql', import.meta.url), 'utf8');
  const operations = await fs.readFile(new URL('../db/009_operations.sql', import.meta.url), 'utf8');
  await pool.query(migration);"""
if old not in test: raise SystemExit('operations migration declaration anchor missing')
test=test.replace(old,new,1)
test=test.replace("  await pool.query(userManagement);","  await pool.query(userManagement);\n  await pool.query(operations);",1)
test=test.replace("TRUNCATE security_audit,", "TRUNCATE cash_sessions,expenses,sale_return_items,sale_returns,customer_receipt_allocations,customer_receipts,security_audit,",1)
if "customer debt receipt allocates oldest sale debt" not in test:
    test += r'''

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
'''
test_path.write_text(test,encoding='utf-8')
print('Authoritative returns, debt receipts, stock adjustments, expenses and cash sessions generated.')
