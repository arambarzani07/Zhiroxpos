// ==============================================
// ZHIROX HyperMarket Autopilot OS - Auth Store
// Version: Final v12 - Phase 1
// ==============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Market, Branch, ApiResponse } from '../types';
import { ROLE_PERMISSIONS } from '../constants/permissions';

interface AuthState {
  user: User | null;
  market: Market | null;
  branch: Branch | null;
  isAuthenticated: boolean;
  permissions: string[];
  
  // Actions
  login: (username: string, password: string) => Promise<ApiResponse<User>>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
}

// Mock users data
const MOCK_USERS: User[] = [
  {
    id: 'user-owner-1',
    market_id: 'market-1',
    branch_id: 'branch-1',
    username: 'owner',
    full_name: 'خاوەنی مارکێت',
    phone: '07501234567',
    role_id: 'role-owner',
    role: {
      id: 'role-owner',
      market_id: 'market-1',
      name: 'خاوەن',
      type: 'owner',
      is_system: true,
      created_at: '2024-01-01T00:00:00Z',
    },
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'user-admin-1',
    market_id: 'market-1',
    branch_id: 'branch-1',
    username: 'admin',
    full_name: 'بەڕێوەبەر',
    phone: '07502345678',
    role_id: 'role-admin',
    role: {
      id: 'role-admin',
      market_id: 'market-1',
      name: 'بەڕێوەبەر',
      type: 'admin',
      is_system: true,
      created_at: '2024-01-01T00:00:00Z',
    },
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'user-cashier-1',
    market_id: 'market-1',
    branch_id: 'branch-1',
    username: 'cashier',
    full_name: 'کاشێر ١',
    phone: '07503456789',
    role_id: 'role-cashier',
    role: {
      id: 'role-cashier',
      market_id: 'market-1',
      name: 'کاشێر',
      type: 'cashier',
      is_system: true,
      created_at: '2024-01-01T00:00:00Z',
    },
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'user-blocked-1',
    market_id: 'market-1',
    branch_id: 'branch-1',
    username: 'blocked',
    full_name: 'بەکارهێنەری بلۆککراو',
    phone: '07504567890',
    role_id: 'role-cashier',
    role: {
      id: 'role-cashier',
      market_id: 'market-1',
      name: 'کاشێر',
      type: 'cashier',
      is_system: true,
      created_at: '2024-01-01T00:00:00Z',
    },
    status: 'blocked',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

const MOCK_MARKET: Market = {
  id: 'market-1',
  name: 'سوپەرمارکێتی ژیرۆکس',
  name_en: 'ZHIROX Supermarket',
  phone: '07501234567',
  address: 'سلێمانی، شەقامی سالم',
  currency: 'IQD',
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const MOCK_BRANCH: Branch = {
  id: 'branch-1',
  market_id: 'market-1',
  name: 'لقی سەرەکی',
  phone: '07501234567',
  address: 'سلێمانی، شەقامی سالم',
  is_main: true,
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

// Password validation (mock - all passwords are '123456')
const validatePassword = (_username: string, password: string): boolean => {
  return password === '123456';
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      market: null,
      branch: null,
      isAuthenticated: false,
      permissions: [],

      login: async (username: string, password: string): Promise<ApiResponse<User>> => {
        // Find user
        const user = MOCK_USERS.find(u => u.username === username);
        
        if (!user) {
          return {
            success: false,
            error_code: 'AUTH_INVALID_LOGIN',
            message: 'ناوی بەکارهێنەر یان وشەی نهێنی هەڵەیە',
          };
        }

        // Check if blocked
        if (user.status === 'blocked') {
          return {
            success: false,
            error_code: 'USER_BLOCKED',
            message: 'ئەم بەکارهێنەرە بلۆککراوە',
          };
        }

        // Validate password
        if (!validatePassword(username, password)) {
          return {
            success: false,
            error_code: 'AUTH_INVALID_LOGIN',
            message: 'ناوی بەکارهێنەر یان وشەی نهێنی هەڵەیە',
          };
        }

        // Get permissions based on role
        const roleType = user.role?.type || 'cashier';
        const permissions = ROLE_PERMISSIONS[roleType] || [];

        // Set state
        set({
          user: { ...user, permissions },
          market: MOCK_MARKET,
          branch: MOCK_BRANCH,
          isAuthenticated: true,
          permissions,
        });

        // Create audit log for login
        try {
          const { useDataStore } = await import('./dataStore');
          useDataStore.getState().addAuditLog({
            market_id: 'market-1',
            branch_id: 'branch-1',
            user_id: user.id,
            action: 'auth.login',
            module: 'auth',
            table_name: 'users',
            record_id: user.id,
            new_value: { username: user.username, role: roleType },
          });
        } catch (_) {
          // Silent fail - audit is supplementary
        }

        return {
          success: true,
          data: user,
          message: 'بەخێربێیت!',
        };
      },

      logout: () => {
        const currentUser = get().user;
        if (currentUser) {
          try {
            import('./dataStore').then(({ useDataStore }) => {
              useDataStore.getState().addAuditLog({
                market_id: 'market-1',
                branch_id: 'branch-1',
                user_id: currentUser.id,
                action: 'auth.logout',
                module: 'auth',
                table_name: 'users',
                record_id: currentUser.id,
              });
            });
          } catch (_) {}
        }
        set({
          user: null,
          market: null,
          branch: null,
          isAuthenticated: false,
          permissions: [],
        });
      },

      hasPermission: (permission: string): boolean => {
        const { permissions } = get();
        return permissions.includes(permission);
      },

      hasAnyPermission: (perms: string[]): boolean => {
        const { permissions } = get();
        return perms.some(p => permissions.includes(p));
      },

      hasAllPermissions: (perms: string[]): boolean => {
        const { permissions } = get();
        return perms.every(p => permissions.includes(p));
      },
    }),
    {
      name: 'zhirox-auth',
      partialize: (state) => ({
        user: state.user,
        market: state.market,
        branch: state.branch,
        isAuthenticated: state.isAuthenticated,
        permissions: state.permissions,
      }),
    }
  )
);
