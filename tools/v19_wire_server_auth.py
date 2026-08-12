from pathlib import Path
import re

src = Path('source/src')
server_app = Path('source/server/src/app.mjs')

api_service = r'''export type ServerRole = 'owner' | 'admin' | 'cashier' | 'stock_staff' | 'accountant';

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

const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

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
'''
(src / 'services').mkdir(exist_ok=True)
(src / 'services/serverApi.ts').write_text(api_service, encoding='utf-8')

auth_store = r'''import { create } from 'zustand';
import type { User, Market, Branch, ApiResponse, Role, RoleType } from '../types';
import { ROLE_PERMISSIONS } from '../constants/permissions';
import { ApiError, serverApi, type ServerContext, type ServerRole } from '../services/serverApi';

interface BootstrapOwnerInput {
  marketName: string;
  fullName: string;
  username: string;
  password: string;
  setupToken: string;
}

interface AuthState {
  user: User | null;
  market: Market | null;
  branch: Branch | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  needsBootstrap: boolean;
  permissions: string[];
  initialize: () => Promise<void>;
  bootstrapOwner: (input: BootstrapOwnerInput) => Promise<ApiResponse<User>>;
  login: (username: string, password: string) => Promise<ApiResponse<User>>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
}

const roleLabel: Record<ServerRole, string> = {
  owner: 'خاوەن', admin: 'بەڕێوەبەر', cashier: 'کاشێر', stock_staff: 'بەرپرسی کۆگا', accountant: 'ژمێریار',
};

const errorMessage = (error: unknown) => {
  if (!(error instanceof ApiError)) return 'هەڵەیەکی نەناسراو ڕوویدا';
  const messages: Record<string, string> = {
    NETWORK_UNAVAILABLE: 'پەیوەندی بە سێرڤەر نییە',
    AUTH_INVALID_LOGIN: 'ناوی بەکارهێنەر یان وشەی نهێنی هەڵەیە',
    AUTH_TEMPORARILY_BLOCKED: 'هەوڵی زۆر دراوە؛ کەمێک دواتر هەوڵ بدەرەوە',
    BOOTSTRAP_FORBIDDEN: 'Setup token نادروستە',
    BOOTSTRAP_ALREADY_COMPLETED: 'ڕێکخستنی یەکەم جار پێشتر تەواو بووە',
    VALIDATION_ERROR: 'زانیارییەکان تەواو و دروست بنووسە',
    INVALID_RECEIPT_PREFIX: 'پێشگری پسوڵە نادروستە',
  };
  return messages[error.code] || error.code;
};

const toLocalContext = (context: ServerContext) => {
  const now = new Date().toISOString();
  const type = context.user.role_type as RoleType;
  const role: Role = {
    id: `role-${type}`,
    market_id: context.user.market_id,
    name: roleLabel[context.user.role_type],
    type,
    is_system: true,
    created_at: now,
  };
  const permissions = ROLE_PERMISSIONS[type] || [];
  const user: User = {
    id: context.user.id,
    market_id: context.user.market_id,
    branch_id: context.user.branch_id,
    username: context.user.username,
    full_name: context.user.full_name,
    role_id: role.id,
    role,
    permissions,
    status: 'active',
    created_at: now,
    updated_at: now,
  };
  const market: Market = {
    id: context.market.id,
    name: context.market.name,
    phone: '',
    address: '',
    currency: context.market.currency,
    status: context.market.status,
    created_at: context.market.created_at,
    updated_at: context.market.updated_at,
  };
  const branch: Branch | null = context.branch ? {
    id: context.branch.id,
    market_id: context.branch.market_id,
    name: context.branch.name,
    is_main: context.branch.is_main,
    status: context.branch.status,
    created_at: context.branch.created_at,
    updated_at: context.branch.updated_at,
  } : null;
  return { user, market, branch, permissions };
};

async function bindTenant(context: ReturnType<typeof toLocalContext> | null) {
  const { useDataStore } = await import('./dataStore');
  if (!context?.branch) {
    useDataStore.getState().clearTenantContext();
    return;
  }
  useDataStore.getState().setTenantContext(context.market.id, context.branch.id);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  market: null,
  branch: null,
  isAuthenticated: false,
  isInitialized: false,
  needsBootstrap: false,
  permissions: [],

  initialize: async () => {
    if (get().isInitialized) return;
    try {
      const serverContext = await serverApi.session();
      const context = toLocalContext(serverContext);
      await bindTenant(context);
      set({ ...context, isAuthenticated: true, isInitialized: true, needsBootstrap: false });
      return;
    } catch (error) {
      if (error instanceof ApiError && error.status !== 401 && error.status !== 0) {
        console.error('session initialization failed', error);
      }
    }

    await bindTenant(null);
    let needsBootstrap = false;
    try {
      needsBootstrap = (await serverApi.bootstrapStatus()).needs_bootstrap;
    } catch {
      // Login remains available so transient status failure does not falsely bootstrap a new system.
    }
    set({ user: null, market: null, branch: null, permissions: [], isAuthenticated: false, isInitialized: true, needsBootstrap });
  },

  bootstrapOwner: async input => {
    try {
      const serverContext = await serverApi.bootstrap(input);
      const context = toLocalContext(serverContext);
      if (!context.branch) return { success: false, error_code: 'VALIDATION_ERROR', message: 'لقی سەرەکی دروست نەبوو' };
      await bindTenant(context);
      set({ ...context, isAuthenticated: true, isInitialized: true, needsBootstrap: false });
      return { success: true, data: context.user, message: 'هەژماری خاوەن دروست کرا' };
    } catch (error) {
      return { success: false, error_code: 'AUTH_INVALID_LOGIN', message: errorMessage(error) };
    }
  },

  login: async (username, password) => {
    try {
      const serverContext = await serverApi.login(username, password);
      const context = toLocalContext(serverContext);
      if (!context.branch) return { success: false, error_code: 'AUTH_INVALID_LOGIN', message: 'لق بۆ ئەم بەکارهێنەرە دیاری نەکراوە' };
      await bindTenant(context);
      set({ ...context, isAuthenticated: true, isInitialized: true, needsBootstrap: false });
      return { success: true, data: context.user, message: 'بەخێربێیت!' };
    } catch (error) {
      return { success: false, error_code: 'AUTH_INVALID_LOGIN', message: errorMessage(error) };
    }
  },

  logout: async () => {
    try { await serverApi.logout(); } catch { /* local session is still cleared */ }
    await bindTenant(null);
    set({ user: null, market: null, branch: null, isAuthenticated: false, permissions: [], needsBootstrap: false, isInitialized: true });
  },

  hasPermission: permission => get().permissions.includes(permission),
  hasAnyPermission: permissions => permissions.some(permission => get().permissions.includes(permission)),
  hasAllPermissions: permissions => permissions.every(permission => get().permissions.includes(permission)),
}));
'''
(src / 'stores/authStore.ts').write_text(auth_store, encoding='utf-8')

