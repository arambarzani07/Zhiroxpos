from pathlib import Path
import json
import re

root = Path('source')

auth = r'''import { create } from 'zustand';
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
'''

login = r'''import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, User, Lock, Eye, EyeOff, Store } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { translations } from '../constants/translations';
import { Button } from '../components/ui/Button';
import { toast } from '../components/ui/Toast';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [marketName, setMarketName] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const { login, bootstrapOwner, credentials } = useAuthStore();
  const needsBootstrap = credentials.length === 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (needsBootstrap && password !== confirmPassword) {
      setError('وشە نهێنییەکان یەکسان نین');
      return;
    }
    setIsLoading(true);
    try {
      const result = needsBootstrap
        ? await bootstrapOwner({ marketName, fullName, username, password })
        : await login(username, password);
      if (result.success) {
        toast.success(needsBootstrap ? 'هەژماری خاوەن دروست کرا' : translations.success.login);
        navigate('/dashboard');
      } else {
        setError(result.message || translations.errors.UNKNOWN_ERROR);
      }
    } catch {
      setError(translations.errors.UNKNOWN_ERROR);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
      </div>
      <div className="relative w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/30 mb-4">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">ZHIROX</h1>
          <p className="text-indigo-200 mt-1">{needsBootstrap ? 'ڕێکخستنی یەکەم جاری سیستەم' : translations.app_subtitle}</p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-white/10">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white">{needsBootstrap ? 'دروستکردنی هەژماری خاوەن' : translations.auth.welcome_back}</h2>
            <p className="text-slate-300 mt-1 text-sm">{needsBootstrap ? 'هیچ هەژماری demo نییە؛ ئەم زانیارییانە تەنها بۆ یەکەم خاوەنن.' : translations.auth.enter_credentials}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {needsBootstrap && (
              <>
                <Field icon={<Store className="w-5 h-5" />} label="ناوی فرۆشگا" value={marketName} onChange={setMarketName} autoComplete="organization" />
                <Field icon={<User className="w-5 h-5" />} label="ناوی تەواوی خاوەن" value={fullName} onChange={setFullName} autoComplete="name" />
              </>
            )}
            <Field icon={<User className="w-5 h-5" />} label={translations.auth.username} value={username} onChange={setUsername} autoComplete="username" />

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1.5">{translations.auth.password}</label>
              <div className="relative">
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><Lock className="w-5 h-5" /></div>
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} minLength={8} className="w-full pr-10 pl-12 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" required autoComplete={needsBootstrap ? 'new-password' : 'current-password'} />
                <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
              </div>
              {needsBootstrap && <p className="text-xs text-slate-400 mt-1">لانیکەم ٨ پیت/ژمارە؛ وشەی نهێنی لە کۆددا هاردکۆد ناکرێت.</p>}
            </div>

            {needsBootstrap && (
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">دووبارەکردنەوەی وشەی نهێنی</label>
                <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={8} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" required autoComplete="new-password" />
              </div>
            )}

            {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3"><p className="text-red-300 text-sm">{error}</p></div>}

            <Button type="submit" className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600" isLoading={isLoading}>
              {needsBootstrap ? 'دروستکردنی هەژماری خاوەن' : translations.auth.login_button}
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/10 text-xs text-slate-400 leading-6">
            {needsBootstrap ? 'Production Gate: هیچ user، customer، product یان password ـی نموونەیی خۆکارانە دروست ناکرێت.' : 'پاراستن: session دوای نوێکردنەوەی پەڕە بە خۆکار ناچالاک دەبێت و پێویستە دووبارە بچیتە ژوورەوە.'}
          </div>
        </div>
        <p className="text-center text-slate-500 text-xs mt-5">ZHIROX • v19 Production Readiness</p>
      </div>
    </div>
  );
}

function Field({ icon, label, value, onChange, autoComplete }: { icon: React.ReactNode; label: string; value: string; onChange: (value: string) => void; autoComplete?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-200 mb-1.5">{label}</label>
      <div className="relative">
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div>
        <input type="text" value={value} onChange={event => onChange(event.target.value)} className="w-full pr-10 pl-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" required autoComplete={autoComplete} />
      </div>
    </div>
  );
}
'''

(root / 'src/stores/authStore.ts').write_text(auth, encoding='utf-8')
(root / 'src/pages/Login.tsx').write_text(login, encoding='utf-8')

store_path = root / 'src/stores/dataStore.ts'
store = store_path.read_text(encoding='utf-8')
store = re.sub(r'// ===== Initial Mock Data =====.*?interface DataState \{', '// ===== Production starts empty: no demo data =====\n\ninterface DataState {', store, flags=re.S)
for identifier in ('INITIAL_CATEGORIES', 'INITIAL_PRODUCTS', 'INITIAL_CUSTOMERS', 'INITIAL_CUSTOMER_BALANCES'):
    store = store.replace(identifier, '[]')
store_path.write_text(store, encoding='utf-8')

package_path = root / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
package['version'] = '0.19.0'
package.setdefault('scripts', {})['check:production'] = 'node scripts/check-production-readiness.mjs'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

scripts = root / 'scripts'
scripts.mkdir(exist_ok=True)
(scripts / 'check-production-readiness.mjs').write_text(r'''import fs from 'node:fs';

const checks = [
  ['src/stores/authStore.ts', ['MOCK_USERS', "password === '123456'", 'validatePassword']],
  ['src/pages/Login.tsx', ['Demo Credentials', "setPassword('123456')", 'placeholder="123456"']],
  ['src/stores/dataStore.ts', ['Initial Mock Data', 'INITIAL_PRODUCTS', 'INITIAL_CUSTOMERS']],
];
let failed = false;
for (const [file, forbidden] of checks) {
  const content = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  for (const token of forbidden) {
    if (content.includes(token)) {
      console.error(`PRODUCTION BLOCKER: ${token} found in ${file}`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log('Production readiness gate passed: no demo credentials or seeded business data in critical stores.');
''', encoding='utf-8')

(root / 'PRODUCTION_READINESS.md').write_text(r'''# ZHIROX v19 Production Readiness

## Completed in this hardening pass

- Production database/state starts empty; no seeded products, customers, balances or categories.
- Removed shared demo users and the global demo password.
- First-run owner bootstrap replaces demo credentials.
- Passwords are stored only as PBKDF2-SHA256 derived hashes with per-user random salt (210,000 iterations).
- Authentication fails closed if secure Web Crypto is unavailable.
- Authenticated session is not persisted across browser reloads; credentials remain protected by a derived hash.
- Added CI production gate that rejects reintroduction of critical demo credentials/data.

## Security boundary

This pass hardens **single-device/offline bootstrap authentication**. It is not yet the final multi-device server identity system. Before public multi-device rollout, move credential verification and authorization to the production backend and keep the device-local mode only as an explicitly controlled offline fallback.

## Next production gates

1. Server-side identity, roles and permission revocation.
2. Central monotonic/unique receipt sequencing with idempotency keys.
3. Conflict-safe multi-device sync and server validation of queued financial writes.
4. Automatic encrypted daily backup with restore drill.
5. Printer/scale hardware acceptance tests.
6. Load test with the real ~20,000-product catalog.
''', encoding='utf-8')

print('v19 production hardening transform applied')
