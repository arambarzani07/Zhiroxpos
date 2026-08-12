from pathlib import Path
import re

src=Path('source/src'); server=Path('source/server')

# ---------- Device identity ----------
(src/'services/deviceIdentity.ts').write_text(r'''const DEVICE_KEY='zhirox-device-id-v19';
let memoryDeviceId:string|undefined;

export class DeviceIdentityError extends Error {}

const secureRandomId=()=>{
  const cryptoApi=globalThis.crypto;
  if(!cryptoApi?.getRandomValues)throw new DeviceIdentityError('SECURE_RANDOM_UNAVAILABLE');
  if(cryptoApi.randomUUID)return `device-${cryptoApi.randomUUID()}`;
  const bytes=new Uint8Array(16);cryptoApi.getRandomValues(bytes);
  return `device-${Array.from(bytes).map(v=>v.toString(16).padStart(2,'0')).join('')}`;
};

export const getDeviceId=()=>{
  if(memoryDeviceId)return memoryDeviceId;
  try{
    const existing=localStorage.getItem(DEVICE_KEY);if(existing){memoryDeviceId=existing;return existing;}
    const created=secureRandomId();localStorage.setItem(DEVICE_KEY,created);memoryDeviceId=created;return created;
  }catch(error){if(error instanceof DeviceIdentityError)throw error;throw new DeviceIdentityError('DEVICE_STORAGE_UNAVAILABLE');}
};

export const getDeviceLabel=()=>{
  const platform=typeof navigator!=='undefined'?navigator.platform||'POS':'POS';
  const agent=typeof navigator!=='undefined'?navigator.userAgent.split(' ').slice(0,3).join(' '):'Browser';
  return `${platform} • ${agent}`.slice(0,180);
};
''',encoding='utf-8')

