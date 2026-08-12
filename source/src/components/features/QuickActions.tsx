// ==============================================
// ZHIROX - Quick Actions & Shortcuts
// تایبەتمەندی: کلیلە کورتەکان و کردارە خێراکان
// ==============================================

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ShoppingCart,
  Package,
  Users,
  CreditCard,
  BarChart3,
  Settings,
  X,
  Keyboard,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { PERMISSIONS } from '../../constants/permissions';

interface QuickAction {
  id: string;
  label: string;
  labelKu: string;
  shortcut: string;
  icon: React.ElementType;
  path: string;
  permission?: string;
}

const quickActions: QuickAction[] = [
  { id: 'pos', label: 'POS', labelKu: 'کاشێر', shortcut: 'P', icon: ShoppingCart, path: '/pos', permission: PERMISSIONS.SALES_CREATE },
  { id: 'products', label: 'Products', labelKu: 'کاڵاکان', shortcut: 'K', icon: Package, path: '/products', permission: PERMISSIONS.PRODUCTS_VIEW },
  { id: 'customers', label: 'Customers', labelKu: 'کڕیاران', shortcut: 'C', icon: Users, path: '/customers', permission: PERMISSIONS.CUSTOMERS_VIEW },
  { id: 'debt', label: 'Debt', labelKu: 'قەرز', shortcut: 'Q', icon: CreditCard, path: '/debt', permission: PERMISSIONS.DEBT_VIEW },
  { id: 'reports', label: 'Reports', labelKu: 'ڕاپۆرت', shortcut: 'R', icon: BarChart3, path: '/reports', permission: PERMISSIONS.REPORTS_VIEW },
  { id: 'settings', label: 'Settings', labelKu: 'ڕێکخستن', shortcut: 'S', icon: Settings, path: '/settings', permission: PERMISSIONS.SETTINGS_VIEW },
];

export function QuickActionsPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();

  const filteredActions = quickActions.filter(action => {
    if (action.permission && !hasPermission(action.permission)) return false;
    if (!searchQuery) return true;
    return (
      action.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      action.labelKu.includes(searchQuery)
    );
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K to open
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      // Escape to close
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
      // Direct shortcuts when palette is closed
      if (!isOpen && (e.ctrlKey || e.metaKey)) {
        const action = quickActions.find(a => a.shortcut.toLowerCase() === e.key.toLowerCase());
        if (action && (!action.permission || hasPermission(action.permission))) {
          e.preventDefault();
          navigate(action.path);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, navigate, hasPermission]);

  const handleAction = (action: QuickAction) => {
    navigate(action.path);
    setIsOpen(false);
    setSearchQuery('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg mx-4">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden animate-slideUp">
          {/* Search Header */}
          <div className="flex items-center gap-3 p-4 border-b">
            <Search className="w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="گەڕان بۆ کردار..."
              className="flex-1 bg-transparent outline-none text-slate-900 placeholder:text-slate-400"
              autoFocus
            />
            <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Actions List */}
          <div className="max-h-80 overflow-y-auto p-2">
            {filteredActions.map((action) => (
              <button
                key={action.id}
                onClick={() => handleAction(action)}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                    <action.icon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <span className="font-medium text-slate-900">{action.labelKu}</span>
                </div>
                <kbd className="px-2 py-1 bg-slate-100 rounded text-xs font-mono text-slate-500">
                  Ctrl+{action.shortcut}
                </kbd>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="p-3 border-t bg-slate-50 flex items-center justify-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white rounded border text-[10px]">↑↓</kbd>
              گەڕان
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white rounded border text-[10px]">Enter</kbd>
              هەڵبژاردن
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white rounded border text-[10px]">Esc</kbd>
              داخستن
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Floating shortcut hint button
export function ShortcutHint() {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="fixed bottom-20 lg:bottom-4 left-4 z-30 hidden sm:block">
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg hover:bg-slate-800 transition-colors"
      >
        <Keyboard className="w-5 h-5" />
      </button>
      
      {showTooltip && (
        <div className="absolute bottom-12 left-0 bg-slate-900 text-white text-xs rounded-lg p-3 w-48 animate-fadeIn">
          <p className="font-medium mb-2">کلیلە کورتەکان:</p>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>کردارە خێراکان</span>
              <kbd className="bg-slate-700 px-1.5 rounded">Ctrl+K</kbd>
            </div>
            <div className="flex justify-between">
              <span>کاشێر</span>
              <kbd className="bg-slate-700 px-1.5 rounded">Ctrl+P</kbd>
            </div>
            <div className="flex justify-between">
              <span>کاڵاکان</span>
              <kbd className="bg-slate-700 px-1.5 rounded">Ctrl+K</kbd>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
