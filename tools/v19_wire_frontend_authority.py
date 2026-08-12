from pathlib import Path
import re

src = Path('source/src')
server = Path('source/server')

# ---------- DB migration: customer optimistic version ----------
(server / 'db/004_daily_authority.sql').write_text(r'''BEGIN;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS customers_market_version_idx ON customers(market_id, version);
COMMIT;
''', encoding='utf-8')

# ---------- Server: CRUD/save + authoritative sale response ----------
app_path = server / 'src/app.mjs'
app = app_path.read_text(encoding='utf-8')
route_marker = "      if (req.method === 'GET' && url.pathname === '/api/v1/catalog/products') {"
if route_marker not in app:
    raise SystemExit('catalog products route marker missing')

save_routes = r'''      if (req.method === 'POST' && url.pathname === '/api/v1/catalog/products/save') {
        const user = await authenticate(pool, req);
        if (!user) return json(res, 401, { error: 'AUTH_REQUIRED' });
        if (!['owner','admin','stock_staff'].includes(user.role_type)) return json(res, 403, { error: 'PERMISSION_DENIED' });
        if (!user.branch_id) return json(res, 409, { error: 'BRANCH_REQUIRED' });
        const key = String(req.headers['idempotency-key'] || '').trim();
        if (!key || key.length > 128) return json(res, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' });
        const body = await readJson(req);
        const id = body.id ? String(body.id) : null;
        const barcode = String(body.barcode || '').trim();
        const name = String(body.name || '').trim();
        const expectedVersion = id ? Number(body.version) : null;
        if ((id && (!validEntityId(id) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1)) || !validBarcode(barcode) || !name || name.length > 300 || !safeMoney(body.cost_price_iqd) || !safeMoney(body.sale_price_iqd) || !safeStock(body.stock_quantity || 0) || !safeStock(body.low_stock_limit || 0)) {
          return json(res, 422, { error: 'INVALID_PRODUCT' });
        }
        const normalized = {
          id, barcode, name, name_en: body.name_en ? String(body.name_en).slice(0,300) : null,
          description: body.description ? String(body.description).slice(0,2000) : null,
          unit: String(body.unit || 'دانە').slice(0,50), cost: Number(body.cost_price_iqd), sale: Number(body.sale_price_iqd),
          stock: Number(body.stock_quantity || 0), low: Number(body.low_stock_limit || 0), currency: body.currency === 'USD' ? 'USD' : 'IQD',
          is_trackable: body.is_trackable !== false, status: body.status === 'inactive' ? 'inactive' : 'active',
          image_url: body.image_url ? String(body.image_url).slice(0,2000) : null,
          barcodes: Array.isArray(body.barcodes) ? [...new Set(body.barcodes.map(value => String(value).trim()).filter(value => validBarcode(value) && value !== barcode))].slice(0,20) : [],
          category_id: body.category_id && validEntityId(body.category_id) ? String(body.category_id) : null,
          version: expectedVersion,
        };
        const requestHash = sha256(JSON.stringify(normalized));
        const result = await withTransaction(pool, async client => {
          await lockIdempotency(client, user.market_id, 'products.save', key);
          const existing = await client.query(`SELECT request_hash,response_json FROM idempotency_keys WHERE market_id=$1 AND scope='products.save' AND idempotency_key=$2`, [user.market_id,key]);
          if (existing.rows[0]) {
            if (existing.rows[0].request_hash !== requestHash) return { status:409, body:{error:'IDEMPOTENCY_CONFLICT'} };
            return { status:200, body:existing.rows[0].response_json };
          }
          const barcodeConflict = await client.query('SELECT id FROM products WHERE market_id=$1 AND barcode=$2 AND ($3::text IS NULL OR id<>$3) LIMIT 1', [user.market_id,barcode,id]);
          if (barcodeConflict.rows[0]) return { status:409, body:{error:'BARCODE_DUPLICATE'} };
          let saved;
          if (!id) {
            saved = await client.query(
              `INSERT INTO products (id,market_id,branch_id,category_id,barcode,barcodes,name,name_en,description,unit,cost_price_iqd,sale_price_iqd,currency,stock_quantity,low_stock_limit,image_url,is_trackable,status,created_by)
               VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
               RETURNING *`,
              [createId('product'),user.market_id,user.branch_id,normalized.category_id,barcode,JSON.stringify(normalized.barcodes),name,normalized.name_en,normalized.description,normalized.unit,normalized.cost,normalized.sale,normalized.currency,normalized.stock,normalized.low,normalized.image_url,normalized.is_trackable,normalized.status,user.id]
            );
          } else {
            saved = await client.query(
              `UPDATE products SET category_id=$1,barcode=$2,barcodes=$3::jsonb,name=$4,name_en=$5,description=$6,unit=$7,cost_price_iqd=$8,sale_price_iqd=$9,currency=$10,stock_quantity=$11,low_stock_limit=$12,image_url=$13,is_trackable=$14,status=$15,version=version+1,updated_at=now()
                WHERE id=$16 AND market_id=$17 AND branch_id=$18 AND version=$19
                RETURNING *`,
              [normalized.category_id,barcode,JSON.stringify(normalized.barcodes),name,normalized.name_en,normalized.description,normalized.unit,normalized.cost,normalized.sale,normalized.currency,normalized.stock,normalized.low,normalized.image_url,normalized.is_trackable,normalized.status,id,user.market_id,user.branch_id,expectedVersion]
            );
            if (!saved.rows[0]) {
              const current = await client.query('SELECT version FROM products WHERE id=$1 AND market_id=$2 AND branch_id=$3', [id,user.market_id,user.branch_id]);
              return current.rows[0] ? { status:409, body:{error:'VERSION_CONFLICT', current_version:Number(current.rows[0].version)} } : { status:404, body:{error:'PRODUCT_NOT_FOUND'} };
            }
          }
          const row = saved.rows[0];
          const payload = { product:{...row,cost_price_iqd:Number(row.cost_price_iqd),sale_price_iqd:Number(row.sale_price_iqd),stock_quantity:Number(row.stock_quantity),low_stock_limit:Number(row.low_stock_limit),version:Number(row.version)} };
          await client.query(`INSERT INTO idempotency_keys (market_id,scope,idempotency_key,request_hash,response_json,user_id) VALUES ($1,'products.save',$2,$3,$4::jsonb,$5)`, [user.market_id,key,requestHash,JSON.stringify(payload),user.id]);
          return { status:id?200:201, body:payload };
        });
        return json(res,result.status,result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/customers/save') {
        const user = await authenticate(pool, req);
        if (!user) return json(res,401,{error:'AUTH_REQUIRED'});
        if (!['owner','admin'].includes(user.role_type)) return json(res,403,{error:'PERMISSION_DENIED'});
        const key = String(req.headers['idempotency-key'] || '').trim();
        if (!key || key.length > 128) return json(res,400,{error:'IDEMPOTENCY_KEY_REQUIRED'});
        const body = await readJson(req);
        const id = body.id ? String(body.id) : null;
        const name = String(body.name || '').trim();
        const code = String(body.code || '').trim();
        const version = id ? Number(body.version) : null;
        const debtLimit = body.debt_limit_iqd === null || body.debt_limit_iqd === undefined || body.debt_limit_iqd === '' ? null : Number(body.debt_limit_iqd);
        if ((id && (!validEntityId(id) || !Number.isSafeInteger(version) || version < 1)) || !name || name.length>300 || !code || code.length>64 || (debtLimit!==null && (!Number.isSafeInteger(debtLimit)||debtLimit<0))) return json(res,422,{error:'INVALID_CUSTOMER'});
        const normalized = { id,name,code,phone:body.phone?String(body.phone).slice(0,100):null,address:body.address?String(body.address).slice(0,1000):null,notes:body.notes?String(body.notes).slice(0,2000):null,debt_limit_iqd:debtLimit,status:body.status==='blocked'?'blocked':'active',version };
        const requestHash = sha256(JSON.stringify(normalized));
        const result = await withTransaction(pool,async client=>{
          await lockIdempotency(client,user.market_id,'customers.save',key);
          const existing=await client.query(`SELECT request_hash,response_json FROM idempotency_keys WHERE market_id=$1 AND scope='customers.save' AND idempotency_key=$2`,[user.market_id,key]);
          if(existing.rows[0]){ if(existing.rows[0].request_hash!==requestHash)return {status:409,body:{error:'IDEMPOTENCY_CONFLICT'}}; return {status:200,body:existing.rows[0].response_json}; }
          const codeConflict=await client.query('SELECT id FROM customers WHERE market_id=$1 AND code=$2 AND ($3::text IS NULL OR id<>$3) LIMIT 1',[user.market_id,code,id]);
          if(codeConflict.rows[0])return {status:409,body:{error:'CUSTOMER_CODE_DUPLICATE'}};
          let saved;
          if(!id){
            saved=await client.query(`INSERT INTO customers (id,market_id,code,name,phone,address,notes,debt_limit_iqd,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[createId('customer'),user.market_id,code,name,normalized.phone,normalized.address,normalized.notes,debtLimit,normalized.status,user.id]);
          } else {
            saved=await client.query(`UPDATE customers SET code=$1,name=$2,phone=$3,address=$4,notes=$5,debt_limit_iqd=$6,status=$7,version=version+1,updated_at=now() WHERE id=$8 AND market_id=$9 AND version=$10 RETURNING *`,[code,name,normalized.phone,normalized.address,normalized.notes,debtLimit,normalized.status,id,user.market_id,version]);
            if(!saved.rows[0]){ const current=await client.query('SELECT version FROM customers WHERE id=$1 AND market_id=$2',[id,user.market_id]); return current.rows[0]?{status:409,body:{error:'VERSION_CONFLICT',current_version:Number(current.rows[0].version)}}:{status:404,body:{error:'CUSTOMER_NOT_FOUND'}}; }
          }
          const row=saved.rows[0];
          const balance=await client.query('SELECT COALESCE(balance_iqd,0) AS balance_iqd FROM customer_balances WHERE market_id=$1 AND customer_id=$2',[user.market_id,row.id]);
          const payload={customer:{...row,debt_limit_iqd:row.debt_limit_iqd===null?null:Number(row.debt_limit_iqd),version:Number(row.version),balance_iqd:Number(balance.rows[0]?.balance_iqd||0)}};
          await client.query(`INSERT INTO idempotency_keys (market_id,scope,idempotency_key,request_hash,response_json,user_id) VALUES ($1,'customers.save',$2,$3,$4::jsonb,$5)`,[user.market_id,key,requestHash,JSON.stringify(payload),user.id]);
          return {status:id?200:201,body:payload};
        });
        return json(res,result.status,result.body);
      }

''' + route_marker
app = app.replace(route_marker, save_routes, 1)

