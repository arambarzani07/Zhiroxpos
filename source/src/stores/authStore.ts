import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Market, Branch, ApiResponse, Role } from '../types';
import { ROLE_PERMISSIONS } from '../constants/permissions';

type CredentialRecord = {
  user: User;
  market: Market;
  branch: Branch;
  passwordSalt: string;
  passwordHash: string;
};

interface BootstrapOwnerInput {
  marketName: string;
  fullName: string;
  username: string;
  password: string;
}

interface AuthState {
  user: User | null;
  market: Market | null;
  branch: Branch | null;
  isAuthenticated: boolean;
  permissions: string[];
  credentials: CredentialRecord[];
  bootstrapOwner: (input: BootstrapOwnerInput) => Promise<ApiResponse<User>>;
  login: (username: string, password: string) => Promise<ApiResponse<User>>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
}

const PBKDF2_ITERATIONS = 210_000;

const assertCrypto = () => {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error('SECURE_CRYPTO_UNAVAILABLE');
  }
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');

const hexToBytes = (hex: string) => {
  const result = new Uint8Array(hex.length / 2);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return result;
};

const secureId = (prefix: string) => {
  assertCrypto();
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}-${bytesToHex(bytes)}`;
};

const newSalt = () => {
  assertCrypto();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
};

const hashPassword = async (password: string, saltHex: string) => {
  assertCrypto();
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: hexToBytes(saltHex),
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
};

const normalizeUsername = (value: string) => value.trim().toLowerCase();

const auditAuth = async (user: User, action: 'auth.login' | 'auth.logout' | 'auth.bootstrap') => {
  try {
    const { useDataStore } = await import('./dataStore');
    useDataStore.getState().addAuditLog({
      market_id: user.market_id,
      branch_id: user.branch_id,
      user_id: user.id,
      action,
      module: 'auth',
      table_name: 'users',
      record_id: user.id,
      new_value: { username: user.username, role: user.role?.type },
    });
  } catch {
    // Authentication must not fail because supplementary audit persistence failed.
  }
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      market: null,
      branch: null,
      isAuthenticated: false,
      permissions: [],
      credentials: [],

      bootstrapOwner: async ({ marketName, fullName, username, password }) => {
        if (get().credentials.length > 0) {
          return { success: false, error_code: 'AUTH_INVALID_LOGIN', message: 'سیستەم پێشتر ڕێکخراوە' };
        }
        const normalizedUsername = normalizeUsername(username);
        if (!marketName.trim() || !fullName.trim() || normalizedUsername.length < 3 || password.length < 8) {
          return { success: false, error_code: 'VALIDATION_ERROR', message: 'زانیارییەکان تەواو و وشەی نهێنی لانیکەم ٨ پیت بێت' };
        }

        try {
          const now = new Date().toISOString();
          const marketId = secureId('market');
          const branchId = secureId('branch');
          const userId = secureId('user');
          const roleId = secureId('role');
          const salt = newSalt();
          const passwordHash = await hashPassword(password, salt);

          const role: Role = {
            id: roleId,
            market_id: marketId,
            name: 'خاوەن',
            type: 'owner',
            is_system: true,
            created_at: now,
          };
          const permissions = ROLE_PERMISSIONS.owner || [];
          const user: User = {
            id: userId,
            market_id: marketId,
            branch_id: branchId,
            username: normalizedUsername,
            full_name: fullName.trim(),
            role_id: roleId,
            role,
            permissions,
            status: 'active',
            created_at: now,
            updated_at: now,
          };
          const market: Market = {
            id: marketId,
            name: marketName.trim(),
            currency: 'IQD',
            phone: '',
            address: '',
            status: 'active',
            created_at: now,
            updated_at: now,
          };
          const branch: Branch = {
            id: branchId,
            market_id: marketId,
            name: 'لقی سەرەکی',
            is_main: true,
            status: 'active',
            created_at: now,
            updated_at: now,
          };
          const credential: CredentialRecord = { user, market, branch, passwordSalt: salt, passwordHash };

          set({
            credentials: [credential],
            user,
            market,
            branch,
            isAuthenticated: true,
            permissions,
          });
          void auditAuth(user, 'auth.bootstrap');
          return { success: true, data: user, message: 'هەژماری خاوەن بە سەرکەوتوویی دروست کرا' };
        } catch {
          return { success: false, error_code: 'UNKNOWN_ERROR', message: 'پاراستنی وێبگەڕ بەردەست نییە' };
        }
      },

      login: async (username, password) => {
        const normalizedUsername = normalizeUsername(username);
        const credential = get().credentials.find(item => item.user.username === normalizedUsername);
        if (!credential || credential.user.status !== 'active') {
          return { success: false, error_code: 'AUTH_INVALID_LOGIN', message: 'ناوی بەکارهێنەر یان وشەی نهێنی هەڵەیە' };
        }
        try {
          const incomingHash = await hashPassword(password, credential.passwordSalt);
          if (incomingHash !== credential.passwordHash) {
            return { success: false, error_code: 'AUTH_INVALID_LOGIN', message: 'ناوی بەکارهێنەر یان وشەی نهێنی هەڵەیە' };
          }
          const permissions = ROLE_PERMISSIONS[credential.user.role?.type || 'cashier'] || [];
          const user = { ...credential.user, permissions, last_login_at: new Date().toISOString() };
          set({ user, market: credential.market, branch: credential.branch, isAuthenticated: true, permissions });
          void auditAuth(user, 'auth.login');
          return { success: true, data: user, message: 'بەخێربێیت!' };
        } catch {
          return { success: false, error_code: 'UNKNOWN_ERROR', message: 'پاراستنی وێبگەڕ بەردەست نییە' };
        }
      },

      logout: () => {
        const currentUser = get().user;
        if (currentUser) void auditAuth(currentUser, 'auth.logout');
        set({ user: null, market: null, branch: null, isAuthenticated: false, permissions: [] });
      },

      hasPermission: permission => get().permissions.includes(permission),
      hasAnyPermission: permissions => permissions.some(permission => get().permissions.includes(permission)),
      hasAllPermissions: permissions => permissions.every(permission => get().permissions.includes(permission)),
    }),
    {
      name: 'zhirox-auth-v19',
      partialize: state => ({ credentials: state.credentials }),
    }
  )
);