# Update App to initialize HttpOnly server session before route decisions.
app_path = src / 'App.tsx'
app = app_path.read_text(encoding='utf-8')
app = app.replace("import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';", "import { useEffect } from 'react';\nimport { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';", 1)
app = app.replace(
    "  const { isAuthenticated } = useAuthStore();\n\n  if (!isAuthenticated) {",
    "  const { isAuthenticated, isInitialized } = useAuthStore();\n\n  if (!isInitialized) return <div className=\"min-h-screen bg-slate-950 text-white flex items-center justify-center\">پەیوەندی بە سێرڤەر...</div>;\n\n  if (!isAuthenticated) {",
    1,
)
# Replace second occurrence for PublicRoute.
app = app.replace(
    "  const { isAuthenticated } = useAuthStore();\n\n  if (isAuthenticated) {",
    "  const { isAuthenticated, isInitialized } = useAuthStore();\n\n  if (!isInitialized) return <div className=\"min-h-screen bg-slate-950 text-white flex items-center justify-center\">پەیوەندی بە سێرڤەر...</div>;\n\n  if (isAuthenticated) {",
    1,
)
app = app.replace(
    "function App() {\n  return (",
    "function App() {\n  const initialize = useAuthStore(state => state.initialize);\n  useEffect(() => { void initialize(); }, [initialize]);\n\n  return (",
    1,
)
app_path.write_text(app, encoding='utf-8')