# Extend sale response with server-truth lines and methods.
old_response = r'''          const response = {
            sale_id: saleId,
            receipt_number: receiptNumber,
            subtotal_iqd: subtotal,
            discount_iqd: discountIqd,
            total_iqd: total,
            paid_iqd: paidIqd,
            debt_iqd: debt,
            customer_balance_iqd: customer ? balanceBefore + debt : null,
          };'''
new_response = r'''          const response = {
            sale_id: saleId,
            receipt_number: receiptNumber,
            payment_method: body.payment_method,
            paid_method: paidIqd > 0 ? paidMethod : null,
            customer_id: body.customer_id || null,
            subtotal_iqd: subtotal,
            discount_iqd: discountIqd,
            total_iqd: total,
            paid_iqd: paidIqd,
            debt_iqd: debt,
            customer_balance_iqd: customer ? balanceBefore + debt : null,
            items: lines.map(line => ({
              product_id: line.product.id,
              product_name: line.product.name,
              barcode: line.product.barcode,
              quantity: line.quantity,
              unit_price_iqd: Number(line.product.sale_price_iqd),
              unit_cost_iqd: Number(line.product.cost_price_iqd),
              line_total_iqd: line.lineTotal,
              stock_after: line.stockAfter,
            })),
          };'''
if old_response not in app:
    raise SystemExit('authoritative sale response block missing')
