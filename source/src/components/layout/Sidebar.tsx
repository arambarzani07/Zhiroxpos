import { cn } from '../../utils/cn';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  CreditCard,
  Warehouse,
  BarChart3,
  Settings,
  History,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Zap,
  Menu,
  X,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { translations } from '../../constants/translations';
import { PERMISSIONS } from '../../constants/permissions';
import { ConfirmModal } from '../ui/Modal';
import { NotificationCenter } from '../features/NotificationCenter';
import { LiveClockMini } from '../features/LiveClock';
import { ThemeToggle } from '../features/DarkMode';
import { SoundToggle } from '../features/StockAlertSound';

const navItems = [
  {
    path: '/dashboard',
    label: translations.nav.dashboard,
    icon: LayoutDashboard,
    permission: PERMISSIONS.DASHBOARD_VIEW,
  },
  {
    path: '/pos',
    label: translations.nav.pos,
    icon: ShoppingCart,
    permission: PERMISSIONS.SALES_CREATE,
  },
  {
    path: '/products',
    label: translations.nav.products,
    icon: Package,
    permission: PERMISSIONS.PRODUCTS_VIEW,
  },
  {
    path: '/customers',
    label: translations.nav.customers,
    icon: Users,
    permission: PERMISSIONS.CUSTOMERS_VIEW,
  },
  {
    path: '/debt',
    label: translations.nav.debt,
    icon: CreditCard,
    permission: PERMISSIONS.DEBT_VIEW,
  },
  {
    path: '/inventory',
    label: translations.nav.inventory,
    icon: Warehouse,
    permission: PERMISSIONS.INVENTORY_VIEW,
  },
  {
    path: '/reports',
    label: translations.nav.reports,
    icon: BarChart3,
    permission: PERMISSIONS.REPORTS_VIEW,
  },
  {
    path: '/settings',
    label: translations.nav.settings,
    icon: Settings,
    permission: PERMISSIONS.SETTINGS_VIEW,
  },
  {
    path: '/audit',
    label: translations.nav.audit,
    icon: History,
    permission: PERMISSIONS.AUDIT_VIEW,
  },
];

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try { return localStorage.getItem('zhirox-sidebar') === 'collapsed'; } catch { return false; }
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const { user, hasPermission, logout } = useAuthStore();
  const navigate = useNavigate();

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [navigate]);

  // Close mobile sidebar on window resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredNavItems = navItems.filter((item) => hasPermission(item.permission));

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center justify-center border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
            <Zap className="w-6 h-6" />
          </div>
          {(!isCollapsed || isMobileOpen) && (
            <div>
              <h1 className="text-lg font-bold">ZHIROX</h1>
              <p className="text-[10px] text-slate-400">HyperMarket OS</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {filteredNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={() => setIsMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200',
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {(!isCollapsed || isMobileOpen) && <span className="font-medium">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        {/* User Info */}
        {(!isCollapsed || isMobileOpen) && user && (
          <div className="mb-3 px-2">
            <p className="text-sm font-medium text-white truncate">{user.full_name}</p>
            <p className="text-xs text-slate-400">{user.role?.name}</p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLogoutModal(true)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-red-400 hover:bg-red-900/30 transition-colors',
              (isCollapsed && !isMobileOpen) ? 'w-full justify-center' : 'flex-1'
            )}
          >
            <LogOut className="w-5 h-5" />
            {(!isCollapsed || isMobileOpen) && <span className="font-medium">{translations.nav.logout}</span>}
          </button>

          {/* Desktop collapse button */}
          <button
            onClick={() => {
              const next = !isCollapsed;
              setIsCollapsed(next);
              localStorage.setItem('zhirox-sidebar', next ? 'collapsed' : 'expanded');
            }}
            className="hidden lg:flex p-2.5 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            {isCollapsed ? (
              <ChevronLeft className="w-5 h-5" />
            ) : (
              <ChevronRight className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 right-0 left-0 h-16 bg-slate-900 z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">ZHIROX</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LiveClockMini />
          <SoundToggle />
          <NotificationCenter />
          <ThemeToggle />
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="p-2 text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          'lg:hidden fixed top-0 right-0 h-full w-72 bg-slate-900 text-white z-50 transform transition-transform duration-300',
          isMobileOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <SidebarContent />
      </aside>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex lg:flex-col fixed top-0 right-0 h-full bg-slate-900 text-white transition-all duration-300 z-40',
          isCollapsed ? 'w-20' : 'w-64'
        )}
      >
        <SidebarContent />
      </aside>

      <ConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
        title={translations.nav.logout}
        message={translations.confirm.logout}
        confirmText={translations.nav.logout}
        cancelText={translations.common.cancel}
        variant="danger"
      />
    </>
  );
}