# Login: server bootstrap status replaces browser credential counting and asks for one-time setup token.
login_path = src / 'pages/Login.tsx'
login = login_path.read_text(encoding='utf-8')
login = login.replace("  const [fullName, setFullName] = useState('');", "  const [fullName, setFullName] = useState('');\n  const [setupToken, setSetupToken] = useState('');", 1)
login = login.replace("  const { login, bootstrapOwner, credentials } = useAuthStore();\n  const needsBootstrap = credentials.length === 0;", "  const { login, bootstrapOwner, needsBootstrap } = useAuthStore();", 1)
login = login.replace("? await bootstrapOwner({ marketName, fullName, username, password })", "? await bootstrapOwner({ marketName, fullName, username, password, setupToken })", 1)
bootstrap_fields = """                <Field icon={<User className=\"w-5 h-5\" />} label=\"ناوی تەواوی خاوەن\" value={fullName} onChange={setFullName} autoComplete=\"name\" />"""
if bootstrap_fields not in login:
    raise SystemExit('Login bootstrap fields pattern not found')
login = login.replace(bootstrap_fields, bootstrap_fields + "\n                <div>\n                  <label className=\"block text-sm font-medium text-slate-200 mb-1.5\">Setup token ی یەکەم جار</label>\n                  <input type=\"password\" value={setupToken} onChange={event => setSetupToken(event.target.value)} className=\"w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500\" required autoComplete=\"off\" />\n                  <p className=\"text-xs text-slate-400 mt-1\">تەنها لە یەکەم setup ـدا؛ token لە browser ناپارێزرێت.</p>\n                </div>", 1)
login_path.write_text(login, encoding='utf-8')

# Patch authoritative server to return full market/branch context and bootstrap status.
app_server = server_app.read_text(encoding='utf-8')
old_auth_query = """    `SELECT u.id, u.market_id, u.branch_id, u.username, u.full_name, u.role_type, u.status, s.id AS session_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1"""
new_auth_query = """    `SELECT u.id, u.market_id, u.branch_id, u.username, u.full_name, u.role_type, u.status, s.id AS session_id,
            m.name AS market_name, m.currency AS market_currency, m.status AS market_status,
            m.created_at AS market_created_at, m.updated_at AS market_updated_at,
            b.name AS branch_name, b.is_main AS branch_is_main, b.status AS branch_status,
            b.created_at AS branch_created_at, b.updated_at AS branch_updated_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN markets m ON m.id = u.market_id
       LEFT JOIN branches b ON b.id = u.branch_id
      WHERE s.token_hash = $1"""
if old_auth_query not in app_server:
    raise SystemExit('authenticate query pattern not found')
app_server = app_server.replace(old_auth_query, new_auth_query, 1)

public_user_block = r'''const publicUser = row => ({
  id: row.id,
  market_id: row.market_id,
  branch_id: row.branch_id,
  username: row.username,
  full_name: row.full_name,
  role_type: row.role_type,
});'''
public_context_block = public_user_block + r'''

const publicContext = row => ({
  user: publicUser(row),
  market: {
    id: row.market_id,
    name: row.market_name,
    currency: row.market_currency,
    status: row.market_status,
    created_at: row.market_created_at,
    updated_at: row.market_updated_at,
  },
  branch: row.branch_id ? {
    id: row.branch_id,
    market_id: row.market_id,
    name: row.branch_name,
    is_main: Boolean(row.branch_is_main),
    status: row.branch_status,
    created_at: row.branch_created_at,
    updated_at: row.branch_updated_at,
  } : null,
});'''
if public_user_block not in app_server:
    raise SystemExit('publicUser block not found')
app_server = app_server.replace(public_user_block, public_context_block, 1)