app = app.replace(old_response,new_response,1)
app_path.write_text(app,encoding='utf-8')

# ---------- Frontend server API ----------
api_path = src / 'services/serverApi.ts'
api = api_path.read_text(encoding='utf-8')
insert_before = "export const serverApi = {"
types_block = r'''
export interface ServerProduct {
  id:string; market_id:string; branch_id:string; category_id?:string|null; barcode:string; barcodes:string[];
  name:string; name_en?:string|null; description?:string|null; unit:string; cost_price_iqd:number; sale_price_iqd:number;
  currency:'IQD'|'USD'; stock_quantity:number; low_stock_limit:number; image_url?:string|null; is_trackable:boolean;
  status:'active'|'inactive'; version:number; created_at:string; updated_at:string;
}
export interface ServerCustomer {
  id:string; market_id:string; code:string; name:string; phone?:string|null; address?:string|null; notes?:string|null;
  debt_limit_iqd:number|null; balance_iqd:number; status:'active'|'blocked'; version:number; created_at:string; updated_at:string;
}
export interface ServerSaleCommit {
  sale_id:string; receipt_number:string; payment_method:'cash'|'card'|'bank'|'debt'|'mixed'; paid_method:'cash'|'card'|'bank'|null;
  customer_id:string|null; subtotal_iqd:number; discount_iqd:number; total_iqd:number; paid_iqd:number; debt_iqd:number;
  customer_balance_iqd:number|null; items:Array<{product_id:string;product_name:string;barcode:string;quantity:number;unit_price_iqd:number;unit_cost_iqd:number;line_total_iqd:number;stock_after:number}>;
}
const operationId = (prefix:string) => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return `${prefix}-${cryptoApi.randomUUID()}`;
  const bytes = new Uint8Array(16); cryptoApi?.getRandomValues?.(bytes);
  const suffix = bytes.length ? Array.from(bytes).map(v=>v.toString(16).padStart(2,'0')).join('') : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
};

async function loadPages<T>(path:string):Promise<T[]> {
  const all:T[]=[]; let after='';
  do {
    const query = new URLSearchParams({limit:'500'}); if(after)query.set('after_id',after);
    const page=await apiFetch<{items:T[];next_after_id:string|null}>(`${path}?${query.toString()}`);
    all.push(...page.items); after=page.next_after_id||'';
  } while(after);
  return all;
}

'''
if insert_before not in api:
    raise SystemExit('serverApi export marker missing')