# ---------- Offline IndexedDB queue ----------
(src/'services/offlineQueue.ts').write_text(r'''import type { Cart } from '../types';
import { ApiError, serverApi, type SaleCommitInput, type ServerSaleCommit } from './serverApi';

const DB_NAME='zhirox-offline-v19'; const DB_VERSION=1; const LEASE_KEY='active-lease';
export interface OfflineLeaseGrant{lease_id:string;device_id:string;starts_at:string;expires_at:string;lease_token:string;block:{id:string;business_date:string;receipt_prefix:string;start_sequence:number;end_sequence:number};}
export interface StoredOfflineLease extends OfflineLeaseGrant{next_sequence:number;}
export interface OfflineReceiptProof{lease_id:string;lease_token:string;block_id:string;receipt_number:string;business_date:string;sequence:number;captured_at:string;}
export interface QueuedOfflineSale{idempotencyKey:string;operationId:string;payload:SaleCommitInput;provisionalSaleId:string;cartSnapshot:Cart;userId:string;createdAt:string;lastError?:string;}

const openDb=()=>new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta');if(!db.objectStoreNames.contains('sales'))db.createObjectStore('sales',{keyPath:'idempotencyKey'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const requestValue=<T>(request:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const txDone=(tx:IDBTransaction)=>new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('IDB_ABORT'));});
export const businessDateBaghdad=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Baghdad',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${map.year}-${map.month}-${map.day}`;};

export async function saveOfflineLease(grant:OfflineLeaseGrant){const db=await openDb();const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put({...grant,next_sequence:grant.block.start_sequence} satisfies StoredOfflineLease,LEASE_KEY);await txDone(tx);db.close();}
export async function getOfflineLease():Promise<StoredOfflineLease|null>{const db=await openDb();const tx=db.transaction('meta','readonly');const value=await requestValue(tx.objectStore('meta').get(LEASE_KEY));await txDone(tx);db.close();return (value as StoredOfflineLease)||null;}
export async function clearOfflineLease(){const db=await openDb();const tx=db.transaction('meta','readwrite');tx.objectStore('meta').delete(LEASE_KEY);await txDone(tx);db.close();}
export async function reserveOfflineReceipt():Promise<OfflineReceiptProof>{const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('meta','readwrite');const store=tx.objectStore('meta');const get=store.get(LEASE_KEY);let proof:OfflineReceiptProof|undefined;get.onerror=()=>reject(get.error);get.onsuccess=()=>{const lease=get.result as StoredOfflineLease|undefined;if(!lease){tx.abort();reject(new ApiError(0,'OFFLINE_LEASE_REQUIRED'));return;}const now=new Date();if(now>new Date(lease.expires_at)){tx.abort();reject(new ApiError(0,'OFFLINE_LEASE_EXPIRED'));return;}if(lease.block.business_date!==businessDateBaghdad()){tx.abort();reject(new ApiError(0,'OFFLINE_RECEIPT_DATE_CHANGED'));return;}if(lease.next_sequence>lease.block.end_sequence){tx.abort();reject(new ApiError(0,'OFFLINE_RECEIPT_BLOCK_EXHAUSTED'));return;}const sequence=lease.next_sequence;const receipt_number=`${lease.block.receipt_prefix}-${lease.block.business_date.replaceAll('-','')}-${String(sequence).padStart(6,'0')}`;proof={lease_id:lease.lease_id,lease_token:lease.lease_token,block_id:lease.block.id,receipt_number,business_date:lease.block.business_date,sequence,captured_at:now.toISOString()};store.put({...lease,next_sequence:sequence+1},LEASE_KEY);};tx.oncomplete=()=>{db.close();if(proof)resolve(proof);else reject(new Error('OFFLINE_RECEIPT_NOT_RESERVED'));};tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=()=>db.close();});}
export async function queueOfflineSale(record:QueuedOfflineSale){const db=await openDb();const tx=db.transaction('sales','readwrite');tx.objectStore('sales').put(record);await txDone(tx);db.close();}
export async function pendingOfflineSales():Promise<QueuedOfflineSale[]>{const db=await openDb();const tx=db.transaction('sales','readonly');const rows=await requestValue(tx.objectStore('sales').getAll()) as QueuedOfflineSale[];await txDone(tx);db.close();return rows.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));}
export async function pendingOfflineCount(){return (await pendingOfflineSales()).length;}
async function deleteQueued(key:string){const db=await openDb();const tx=db.transaction('sales','readwrite');tx.objectStore('sales').delete(key);await txDone(tx);db.close();}
async function markQueuedError(record:QueuedOfflineSale,error:string){await queueOfflineSale({...record,lastError:error});}

export async function flushOfflineQueue(){const rows=await pendingOfflineSales();let synced=0;for(const record of rows){try{const response=await serverApi.commitSale(record.payload,record.idempotencyKey);const {useDataStore}=await import('../stores/dataStore');useDataStore.getState().reconcileOfflineSale(record.provisionalSaleId,response,record.userId,record.cartSnapshot);await deleteQueued(record.idempotencyKey);synced+=1;}catch(error){const code=error instanceof ApiError?error.code:'UNKNOWN_ERROR';await markQueuedError(record,code);if(code==='NETWORK_UNAVAILABLE'||code==='AUTH_REQUIRED'||(error instanceof ApiError&&error.status===401))break;}}
return {synced,pending:(await pendingOfflineSales()).length};}

export function provisionalResponseFromCart(cart:Cart,receipt:OfflineReceiptProof,operationId:string):ServerSaleCommit{
  const debt=cart.debt_amount;const currentBalance=cart.customer_id?null:null;
  return {sale_id:`offline-${operationId}`,receipt_number:receipt.receipt_number,payment_method:cart.payment_type,paid_method:cart.paid_amount>0?'cash':null,customer_id:cart.customer_id||null,subtotal_iqd:cart.subtotal,discount_iqd:cart.discount_amount,total_iqd:cart.total_amount,paid_iqd:cart.paid_amount,debt_iqd:debt,customer_balance_iqd:currentBalance,items:cart.items.map(item=>({product_id:item.product.id,product_name:item.product.name,barcode:item.product.barcode,quantity:item.quantity,unit_price_iqd:item.unit_price,unit_cost_iqd:item.product.cost_price,line_total_iqd:item.total_price,stock_after:item.product.stock_quantity-item.quantity}))};
}
''',encoding='utf-8')

