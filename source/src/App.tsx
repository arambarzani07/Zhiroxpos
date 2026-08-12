import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { Layout } from './components/layout/Layout';
import { ToastContainer } from './components/ui/Toast';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { POSPage } from './pages/POS';
import { ProductsPage } from './pages/Products';
import { CustomersPage } from './pages/Customers';
import { DebtPage } from './pages/Debt';
import { InventoryPage } from './pages/Inventory';
import { ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { AuditPage } from './pages/Audit';

// Feature Components
import { QuickActionsPalette, ShortcutHint } from './components/features/QuickActions';
import { CurrencyCalculatorButton } from './components/features/CurrencyCalculator';
import { ExpressModeButton } from './components/features/ExpressMode';
import { ThemeProvider } from './components/features/DarkMode';
import { WelcomeSplash } from './components/features/WelcomeSplash';
import { InactivityLock } from './components/features/InactivityLock';
import { AICommandButton } from './components/features/AICommandCenter';
import { PERMISSIONS } from './constants/permissions';

// Protected Route Component
function ProtectedRoute() {
  const { isAuthenticated, isInitialized } = useAuthStore();

  if (!isInitialized) return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">پەیوەندی بە سێرڤەر...</div>;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

// Public Route Component (redirects to dashboard if authenticated)
function PublicRoute() {
  const { isAuthenticated, isInitialized } = useAuthStore();

  if (!isInitialized) return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">پەیوەندی بە سێرڤەر...</div>;

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

// Feature Widgets (only show when authenticated)
function FeatureWidgets() {
  const { isAuthenticated, hasPermission } = useAuthStore();

  if (!isAuthenticated) return null;

  return (
    <>
      <QuickActionsPalette />
      <ShortcutHint />
      <CurrencyCalculatorButton />
      {hasPermission(PERMISSIONS.SALES_CREATE) && <ExpressModeButton />}
      <AICommandButton />
    </>
  );
}

function App() {
  const initialize = useAuthStore(state => state.initialize);
  useEffect(() => { void initialize(); }, [initialize]);

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/pos" element={<POSPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/debt" element={<DebtPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/audit" element={<AuditPage />} />
            </Route>
          </Route>

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>

        <ToastContainer />
        <FeatureWidgets />
        <WelcomeSplash />
        <InactivityLock />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
