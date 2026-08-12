from pathlib import Path
import runpy

runpy.run_path('tools/v19_wire_frontend_authority.py', run_name='__main__')

# Customer catalog pages must carry optimistic version back to the frontend.
app_path=Path('source/server/src/app.mjs')
app=app_path.read_text(encoding='utf-8')
old="SELECT c.id,c.market_id,c.code,c.name,c.phone,c.address,c.notes,c.debt_limit_iqd,c.status,c.created_at,c.updated_at,"
new="SELECT c.id,c.market_id,c.code,c.name,c.phone,c.address,c.notes,c.debt_limit_iqd,c.status,c.version,c.created_at,c.updated_at,"
if old not in app: raise SystemExit('Customer list select marker not found')
app=app.replace(old,new,1)

# Product stock edits must leave an explicit stock movement inside the same save transaction.
old_update="""            saved = await client.query(
              `UPDATE products SET category_id=$1,barcode=$2,barcodes=$3::jsonb,name=$4,name_en=$5,description=$6,unit=$7,cost_price_iqd=$8,sale_price_iqd=$9,currency=$10,stock_quantity=$11,low_stock_limit=$12,image_url=$13,is_trackable=$14,status=$15,version=version+1,updated_at=now()
                WHERE id=$16 AND market_id=$17 AND branch_id=$18 AND version=$19
                RETURNING *`,
              [normalized.category_id,barcode,JSON.stringify(normalized.barcodes),name,normalized.name_en,normalized.description,normalized.unit,normalized.cost,normalized.sale,normalized.currency,normalized.stock,normalized.low,normalized.image_url,normalized.is_trackable,normalized.status,id,user.market_id,user.branch_id,expectedVersion]
            );"""
new_update="""            const before = await client.query('SELECT stock_quantity FROM products WHERE id=$1 AND market_id=$2 AND branch_id=$3 FOR UPDATE', [id,user.market_id,user.branch_id]);
            if (!before.rows[0]) return { status:404, body:{error:'PRODUCT_NOT_FOUND'} };
            saved = await client.query(
              `UPDATE products SET category_id=$1,barcode=$2,barcodes=$3::jsonb,name=$4,name_en=$5,description=$6,unit=$7,cost_price_iqd=$8,sale_price_iqd=$9,currency=$10,stock_quantity=$11,low_stock_limit=$12,image_url=$13,is_trackable=$14,status=$15,version=version+1,updated_at=now()
                WHERE id=$16 AND market_id=$17 AND branch_id=$18 AND version=$19
                RETURNING *`,
              [normalized.category_id,barcode,JSON.stringify(normalized.barcodes),name,normalized.name_en,normalized.description,normalized.unit,normalized.cost,normalized.sale,normalized.currency,normalized.stock,normalized.low,normalized.image_url,normalized.is_trackable,normalized.status,id,user.market_id,user.branch_id,expectedVersion]
            );
            if (saved.rows[0] && Number(before.rows[0].stock_quantity) !== normalized.stock) {
              await client.query(
                `INSERT INTO stock_movements (id,market_id,branch_id,product_id,movement_type,quantity_delta,stock_before,stock_after,reference_type,reference_id,created_by)
                 VALUES ($1,$2,$3,$4,'adjustment',$5,$6,$7,'product.save',$8,$9)`,
                [createId('stock'),user.market_id,user.branch_id,id,normalized.stock-Number(before.rows[0].stock_quantity),Number(before.rows[0].stock_quantity),normalized.stock,key,user.id]
              );
            }"""
if old_update not in app: raise SystemExit('Product optimistic update block not found')
app=app.replace(old_update,new_update,1)
app_path.write_text(app,encoding='utf-8')

# Idempotency/operation identifiers must fail closed without Web Crypto.
api_path=Path('source/src/services/serverApi.ts')
api=api_path.read_text(encoding='utf-8')
old_op="""const operationId = (prefix:string) => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return `${prefix}-${cryptoApi.randomUUID()}`;
  const bytes = new Uint8Array(16); cryptoApi?.getRandomValues?.(bytes);
  const suffix = bytes.length ? Array.from(bytes).map(v=>v.toString(16).padStart(2,'0')).join('') : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
};"""
new_op="""const operationId = (prefix:string) => {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) throw new ApiError(0,'SECURE_RANDOM_UNAVAILABLE');
  if (cryptoApi.randomUUID) return `${prefix}-${cryptoApi.randomUUID()}`;
  const bytes=new Uint8Array(16); cryptoApi.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes).map(v=>v.toString(16).padStart(2,'0')).join('')}`;
};"""
if old_op not in api: raise SystemExit('operationId fallback block not found')
api_path.write_text(api.replace(old_op,new_op,1),encoding='utf-8')

print('Authoritative frontend edge cases hardened: customer versions, stock movement audit, secure operation IDs.')