# ---------- Server API: device header, lease and offline proof ----------
api_path=src/'services/serverApi.ts'; api=api_path.read_text(encoding='utf-8')
api=api.replace("export type ServerRole", "import { DeviceIdentityError, getDeviceId, getDeviceLabel } from './deviceIdentity';\n\nexport type ServerRole",1)
# Add device header inside fetch try
old_fetch="""    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        accept: 'application/json',"""
new_fetch="""    const deviceId=getDeviceId();
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'x-device-id': deviceId,"""
if old_fetch not in api: raise SystemExit('apiFetch marker missing')
api=api.replace(old_fetch,new_fetch,1)
old_catch="""  } catch {
    throw new ApiError(0, 'NETWORK_UNAVAILABLE');
  }"""
new_catch="""  } catch (error) {
    if(error instanceof DeviceIdentityError)throw new ApiError(0,error.message);
    throw new ApiError(0, 'NETWORK_UNAVAILABLE');
  }"""
if old_catch not in api: raise SystemExit('apiFetch catch missing')
api=api.replace(old_catch,new_catch,1)
# Define SaleCommitInput and offline grant before ServerSaleCommit
marker="export interface ServerSaleCommit {"
type_block=r'''export interface OfflineReceiptProof {lease_id:string;lease_token:string;block_id:string;receipt_number:string;business_date:string;sequence:number;captured_at:string;}
export interface SaleCommitInput {client_operation_id:string;customer_id?:string;payment_method:'cash'|'card'|'bank'|'debt'|'mixed';paid_method?:'cash'|'card'|'bank';paid_iqd:number;discount_iqd:number;items:Array<{product_id:string;quantity:number}>;offline_receipt?:OfflineReceiptProof;}
export interface OfflineLeaseGrant {lease_id:string;device_id:string;starts_at:string;expires_at:string;lease_token:string;block:{id:string;business_date:string;receipt_prefix:string;start_sequence:number;end_sequence:number};}
'''+marker
if marker not in api: raise SystemExit('ServerSaleCommit marker missing')
api=api.replace(marker,type_block,1)
old_commit="""  commitSale: (input:{client_operation_id:string;customer_id?:string;payment_method:'cash'|'card'|'bank'|'debt'|'mixed';paid_method?:'cash'|'card'|'bank';paid_iqd:number;discount_iqd:number;items:Array<{product_id:string;quantity:number}>}, idempotencyKey:string) =>
    apiFetch<ServerSaleCommit>('/api/v1/sales/commit',{method:'POST',headers:{'idempotency-key':idempotencyKey},body:JSON.stringify(input)}),"""
new_commit="""  registerDevice: () => apiFetch<{device_id:string;market_id:string;branch_id:string}>('/api/v1/devices/register',{method:'POST',body:JSON.stringify({device_id:getDeviceId(),label:getDeviceLabel()})}),
  acquireOfflineLease: (durationMinutes=30,blockSize=100) => {const key=operationId('lease-acquire');return apiFetch<OfflineLeaseGrant>('/api/v1/offline/lease/acquire',{method:'POST',headers:{'idempotency-key':key},body:JSON.stringify({duration_minutes:durationMinutes,block_size:blockSize})});},
  releaseOfflineLease: (leaseId:string,leaseToken:string) => apiFetch<{ok:true}>('/api/v1/offline/lease/release',{method:'POST',body:JSON.stringify({lease_id:leaseId,lease_token:leaseToken})}),
  commitSale: (input:SaleCommitInput, idempotencyKey:string) =>
    apiFetch<ServerSaleCommit>('/api/v1/sales/commit',{method:'POST',headers:{'idempotency-key':idempotencyKey},body:JSON.stringify(input)}),"""
if old_commit not in api: raise SystemExit('commitSale signature marker missing')
api=api.replace(old_commit,new_commit,1)
api_path.write_text(api,encoding='utf-8')

# ---------- Auth: register device and flush queue after hydration ----------
auth_path=src/'stores/authStore.ts'; auth=auth_path.read_text(encoding='utf-8')
old="""  useDataStore.getState().setTenantContext(context.market.id, context.branch.id);
  try {
    const [products,customers]=await Promise.all([serverApi.loadProducts(),serverApi.loadCustomers()]);"""
new="""  useDataStore.getState().setTenantContext(context.market.id, context.branch.id);
  await serverApi.registerDevice();
  try {
    const [products,customers]=await Promise.all([serverApi.loadProducts(),serverApi.loadCustomers()]);"""