api = api.replace(insert_before,types_block+insert_before,1)
# Add methods before reserveReceipt
reserve_marker = "  reserveReceipt: (idempotencyKey: string, businessDate?: string) =>"
methods = r'''  loadProducts: () => loadPages<ServerProduct>('/api/v1/catalog/products'),
  loadCustomers: () => loadPages<ServerCustomer>('/api/v1/customers'),
  saveProduct: (input: Partial<ServerProduct> & { barcode:string; name:string; cost_price_iqd:number; sale_price_iqd:number; stock_quantity:number; low_stock_limit:number }) => {
    const key=operationId('product-save');
    return apiFetch<{product:ServerProduct}>('/api/v1/catalog/products/save',{method:'POST',headers:{'idempotency-key':key},body:JSON.stringify(input)});
  },
  saveCustomer: (input: Partial<ServerCustomer> & { code:string; name:string }) => {
    const key=operationId('customer-save');
    return apiFetch<{customer:ServerCustomer}>('/api/v1/customers/save',{method:'POST',headers:{'idempotency-key':key},body:JSON.stringify(input)});
  },
  commitSale: (input:{client_operation_id:string;customer_id?:string;payment_method:'cash'|'card'|'bank'|'debt'|'mixed';paid_method?:'cash'|'card'|'bank';paid_iqd:number;discount_iqd:number;items:Array<{product_id:string;quantity:number}>}, idempotencyKey:string) =>
    apiFetch<ServerSaleCommit>('/api/v1/sales/commit',{method:'POST',headers:{'idempotency-key':idempotencyKey},body:JSON.stringify(input)}),
  createOperationId: operationId,
'''+reserve_marker
if reserve_marker not in api:
    raise SystemExit('reserveReceipt marker missing')
api = api.replace(reserve_marker,methods,1)
api_path.write_text(api,encoding='utf-8')

# ---------- Types add optimistic version ----------
types_path=src/'types/index.ts'
types=types_path.read_text(encoding='utf-8')
# add optional version once inside Product and Customer
product_anchor="  updated_at: string;\n}\n\n// ===== Customers ====="
if product_anchor not in types: raise SystemExit('Product version anchor missing')
types=types.replace(product_anchor,"  updated_at: string;\n  version?: number;\n}\n\n// ===== Customers =====",1)
customer_anchor="  created_by: ID;\n  created_at: string;\n  updated_at: string;\n}\n\nexport interface CustomerBalance"
if customer_anchor not in types: raise SystemExit('Customer version anchor missing')
types=types.replace(customer_anchor,"  created_by: ID;\n  created_at: string;\n  updated_at: string;\n  version?: number;\n}\n\nexport interface CustomerBalance",1)
types_path.write_text(types,encoding='utf-8')