# Add bootstrap status before bootstrap POST.
bootstrap_marker = "      if (req.method === 'POST' && url.pathname === '/api/v1/bootstrap') {"
status_route = """      if (req.method === 'GET' && url.pathname === '/api/v1/bootstrap/status') {
        const count = await pool.query('SELECT count(*)::int AS count FROM users');
        return json(res, 200, { needs_bootstrap: count.rows[0].count === 0 });
      }

""" + bootstrap_marker
if bootstrap_marker not in app_server:
    raise SystemExit('bootstrap route marker not found')
app_server = app_server.replace(bootstrap_marker, status_route, 1)

# Bootstrap response now contains complete context.
old_bootstrap_user = """          const user = { id: userId, market_id: marketId, branch_id: branchId, username, full_name: String(body.fullName).trim(), role_type: 'owner' };
          const session = await createSession(client, user, req, config);
          return { status: 201, body: { user, created_at: now }, cookie: session.cookie };"""
new_bootstrap_user = """          const user = { id: userId, market_id: marketId, branch_id: branchId, username, full_name: String(body.fullName).trim(), role_type: 'owner' };
          const session = await createSession(client, user, req, config);
          return {
            status: 201,
            body: {
              user,
              market: { id: marketId, name: String(body.marketName).trim(), currency: 'IQD', status: 'active', created_at: now, updated_at: now },
              branch: { id: branchId, market_id: marketId, name: String(body.branchName ?? 'لقی سەرەکی').trim(), is_main: true, status: 'active', created_at: now, updated_at: now },
            },
            cookie: session.cookie,
          };"""
if old_bootstrap_user not in app_server:
    raise SystemExit('bootstrap response pattern not found')
app_server = app_server.replace(old_bootstrap_user, new_bootstrap_user, 1)

# Login query carries market/branch context.
old_login_query = """            `SELECT id, market_id, branch_id, username, full_name, role_type, status, password_salt, password_hash
               FROM users WHERE lower(username) = $1 LIMIT 1`,"""
new_login_query = """            `SELECT u.id, u.market_id, u.branch_id, u.username, u.full_name, u.role_type, u.status, u.password_salt, u.password_hash,
                    m.name AS market_name, m.currency AS market_currency, m.status AS market_status,
                    m.created_at AS market_created_at, m.updated_at AS market_updated_at,
                    b.name AS branch_name, b.is_main AS branch_is_main, b.status AS branch_status,
                    b.created_at AS branch_created_at, b.updated_at AS branch_updated_at
               FROM users u
               JOIN markets m ON m.id = u.market_id
               LEFT JOIN branches b ON b.id = u.branch_id
              WHERE lower(u.username) = $1 LIMIT 1`,"""
if old_login_query not in app_server:
    raise SystemExit('login query pattern not found')
app_server = app_server.replace(old_login_query, new_login_query, 1)
app_server = app_server.replace("return { status: 200, body: { user: publicUser(row) }, cookie: session.cookie };", "return { status: 200, body: publicContext(row), cookie: session.cookie };", 1)
app_server = app_server.replace("return user ? json(res, 200, { user: publicUser(user) }) : json(res, 401, { error: 'AUTH_REQUIRED' });", "return user ? json(res, 200, publicContext(user)) : json(res, 401, { error: 'AUTH_REQUIRED' });", 1)
server_app.write_text(app_server, encoding='utf-8')

# Expand production gate to forbid local credential persistence in production auth store.
gate = Path('source/scripts/check-production-readiness.mjs')
gate_text = gate.read_text(encoding='utf-8')
if "credentials:" not in gate_text:
    gate_text = gate_text.replace(
        "['src/stores/authStore.ts', ['MOCK_USERS', \"password === '123456'\", 'validatePassword']],",
        "['src/stores/authStore.ts', ['MOCK_USERS', \"password === '123456'\", 'validatePassword', 'passwordHash', 'passwordSalt', 'credentials:']],",
        1,
    )
gate.write_text(gate_text, encoding='utf-8')

print('Frontend auth wired to authoritative server; local password authority removed.')