if old not in auth: raise SystemExit('auth bind registration marker missing')
auth=auth.replace(old,new,1)
old_end="""  } catch (error) {
    console.warn('Authoritative catalog hydration failed; keeping last local cache', error);
  }
}"""
new_end="""  } catch (error) {
    console.warn('Authoritative catalog hydration failed; keeping last local cache', error);
  }
  try { const {flushOfflineQueue}=await import('../services/offlineQueue'); await flushOfflineQueue(); } catch(error) { console.warn('Offline queue sync deferred',error); }
}"""
if old_end not in auth: raise SystemExit('auth bind end marker missing')
auth=auth.replace(old_end,new_end,1)
auth_path.write_text(auth,encoding='utf-8')

# ---------- dataStore reconciliation ----------
store_path=src/'stores/dataStore.ts'; store=store_path.read_text(encoding='utf-8')
iface="  applyAuthoritativeSale: (response: ServerSaleCommit, userId: string, cartSnapshot: Cart) => Sale;"
if iface not in store: raise SystemExit('apply authoritative interface marker missing')
store=store.replace(iface,iface+"\n  reconcileOfflineSale: (provisionalSaleId: string, response: ServerSaleCommit, userId: string, cartSnapshot: Cart) => Sale;",1)
impl_end="""        return sale;
      },
      receiptCounter: 1000,"""
if impl_end not in store: raise SystemExit('apply authoritative implementation end missing')
reconcile="""        return sale;
      },
      reconcileOfflineSale: (provisionalSaleId,response,userId,cartSnapshot) => {
        set(state=>({sales:state.sales.filter(s=>s.id!==provisionalSaleId),saleItems:state.saleItems.filter(i=>i.sale_id!==provisionalSaleId),payments:state.payments.filter(p=>p.reference_id!==provisionalSaleId),debtTransactions:state.debtTransactions.filter(d=>d.reference_id!==provisionalSaleId),stockMovements:state.stockMovements.filter(m=>m.reference_id!==provisionalSaleId)}));
        return get().applyAuthoritativeSale(response,userId,cartSnapshot);
      },
      receiptCounter: 1000,"""
store=store.replace(impl_end,reconcile,1)
store_path.write_text(store,encoding='utf-8')

# ---------- Server: preserve original offline actor ----------
app_path=server/'src/app.mjs'; app=app_path.read_text(encoding='utf-8')
old_query="SELECT id,device_id,starts_at,expires_at,revoked_at FROM offline_leases WHERE id=$1 AND market_id=$2 AND branch_id=$3"
new_query="SELECT id,device_id,starts_at,expires_at,revoked_at,created_by FROM offline_leases WHERE id=$1 AND market_id=$2 AND branch_id=$3"
if old_query not in app: raise SystemExit('offline lease validation query missing')
app=app.replace(old_query,new_query,1)
old_return="  return {receiptNumber};\n}"
new_return="  return {receiptNumber,capturedByUserId:lease.created_by};\n}"
if old_return not in app: raise SystemExit('offline validation return missing')
app=app.replace(old_return,new_return,1)
old_receipt="""          let receiptNumber;
          if(offlineReceipt){const verified=await validateOfflineReceipt(client,user,device.id,offlineReceipt,config.offlineLeaseSecret);if(verified.error)return {status:409,body:{error:verified.error}};receiptNumber=verified.receiptNumber;}else{receiptNumber=(await nextReceipt(client,user,date)).receiptNumber;}"""
new_receipt="""          let receiptNumber; let saleActorId=user.id;
          if(offlineReceipt){const verified=await validateOfflineReceipt(client,user,device.id,offlineReceipt,config.offlineLeaseSecret);if(verified.error)return {status:409,body:{error:verified.error}};receiptNumber=verified.receiptNumber;saleActorId=verified.capturedByUserId;}else{receiptNumber=(await nextReceipt(client,user,date)).receiptNumber;}"""
