export type ServerRole = 'owner' | 'admin' | 'cashier' | 'stock_staff' | 'accountant';

export interface ServerUser {
  id: string;
  market_id: string;
  branch_id?: string;
  username: string;
  full_name: string;
  role_type: ServerRole;
}

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
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_UNAVAILABLE');
  }

  let payload: any = {};
  try { payload = await response.json(); } catch { /* non-json response */ }
  if (!response.ok) throw new ApiError(response.status, payload?.error || `HTTP_${response.status}`);
  return payload as T;
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
  reserveReceipt: (idempotencyKey: string, businessDate?: string) => apiFetch<{ receipt_number: string; sequence: number; business_date: string }>('/api/v1/receipts/reserve', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(businessDate ? { businessDate } : {}),
  }),
};
