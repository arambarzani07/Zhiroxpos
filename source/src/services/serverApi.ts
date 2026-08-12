import { DeviceIdentityError, getDeviceId, getDeviceLabel } from './deviceIdentity';

export type ServerRole = 'owner' | 'admin' | 'cashier' | 'stock_staff' | 'accountant';

export interface ServerUser {
  id: string;
  market_id: string;
  branch_id?: string;
  username: string;
  full_name: string;
  role_type: ServerRole;
}

export interface ManagedServerUser {id:string;market_id:string;branch_id?:string;username:string;full_name:string;role_type:ServerRole;status:'active'|'inactive'|'blocked';last_login_at?:string|null;version:number;created_at:string;updated_at:string;}
export interface ServerMarket {
  id: string;
  name: string;
  currency: 'IQD' | 'USD';
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface ServerBranch {
  id: string;
  market_id: string;
  name: string;
  is_main: boolean;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface ServerContext {
  user: ServerUser;
  market: ServerMarket;
  branch: ServerBranch | null;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const API_BASE = String(viteEnv?.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    const deviceId=getDeviceId();
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'x-device-id': deviceId,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
  } catch (error) {
    if(error instanceof DeviceIdentityError)throw new ApiError(0,error.message);
    throw new ApiError(0, 'NETWORK_UNAVAILABLE');
  }

  let payload: any = {};
  try { payload = await response.json(); } catch { /* non-json response */ }
  if (!response.ok) throw new ApiError(response.status, payload?.error || `HTTP_${response.status}`);
  return payload as T;
}


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
export interface OfflineReceiptProof {lease_id:string;lease_token:string;block_id:string;receipt_number:string;business_date:string;sequence:number;captured_at:string;}
export interface SaleCommitInput {client_operation_id:string;customer_id?:string;payment_method:'cash'|'card'|'bank'|'debt'|'mixed';paid_method?:'cash'|'card'|'bank';paid_iqd:number;discount_iqd:number;items:Array<{product_id:string;quantity:number}>;offline_receipt?:OfflineReceiptProof;}
export interface OfflineLeaseGrant {lease_id:string;device_id:string;starts_at:string;expires_at:string;lease_token:string;block:{id:string;business_date:string;receipt_prefix:string;start_sequence:number;end_sequence:number};}
export interface ServerSaleCommit {
  sale_id:string; receipt_number:string; payment_method:'cash'|'card'|'bank'|'debt'|'mixed'; paid_method:'cash'|'card'|'bank'|null;
  customer_id:string|null; subtotal_iqd:number; discount_iqd:number; total_iqd:number; paid_iqd:number; debt_iqd:number;
  customer_balance_iqd:number|null; items:Array<{product_id:string;product_name:string;barcode:string;quantity:number;unit_price_iqd:number;unit_cost_iqd:number;line_total_iqd:number;stock_after:number}>;
}
const operationId = (prefix:string) => {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) throw new ApiError(0,'SECURE_RANDOM_UNAVAILABLE');
  if (cryptoApi.randomUUID) return `${prefix}-${cryptoApi.randomUUID()}`;
  const bytes=new Uint8Array(16); cryptoApi.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes).map(v=>v.toString(16).padStart(2,'0')).join('')}`;
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

export const serverApi = {
  bootstrapStatus: () => apiFetch<{ needs_bootstrap: boolean }>('/api/v1/bootstrap/status'),
  session: () => apiFetch<ServerContext>('/api/v1/session'),
  login: (username: string, password: string) => apiFetch<ServerContext>('/api/v1/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }),
  bootstrap: (input: { marketName: string; fullName: string; username: string; password: string; setupToken: string; branchName?: string; receiptPrefix?: string }) =>
    apiFetch<ServerContext>('/api/v1/bootstrap', {
      method: 'POST',
      headers: { 'x-bootstrap-token': input.setupToken },
      body: JSON.stringify({
        marketName: input.marketName,
        fullName: input.fullName,
        username: input.username,
        password: input.password,
        branchName: input.branchName || 'لقی سەرەکی',
        receiptPrefix: input.receiptPrefix || 'MAIN',
      }),
    }),
  logout: () => apiFetch<{ ok: true }>('/api/v1/logout', { method: 'POST' }),
  loadProducts: () => loadPages<ServerProduct>('/api/v1/catalog/products'),
  loadCustomers: () => loadPages<ServerCustomer>('/api/v1/customers'),
  saveProduct: (input: Partial<ServerProduct> & { barcode:string; name:string; cost_price_iqd:number; sale_price_iqd:number; stock_quantity:number; low_stock_limit:number }) => {
    const key=operationId('product-save');
    return apiFetch<{product:ServerProduct}>('/api/v1/catalog/products/save',{method:'POST',headers:{'idempotency-key':key},body:JSON.stringify(input)});
  },
  saveCustomer: (input: Partial<ServerCustomer> & { code:string; name:string }) => {
    const key=operationId('customer-save');
    return apiFetch<{customer:ServerCustomer}>('/api/v1/customers/save',{method:'POST',headers:{'idempotency-key':key},body:JSON.stringify(input)});
  },
  loadUsers: () => apiFetch<{items:ManagedServerUser[]}>('/api/v1/users'),
  saveUser: (input:Partial<ManagedServerUser>&{username:string;full_name:string;role_type:ServerRole;branch_id:string;password?:string}) => apiFetch<{user:ManagedServerUser}>('/api/v1/users/save',{method:'POST',body:JSON.stringify(input)}),
  resetUserPassword: (userId:string,newPassword:string) => apiFetch<{ok:true}>('/api/v1/users/reset-password',{method:'POST',body:JSON.stringify({user_id:userId,new_password:newPassword})}),
  revokeUserSessions: (userId:string) => apiFetch<{ok:true;revoked:number}>('/api/v1/users/revoke-sessions',{method:'POST',body:JSON.stringify({user_id:userId})}),
  registerDevice: () => apiFetch<{device_id:string;market_id:string;branch_id:string}>('/api/v1/devices/register',{method:'POST',body:JSON.stringify({device_id:getDeviceId(),label:getDeviceLabel()})}),
  acquireOfflineLease: (durationMinutes=30,blockSize=100) => {const key=operationId('lease-acquire');return apiFetch<OfflineLeaseGrant>('/api/v1/offline/lease/acquire',{method:'POST',headers:{'idempotency-key':key},body:JSON.stringify({duration_minutes:durationMinutes,block_size:blockSize})});},
  releaseOfflineLease: (leaseId:string,leaseToken:string) => apiFetch<{ok:true}>('/api/v1/offline/lease/release',{method:'POST',body:JSON.stringify({lease_id:leaseId,lease_token:leaseToken})}),
  commitSale: (input:SaleCommitInput, idempotencyKey:string) =>
    apiFetch<ServerSaleCommit>('/api/v1/sales/commit',{method:'POST',headers:{'idempotency-key':idempotencyKey},body:JSON.stringify(input)}),
  createOperationId: operationId,
  reserveReceipt: (idempotencyKey: string, businessDate?: string) => apiFetch<{ receipt_number: string; sequence: number; business_date: string }>('/api/v1/receipts/reserve', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(businessDate ? { businessDate } : {}),
  }),
};