# ---------- dataStore authoritative hydration/application ----------
store_path=src/'stores/dataStore.ts'
store=store_path.read_text(encoding='utf-8')
# imports types from serverApi
store=store.replace("} from '../types';", "} from '../types';\nimport type { ServerProduct, ServerCustomer, ServerSaleCommit } from '../services/serverApi';",1)
interface_anchor="  clearTenantContext: () => void;"
if interface_anchor not in store: raise SystemExit('tenant interface anchor missing')
store=store.replace(interface_anchor,interface_anchor+"\n  hydrateAuthoritativeCatalog: (products: ServerProduct[], customers: ServerCustomer[]) => void;\n  upsertAuthoritativeProduct: (product: ServerProduct) => void;\n  upsertAuthoritativeCustomer: (customer: ServerCustomer) => void;\n  applyAuthoritativeSale: (response: ServerSaleCommit, userId: string, cartSnapshot: Cart) => Sale;",1)
impl_anchor="      clearTenantContext: () => set({ tenantContext: null }),"
if impl_anchor not in store: raise SystemExit('tenant implementation anchor missing')
impl = impl_anchor + r'''
      hydrateAuthoritativeCatalog: (serverProducts, serverCustomers) => {
        const tenant=requireTenantContext(get().tenantContext); const now=new Date().toISOString();
        const products:Product[]=serverProducts.filter(p=>p.market_id===tenant.marketId).map(p=>({id:p.id,market_id:p.market_id,branch_id:p.branch_id,category_id:p.category_id||undefined,barcode:p.barcode,barcodes:p.barcodes||[],name:p.name,name_en:p.name_en||undefined,description:p.description||undefined,unit:p.unit,cost_price:p.cost_price_iqd,sale_price:p.sale_price_iqd,currency:p.currency,stock_quantity:p.stock_quantity,low_stock_limit:p.low_stock_limit,image_url:p.image_url||undefined,is_trackable:p.is_trackable,status:p.status,created_by:'server',created_at:p.created_at||now,updated_at:p.updated_at||now,version:p.version}));
        const customers:Customer[]=serverCustomers.filter(c=>c.market_id===tenant.marketId).map(c=>({id:c.id,market_id:c.market_id,code:c.code,name:c.name,phone:c.phone||undefined,address:c.address||undefined,notes:c.notes||undefined,debt_limit:c.debt_limit_iqd??undefined,status:c.status,created_by:'server',created_at:c.created_at||now,updated_at:c.updated_at||now,version:c.version}));
        const customerBalances:CustomerBalance[]=serverCustomers.filter(c=>c.market_id===tenant.marketId).map(c=>({id:`bal-${c.id}`,market_id:c.market_id,customer_id:c.id,balance_iqd:c.balance_iqd||0,balance_usd:0,updated_at:c.updated_at||now}));
        set({products,customers,customerBalances});
      },
      upsertAuthoritativeProduct: (p) => { const now=new Date().toISOString(); const mapped:Product={id:p.id,market_id:p.market_id,branch_id:p.branch_id,category_id:p.category_id||undefined,barcode:p.barcode,barcodes:p.barcodes||[],name:p.name,name_en:p.name_en||undefined,description:p.description||undefined,unit:p.unit,cost_price:p.cost_price_iqd,sale_price:p.sale_price_iqd,currency:p.currency,stock_quantity:p.stock_quantity,low_stock_limit:p.low_stock_limit,image_url:p.image_url||undefined,is_trackable:p.is_trackable,status:p.status,created_by:'server',created_at:p.created_at||now,updated_at:p.updated_at||now,version:p.version}; set(state=>({products:[...state.products.filter(item=>item.id!==mapped.id),mapped]})); },
      upsertAuthoritativeCustomer: (c) => { const now=new Date().toISOString(); const mapped:Customer={id:c.id,market_id:c.market_id,code:c.code,name:c.name,phone:c.phone||undefined,address:c.address||undefined,notes:c.notes||undefined,debt_limit:c.debt_limit_iqd??undefined,status:c.status,created_by:'server',created_at:c.created_at||now,updated_at:c.updated_at||now,version:c.version}; const balance:CustomerBalance={id:`bal-${c.id}`,market_id:c.market_id,customer_id:c.id,balance_iqd:c.balance_iqd||0,balance_usd:0,updated_at:c.updated_at||now}; set(state=>({customers:[...state.customers.filter(item=>item.id!==mapped.id),mapped],customerBalances:[...state.customerBalances.filter(item=>item.customer_id!==mapped.id),balance]})); },
      applyAuthoritativeSale: (response,userId,cartSnapshot) => {
        const tenant=requireTenantContext(get().tenantContext); const now=new Date().toISOString();
        const customer=cartSnapshot.customer_id?get().getCustomerById(cartSnapshot.customer_id):undefined;
        const paymentType = (['cash','debt','mixed'].includes(response.payment_method)?response.payment_method:(response.debt_iqd>0?'mixed':'cash')) as PaymentType;
        const sale:Sale={id:response.sale_id,market_id:tenant.marketId,branch_id:tenant.branchId,receipt_number:response.receipt_number,customer_id:response.customer_id||undefined,customer,cashier_id:userId,subtotal:response.subtotal_iqd,discount_amount:response.discount_iqd,total_amount:response.total_iqd,paid_amount:response.paid_iqd,debt_amount:response.debt_iqd,payment_type:paymentType,currency:'IQD',status:'completed',created_at:now,updated_at:now};
        const saleItems:SaleItem[]=response.items.map(line=>{const product=get().getProductById(line.product_id);return{id:`si-${response.sale_id}-${line.product_id}`,sale_id:response.sale_id,product_id:line.product_id,product,quantity:line.quantity,unit_price:line.unit_price_iqd,discount_amount:0,total_price:line.line_total_iqd,cost_price:line.unit_cost_iqd,created_at:now};});
        const payments:Payment[]=response.paid_iqd>0?[{id:`pay-${response.sale_id}`,market_id:tenant.marketId,branch_id:tenant.branchId,payment_for:'sale',reference_id:response.sale_id,customer_id:response.customer_id||undefined,amount:response.paid_iqd,currency:'IQD',payment_method:response.paid_method==='bank'?'transfer':response.paid_method==='card'?'card':'cash',received_by:userId,created_at:now}]:[];
        const debtTransactions:DebtTransaction[]=response.debt_iqd>0&&response.customer_id?[{id:`dt-${response.sale_id}`,market_id:tenant.marketId,branch_id:tenant.branchId,customer_id:response.customer_id,type:'debt_added',amount:response.debt_iqd,currency:'IQD',balance_before:Math.max(0,(response.customer_balance_iqd||0)-response.debt_iqd),balance_after:response.customer_balance_iqd||response.debt_iqd,reference_type:'sale',reference_id:response.sale_id,created_by:userId,created_at:now}]:[];
        const stockMovements:StockMovement[]=response.items.map(line=>{const current=get().getProductById(line.product_id);return{id:`sm-${response.sale_id}-${line.product_id}`,market_id:tenant.marketId,branch_id:tenant.branchId,product_id:line.product_id,product:current,type:'sale',quantity:-line.quantity,stock_before:line.stock_after+line.quantity,stock_after:line.stock_after,reference_type:'sale',reference_id:response.sale_id,created_by:userId,created_at:now};});
        set(state=>({sales:[...state.sales.filter(s=>s.id!==sale.id),sale],saleItems:[...state.saleItems.filter(i=>i.sale_id!==sale.id),...saleItems],payments:[...state.payments.filter(p=>p.reference_id!==sale.id),...payments],debtTransactions:[...state.debtTransactions.filter(d=>d.reference_id!==sale.id),...debtTransactions],stockMovements:[...state.stockMovements.filter(m=>m.reference_id!==sale.id),...stockMovements],products:state.products.map(p=>{const line=response.items.find(i=>i.product_id===p.id);return line?{...p,stock_quantity:line.stock_after,updated_at:now}:p;}),customerBalances:state.customerBalances.map(b=>response.customer_id&&b.customer_id===response.customer_id&&response.customer_balance_iqd!==null?{...b,balance_iqd:response.customer_balance_iqd,updated_at:now}:b),cart:emptyCart}));
        return sale;
      },'''