if old_receipt not in app: raise SystemExit('offline receipt actor marker missing')
app=app.replace(old_receipt,new_receipt,1)
# Change sale/payment/stock/journal attribution inside sale route only by targeted strings.
app=app.replace("[saleId, user.market_id, user.branch_id, receiptNumber, user.id, body.customer_id || null,", "[saleId, user.market_id, user.branch_id, receiptNumber, saleActorId, body.customer_id || null,",1)
app=app.replace("[createId('stock'), user.market_id, user.branch_id, line.product.id, -line.quantity, line.stockBefore, line.stockAfter, saleId, user.id]", "[createId('stock'), user.market_id, user.branch_id, line.product.id, -line.quantity, line.stockBefore, line.stockAfter, saleId, saleActorId]",1)
app=app.replace("[createId('payment'), user.market_id, user.branch_id, saleId, body.customer_id || null, paidMethod, paidIqd, user.id]", "[createId('payment'), user.market_id, user.branch_id, saleId, body.customer_id || null, paidMethod, paidIqd, saleActorId]",1)
app=app.replace("[batchId, user.market_id, user.branch_id, saleId, `Sale ${receiptNumber}`, user.id]", "[batchId, user.market_id, user.branch_id, saleId, `Sale ${receiptNumber}`, saleActorId]",1)
app_path.write_text(app,encoding='utf-8')

# ---------- POS offline controls/capture/sync ----------
pos_path=src/'pages/POS.tsx'; pos=pos_path.read_text(encoding='utf-8')
pos=pos.replace("  RotateCcw,", "  RotateCcw,\n  Wifi,\n  WifiOff,",1)
pos=pos.replace("import { ApiError, serverApi } from '../services/serverApi';", "import { ApiError, serverApi } from '../services/serverApi';\nimport { clearOfflineLease, flushOfflineQueue, getOfflineLease, pendingOfflineCount, provisionalResponseFromCart, queueOfflineSale, reserveOfflineReceipt, saveOfflineLease, type StoredOfflineLease } from '../services/offlineQueue';",1)
pos=pos.replace("  const pendingOperationRef = useRef<{key:string;operationId:string}|null>(null);", "  const pendingOperationRef = useRef<{key:string;operationId:string}|null>(null);\n  const [offlineLease,setOfflineLease]=useState<StoredOfflineLease|null>(null);\n  const [offlinePending,setOfflinePending]=useState(0);\n  const [offlineBusy,setOfflineBusy]=useState(false);",1)
# Add offline state effect after focus effect
focus="""  useEffect(() => {
    if (window.innerWidth >= 1024) barcodeInputRef.current?.focus();
  }, []);"""
offline_effect=focus+r'''

  const refreshOfflineState=async()=>{setOfflineLease(await getOfflineLease());setOfflinePending(await pendingOfflineCount());};
  useEffect(()=>{void refreshOfflineState();const onOnline=()=>{void (async()=>{try{const result=await flushOfflineQueue();if(result.synced>0)toast.success(`${result.synced} مامەڵەی ئۆفلاین هاوکات کرا`);}finally{await refreshOfflineState();}})();};window.addEventListener('online',onOnline);return()=>window.removeEventListener('online',onOnline);},[]);

  const acquireOfflineMode=async()=>{if(!navigator.onLine){toast.error('بۆ وەرگرتنی مۆڵەتی ئۆفلاین پێویستە ئینتەرنێت هەبێت');return;}setOfflineBusy(true);try{const grant=await serverApi.acquireOfflineLease(30,100);await saveOfflineLease(grant);await refreshOfflineState();toast.success('ئەم ئامێرە بۆ ٣٠ خولەک offline-writer ـە');}catch(error){const code=error instanceof ApiError?error.code:'UNKNOWN_ERROR';toast.error(code==='OFFLINE_LEASE_ALREADY_ACTIVE'?'ئامێرێکی تر مۆڵەتی ئۆفلاینی هەیە':code);}finally{setOfflineBusy(false);}};
  const releaseOfflineMode=async()=>{if(!offlineLease)return;if(offlinePending>0){toast.error('سەرەتا مامەڵە ئۆفلاینەکان هاوکات بکە');return;}setOfflineBusy(true);try{await serverApi.releaseOfflineLease(offlineLease.lease_id,offlineLease.lease_token);await clearOfflineLease();await refreshOfflineState();toast.success('مۆڵەتی ئۆفلاین داخرا');}catch(error){toast.error(error instanceof ApiError?error.code:'UNKNOWN_ERROR');}finally{setOfflineBusy(false);}};
'''
if focus not in pos: raise SystemExit('POS focus effect marker missing')
pos=pos.replace(focus,offline_effect,1)

