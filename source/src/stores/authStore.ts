import { create } from 'zustand';
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
  if (!context?.branch) { useDataStore.getState().clearTenantContext(); return; }
  useDataStore.getState().setTenantContext(context.market.id, context.branch.id);
  await serverApi.registerDevice();
  try {
    const [products,customers]=await Promise.all([serverApi.loadProducts(),serverApi.loadCustomers()]);
    useDataStore.getState().hydrateAuthoritativeCatalog(products,customers);
  } catch (error) {
    console.warn('Authoritative catalog hydration failed; keeping last local cache', error);
  }
  try { const {flushOfflineQueue}=await import('../services/offlineQueue'); await flushOfflineQueue(); } catch(error) { console.warn('Offline queue sync deferred',error); }
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