store=store.replace(impl_anchor,impl,1)
store_path.write_text(store,encoding='utf-8')

# ---------- Auth: hydrate catalog after server context ----------
auth_path=src/'stores/authStore.ts'
auth=auth_path.read_text(encoding='utf-8')
old_bind=r'''async function bindTenant(context: ReturnType<typeof toLocalContext> | null) {
  const { useDataStore } = await import('./dataStore');
  if (!context?.branch) {
    useDataStore.getState().clearTenantContext();
    return;
  }
  useDataStore.getState().setTenantContext(context.market.id, context.branch.id);
}'''
new_bind=r'''async function bindTenant(context: ReturnType<typeof toLocalContext> | null) {
  const { useDataStore } = await import('./dataStore');
  if (!context?.branch) { useDataStore.getState().clearTenantContext(); return; }
  useDataStore.getState().setTenantContext(context.market.id, context.branch.id);
  try {
    const [products,customers]=await Promise.all([serverApi.loadProducts(),serverApi.loadCustomers()]);
    useDataStore.getState().hydrateAuthoritativeCatalog(products,customers);
  } catch (error) {
    console.warn('Authoritative catalog hydration failed; keeping last local cache', error);
  }
}'''
if old_bind not in auth: raise SystemExit('bindTenant block missing')
auth=auth.replace(old_bind,new_bind,1)
auth_path.write_text(auth,encoding='utf-8')