# Replace catch in complete sale with offline capture path.
old_catch=r'''    } catch(error) {
      const code=error instanceof ApiError?error.code:'UNKNOWN_ERROR';
      const messages:Record<string,string>={NETWORK_UNAVAILABLE:'پەیوەندی بە سێرڤەر نییە؛ مامەڵە تۆمار نەکرا',STOCK_INSUFFICIENT:'کۆگا بەس نییە',PRODUCT_UNAVAILABLE:'کالا لە سێرڤەر بەردەست نییە',CREDIT_LIMIT_EXCEEDED:'سنووری قەرزی کڕیار تێدەپەڕێت',CUSTOMER_REQUIRED_FOR_DEBT:'بۆ قەرز کڕیار دیاری بکە',DISCOUNT_REQUIRES_APPROVAL:'داشکاندن پێویستی بە پەسەندی بەڕێوەبەر هەیە',VERSION_CONFLICT:'داتا لە ئامێرێکی تر گۆڕاوە'};
      toast.error(messages[code]||code);
    } finally { setIsCompleting(false); }'''
new_catch=r'''    } catch(error) {
      const code=error instanceof ApiError?error.code:'UNKNOWN_ERROR';
      if(code==='NETWORK_UNAVAILABLE'){
        try{
          if(!offlineLease)throw new ApiError(0,'OFFLINE_LEASE_REQUIRED');
          if(cart.discount_amount>0&&!['owner','admin'].includes(user.role?.type||''))throw new ApiError(0,'DISCOUNT_REQUIRES_APPROVAL');
          for(const item of cart.items){if(item.product.is_trackable&&item.quantity>item.product.stock_quantity)throw new ApiError(0,'STOCK_INSUFFICIENT');}
          if(cart.debt_amount>0){if(!cart.customer_id)throw new ApiError(0,'CUSTOMER_REQUIRED_FOR_DEBT');const customer=customers.find(c=>c.id===cart.customer_id);const balance=getCustomerBalance(cart.customer_id)?.balance_iqd||0;if(customer?.debt_limit!==undefined&&balance+cart.debt_amount>customer.debt_limit)throw new ApiError(0,'CREDIT_LIMIT_EXCEEDED');}
          const receipt=await reserveOfflineReceipt();const payload={client_operation_id:pending.operationId,customer_id:cart.customer_id,payment_method:cart.payment_type,paid_method:'cash' as const,paid_iqd:cart.paid_amount,discount_iqd:cart.discount_amount,items:cart.items.map(item=>({product_id:item.product.id,quantity:item.quantity})),offline_receipt:receipt};const provisional=provisionalResponseFromCart(cartSnapshot,receipt,pending.operationId);if(cart.customer_id)provisional.customer_balance_iqd=(getCustomerBalance(cart.customer_id)?.balance_iqd||0)+cart.debt_amount;const sale=applyAuthoritativeSale(provisional,user.id,cartSnapshot);await queueOfflineSale({idempotencyKey:pending.key,operationId:pending.operationId,payload,provisionalSaleId:sale.id,cartSnapshot,userId:user.id,createdAt:new Date().toISOString()});pendingOperationRef.current=null;setCompletedSale(sale);setCompletedItems(savedItems);setShowReceiptModal(true);setShowMobileCart(false);setDiscountValue(0);playSaleSound();await refreshOfflineState();toast.success('مامەڵە بە ئۆفلاین تۆمار کرا؛ دوای ئینتەرنێت هاوکات دەبێت');
        }catch(offlineError){const offlineCode=offlineError instanceof ApiError?offlineError.code:'UNKNOWN_ERROR';const offlineMessages:Record<string,string>={OFFLINE_LEASE_REQUIRED:'ئەم ئامێرە مۆڵەتی offline-writer نییە',OFFLINE_LEASE_EXPIRED:'مۆڵەتی ئۆفلاین کۆتایی هاتووە',OFFLINE_RECEIPT_DATE_CHANGED:'ڕۆژی کار گۆڕاوە؛ بۆ block ـی نوێ پێویستە ئینتەرنێت بگەڕێتەوە',OFFLINE_RECEIPT_BLOCK_EXHAUSTED:'ژمارە پسوڵە ئۆفلاینەکان تەواو بوون',STOCK_INSUFFICIENT:'کۆگا بەس نییە',CREDIT_LIMIT_EXCEEDED:'سنووری قەرزی کڕیار تێدەپەڕێت',CUSTOMER_REQUIRED_FOR_DEBT:'بۆ قەرز کڕیار دیاری بکە',DISCOUNT_REQUIRES_APPROVAL:'داشکاندن پێویستی بە پەسەندی بەڕێوەبەر هەیە'};toast.error(offlineMessages[offlineCode]||offlineCode);}
      }else{const messages:Record<string,string>={BRANCH_OFFLINE_LEASE_ACTIVE:'لقەکە لە دۆخی ئۆفلاینە؛ تەنها ئامێری مۆڵەتپێدراو دەتوانێت بنووسێت',DEVICE_NOT_REGISTERED:'ئەم ئامێرە لە سێرڤەر تۆمار نەکراوە',STOCK_INSUFFICIENT:'کۆگا بەس نییە',PRODUCT_UNAVAILABLE:'کالا لە سێرڤەر بەردەست نییە',CREDIT_LIMIT_EXCEEDED:'سنووری قەرزی کڕیار تێدەپەڕێت',CUSTOMER_REQUIRED_FOR_DEBT:'بۆ قەرز کڕیار دیاری بکە',DISCOUNT_REQUIRES_APPROVAL:'داشکاندن پێویستی بە پەسەندی بەڕێوەبەر هەیە'};toast.error(messages[code]||code);}
    } finally { setIsCompleting(false); }'''