# ---------- POS: server-first sale ----------
pos_path=src/'pages/POS.tsx'
pos=pos_path.read_text(encoding='utf-8')
pos=pos.replace("import { ProductQuickView } from '../components/features/ProductQuickView';", "import { ProductQuickView } from '../components/features/ProductQuickView';\nimport { ApiError, serverApi } from '../services/serverApi';",1)
pos=pos.replace("  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);", "  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);\n  const [isCompleting, setIsCompleting] = useState(false);\n  const pendingOperationRef = useRef<{key:string;operationId:string}|null>(null);",1)
pos=pos.replace("    completeSale,", "    applyAuthoritativeSale,",1)
old_handle=re.search(r"  const handleCompleteSale = \(\) => \{.*?\n  \};\n\n  const handleSelectCustomer",pos,re.S)
if not old_handle: raise SystemExit('POS handleCompleteSale block missing')
new_handle=r'''  const handleCompleteSale = async () => {
    if (!user || isCompleting || cart.items.length===0) return;
    const savedItems=[...cart.items]; const cartSnapshot={...cart,items:[...cart.items]};
    const pending=pendingOperationRef.current||{key:serverApi.createOperationId('sale-key'),operationId:serverApi.createOperationId('sale-op')};
    pendingOperationRef.current=pending; setIsCompleting(true);
    try {
      const response=await serverApi.commitSale({client_operation_id:pending.operationId,customer_id:cart.customer_id,payment_method:cart.payment_type,paid_method:'cash',paid_iqd:cart.paid_amount,discount_iqd:cart.discount_amount,items:cart.items.map(item=>({product_id:item.product.id,quantity:item.quantity}))},pending.key);
      const sale=applyAuthoritativeSale(response,user.id,cartSnapshot);
      setCompletedSale(sale);
      setCompletedItems(response.items.map(line=>{const original=savedItems.find(item=>item.product.id===line.product_id);return original?{...original,quantity:line.quantity,unit_price:line.unit_price_iqd,total_price:line.line_total_iqd}:{id:`receipt-${line.product_id}`,product_id:line.product_id,product:{id:line.product_id,name:line.product_name,barcode:line.barcode} as Product,quantity:line.quantity,unit_price:line.unit_price_iqd,discount_amount:0,total_price:line.line_total_iqd};}) as CartItem[]);
      pendingOperationRef.current=null; setShowReceiptModal(true); setShowMobileCart(false); setDiscountValue(0); playSaleSound(); toast.success(translations.pos.sale_completed);
    } catch(error) {
      const code=error instanceof ApiError?error.code:'UNKNOWN_ERROR';
      const messages:Record<string,string>={NETWORK_UNAVAILABLE:'پەیوەندی بە سێرڤەر نییە؛ مامەڵە تۆمار نەکرا',STOCK_INSUFFICIENT:'کۆگا بەس نییە',PRODUCT_UNAVAILABLE:'کالا لە سێرڤەر بەردەست نییە',CREDIT_LIMIT_EXCEEDED:'سنووری قەرزی کڕیار تێدەپەڕێت',CUSTOMER_REQUIRED_FOR_DEBT:'بۆ قەرز کڕیار دیاری بکە',DISCOUNT_REQUIRES_APPROVAL:'داشکاندن پێویستی بە پەسەندی بەڕێوەبەر هەیە',VERSION_CONFLICT:'داتا لە ئامێرێکی تر گۆڕاوە'};
      toast.error(messages[code]||code);
    } finally { setIsCompleting(false); }
  };

  const handleSelectCustomer'''
pos=pos[:old_handle.start()]+new_handle+pos[old_handle.end():]
pos=pos.replace("<Button onClick={handleCompleteSale} disabled={cart.items.length === 0}", "<Button onClick={() => void handleCompleteSale()} disabled={cart.items.length === 0 || isCompleting} isLoading={isCompleting}",1)
pos_path.write_text(pos,encoding='utf-8')

# ---------- Products page server-first save ----------
products_path=src/'pages/Products.tsx'
products=products_path.read_text(encoding='utf-8')
products=products.replace("import type { Product } from '../types';", "import type { Product } from '../types';\nimport { ApiError, serverApi } from '../services/serverApi';",1)
products=products.replace("  const { getProducts, getCategories, addProduct, updateProduct, getProductByBarcode, addAuditLog } = useDataStore();", "  const { getProducts, getCategories, getProductByBarcode, upsertAuthoritativeProduct } = useDataStore();",1)
match=re.search(r"  const handleSaveProduct = \(productData: Partial<Product>\) => \{.*?\n  \};\n\n  const categoryOptions",products,re.S)
if not match: raise SystemExit('Products save handler missing')
handler=r'''  const handleSaveProduct = async (productData: Partial<Product>) => {
    if (!user?.market_id || !user.branch_id) { toast.error('هەژماری فرۆشگا/لق دیاری نەکراوە'); return; }
    const primaryBarcode=productData.barcode||editingProduct?.barcode||'';
    if(!editingProduct){ for(const bc of [primaryBarcode,...(productData.barcodes||[])].filter(Boolean) as string[]){if(getProductByBarcode(bc)){toast.error(`${translations.errors.BARCODE_DUPLICATE}: ${bc}`);return;}} }
    try {
      const {product}=await serverApi.saveProduct({id:editingProduct?.id,version:editingProduct?.version,category_id:productData.category_id,barcode:primaryBarcode,barcodes:productData.barcodes||editingProduct?.barcodes||[],name:productData.name||editingProduct?.name||'',name_en:productData.name_en,description:productData.description,unit:productData.unit||editingProduct?.unit||'دانە',cost_price_iqd:productData.cost_price??editingProduct?.cost_price??0,sale_price_iqd:productData.sale_price??editingProduct?.sale_price??0,currency:'IQD',stock_quantity:productData.stock_quantity??editingProduct?.stock_quantity??0,low_stock_limit:productData.low_stock_limit??editingProduct?.low_stock_limit??10,is_trackable:productData.is_trackable??editingProduct?.is_trackable??true,status:(productData.status||editingProduct?.status||'active') as 'active'|'inactive'});
      upsertAuthoritativeProduct(product); toast.success(editingProduct?translations.success.product_updated:translations.success.product_created); setEditingProduct(null); setShowAddModal(false);
    } catch(error){const code=error instanceof ApiError?error.code:'UNKNOWN_ERROR';toast.error(code==='VERSION_CONFLICT'?'کالاکە لە ئامێرێکی تر گۆڕاوە؛ پەڕەکە نوێ بکەرەوە':code==='BARCODE_DUPLICATE'?translations.errors.BARCODE_DUPLICATE:code);}
  };

  const categoryOptions'''
products=products[:match.start()]+handler+products[match.end():]
# form callback likely expects sync; async okay with void wrapper maybe locate onSave
products=products.replace("onSave={handleSaveProduct}", "onSave={(data) => void handleSaveProduct(data)}")
products_path.write_text(products,encoding='utf-8')

# ---------- Customers page server-first save ----------
customers_path=src/'pages/Customers.tsx'
customers=customers_path.read_text(encoding='utf-8')
customers=customers.replace("import type { Customer } from '../types';", "import type { Customer } from '../types';\nimport { ApiError, serverApi } from '../services/serverApi';",1)
customers=customers.replace("  const { getCustomers, getCustomerBalance, addCustomer, updateCustomer, addAuditLog } = useDataStore();", "  const { getCustomers, getCustomerBalance, upsertAuthoritativeCustomer } = useDataStore();",1)
match=re.search(r"  const handleSaveCustomer = \(customerData: Partial<Customer>\) => \{.*?\n  \};\n\n  const debtFilterOptions",customers,re.S)
if not match: raise SystemExit('Customers save handler missing')
handler=r'''  const handleSaveCustomer = async (customerData: Partial<Customer>) => {
    if (!user?.market_id || !user.branch_id) { toast.error('هەژماری فرۆشگا/لق دیاری نەکراوە'); return; }
    try {
      const {customer}=await serverApi.saveCustomer({id:editingCustomer?.id,version:editingCustomer?.version,code:editingCustomer?.code||`C-${Date.now()}`,name:customerData.name||editingCustomer?.name||'',phone:customerData.phone,address:customerData.address,notes:customerData.notes,debt_limit_iqd:customerData.debt_limit??editingCustomer?.debt_limit??null,status:(customerData.status||editingCustomer?.status||'active') as 'active'|'blocked'});
      upsertAuthoritativeCustomer(customer); toast.success(editingCustomer?translations.success.customer_updated:translations.success.customer_created); setEditingCustomer(null); setShowAddModal(false);
    } catch(error){const code=error instanceof ApiError?error.code:'UNKNOWN_ERROR';toast.error(code==='VERSION_CONFLICT'?'کڕیارەکە لە ئامێرێکی تر گۆڕاوە؛ پەڕەکە نوێ بکەرەوە':code==='CUSTOMER_CODE_DUPLICATE'?'کۆدی کڕیار دووبارەیە':code);}
  };

  const debtFilterOptions'''
customers=customers[:match.start()]+handler+customers[match.end():]
customers=customers.replace("onSave={handleSaveCustomer}", "onSave={(data) => void handleSaveCustomer(data)}")
customers_path.write_text(customers,encoding='utf-8')

# ---------- Integration test migration + CRUD/version + sale response ----------
test_path=server/'test/server.test.mjs'
test=test_path.read_text(encoding='utf-8')
old="""  const catalog = await fs.readFile(new URL('../db/003_catalog.sql', import.meta.url), 'utf8');
  await pool.query(migration);
  await pool.query(financial);
  await pool.query(catalog);"""
new="""  const catalog = await fs.readFile(new URL('../db/003_catalog.sql', import.meta.url), 'utf8');
  const dailyAuthority = await fs.readFile(new URL('../db/004_daily_authority.sql', import.meta.url), 'utf8');
  await pool.query(migration);
  await pool.query(financial);
  await pool.query(catalog);
  await pool.query(dailyAuthority);"""
if old not in test: raise SystemExit('daily authority migration anchor missing')
test=test.replace(old,new,1)
if "product save rejects stale optimistic version" not in test:
    test += r'''

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
'''
test_path.write_text(test,encoding='utf-8')

print('Daily CRUD and frontend POS wired to authoritative server.')