if old_catch not in pos: raise SystemExit('POS sale catch block missing')
pos=pos.replace(old_catch,new_catch,1)

# Add offline controls next to CashSessionBar.
tool="          <CashSessionBar />"
controls=tool+r'''
          <div className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 ${offlineLease?'bg-amber-100 text-amber-800':'bg-slate-100 text-slate-600'}`}>
            {navigator.onLine?<Wifi className="w-4 h-4"/>:<WifiOff className="w-4 h-4"/>}
            <span>{offlineLease?`Offline writer • ${offlinePending} pending`:'Online authority'}</span>
          </div>
          {!offlineLease?<button disabled={offlineBusy||!navigator.onLine} onClick={()=>void acquireOfflineMode()} className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-xl text-xs font-medium disabled:opacity-50">مۆڵەتی ئۆفلاین</button>:<button disabled={offlineBusy||offlinePending>0||!navigator.onLine} onClick={()=>void releaseOfflineMode()} className="px-3 py-2 bg-amber-100 text-amber-800 rounded-xl text-xs font-medium disabled:opacity-50">داخستنی ئۆفلاین</button>}
'''
if tool not in pos: raise SystemExit('CashSessionBar marker missing')
pos=pos.replace(tool,controls,1)
pos_path.write_text(pos,encoding='utf-8')

# ---------- Test attribution of offline actor ----------
test_path=server/'test/server.test.mjs';test=test_path.read_text(encoding='utf-8')
marker="""  const offline=await request('/api/v1/sales/commit',{method:'POST',headers:{'idempotency-key':'offline-sale-key-1'},body:offlineBody}); assert.equal(offline.response.status,201); assert.equal(offline.json.receipt_number,receipt);"""
replacement=marker+"\n  const attribution=await pool.query('SELECT cashier_id FROM sales WHERE id=$1',[offline.json.sale_id]); const leaseActor=await pool.query('SELECT created_by FROM offline_leases WHERE id=$1',[acquired.json.lease_id]); assert.equal(attribution.rows[0].cashier_id,leaseActor.rows[0].created_by);"
if marker not in test: raise SystemExit('offline attribution test marker missing')
test=test.replace(marker,replacement,1)
test_path.write_text(test,encoding='utf-8')

print('IndexedDB offline queue, device registration, lease controls and original-cashier attribution wired.')
