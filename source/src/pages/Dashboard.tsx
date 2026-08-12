import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign,
  TrendingUp,
  Banknote,
  CreditCard,
  Receipt,
  AlertTriangle,
  Users,
  Package,
  ShoppingCart,
  Plus,
  ArrowLeft,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { translations } from '../constants/translations';
import { PageHeader, PageContent } from '../components/layout/Layout';
import { Card, StatCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PaymentTypeBadge } from '../components/ui/Badge';
import { PERMISSIONS } from '../constants/permissions';
import { format } from 'date-fns';

// Feature Widgets
import { SalesGoalsWidget } from '../components/features/SalesGoals';
import { SalesComparisonWidget } from '../components/features/SalesComparison';
import { CustomerDebtAlerts } from '../components/features/CustomerDebtAlert';
import { RecentActivityFeed } from '../components/features/RecentActivityFeed';
import { LiveClock } from '../components/features/LiveClock';
import { ProfitPulseWidget } from '../components/features/ProfitPulse';
import { MarketHealthScoreWidget } from '../components/features/MarketHealthScore';
import { TopSellingProductsWidget } from '../components/features/TopSellingProducts';
import { SmartSuggestionsWidget } from '../components/features/SmartSuggestions';
import { CustomerInsightsWidget } from '../components/features/CustomerInsights';
import { SalesHeatmapWidget } from '../components/features/SalesHeatmap';
import { QuickNotesWidget } from '../components/features/QuickNotes';
import { DailyClosingReport } from '../components/features/DailyClosingReport';
import { ExpenseTrackerWidget } from '../components/features/ExpenseTracker';
import { DebtReminderModal } from '../components/features/DebtReminder';
import { DailyGoalSetterWidget } from '../components/features/DailyGoalSetter';
import { InventoryAlertsWidget } from '../components/features/InventoryAlerts';
import { VisualChartsWidget } from '../components/features/VisualCharts';

function formatCurrency(amount: number, currency: 'IQD' | 'USD' = 'IQD'): string {
  if (currency === 'USD') {
    return `$${amount.toLocaleString()}`;
  }
  return `${amount.toLocaleString()} د.ع`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthStore();
  const { getDashboardSummary, getRecentSales, getLowStockProducts } = useDataStore();

  const summary = getDashboardSummary();
  const recentSales = getRecentSales(5);
  const lowStockProducts = getLowStockProducts().slice(0, 5);

  const isOwnerOrAdmin = user?.role?.type === 'owner' || user?.role?.type === 'admin';
  const [showClosing, setShowClosing] = useState(false);
  const [showDebtReminder, setShowDebtReminder] = useState(false);

  return (
    <div>
      <PageHeader
        title={`${translations.dashboard.welcome}، ${user?.full_name}`}
        subtitle={translations.dashboard.today_summary}
        action={<LiveClock />}
      />

      <PageContent>
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <StatCard
            title={translations.dashboard.today_sales}
            value={formatCurrency(summary.today_sales)}
            icon={<DollarSign className="w-5 h-5 lg:w-6 lg:h-6" />}
            color="indigo"
          />
          {isOwnerOrAdmin && (
            <StatCard
              title={translations.dashboard.today_profit}
              value={formatCurrency(summary.today_profit)}
              icon={<TrendingUp className="w-5 h-5 lg:w-6 lg:h-6" />}
              color="emerald"
            />
          )}
          <StatCard
            title={translations.dashboard.today_cash}
            value={formatCurrency(summary.today_cash)}
            icon={<Banknote className="w-5 h-5 lg:w-6 lg:h-6" />}
            color="blue"
          />
          <StatCard
            title={translations.dashboard.today_debt_added}
            value={formatCurrency(summary.today_debt_added)}
            icon={<CreditCard className="w-5 h-5 lg:w-6 lg:h-6" />}
            color="amber"
          />
        </div>

        {/* Second Row Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <StatCard
            title={translations.dashboard.today_debt_payments}
            value={formatCurrency(summary.today_debt_payments)}
            icon={<CreditCard className="w-5 h-5 lg:w-6 lg:h-6" />}
            color="emerald"
          />
          {isOwnerOrAdmin && (
            <StatCard
              title={translations.dashboard.total_customer_debt}
              value={formatCurrency(summary.total_customer_debt)}
              icon={<Users className="w-5 h-5 lg:w-6 lg:h-6" />}
              color="red"
            />
          )}
          <StatCard
            title={translations.dashboard.receipt_count}
            value={summary.receipt_count}
            icon={<Receipt className="w-5 h-5 lg:w-6 lg:h-6" />}
            color="purple"
          />
          <StatCard
            title={translations.dashboard.low_stock_products}
            value={summary.low_stock_count}
            icon={<AlertTriangle className="w-5 h-5 lg:w-6 lg:h-6" />}
            color={summary.low_stock_count > 0 ? 'red' : 'emerald'}
          />
        </div>

        {/* Quick Actions */}
        <Card>
          <h3 className="text-base lg:text-lg font-semibold text-slate-900 mb-4">
            {translations.dashboard.quick_actions}
          </h3>
          <div className="flex flex-wrap gap-2 lg:gap-3">
            {hasPermission(PERMISSIONS.SALES_CREATE) && (
              <Button
                onClick={() => navigate('/pos')}
                leftIcon={<ShoppingCart className="w-4 h-4 lg:w-5 lg:h-5" />}
                className="text-sm lg:text-base"
              >
                {translations.dashboard.new_sale}
              </Button>
            )}
            {hasPermission(PERMISSIONS.PRODUCTS_CREATE) && (
              <Button
                variant="secondary"
                onClick={() => navigate('/products?action=add')}
                leftIcon={<Plus className="w-4 h-4 lg:w-5 lg:h-5" />}
                className="text-sm lg:text-base"
              >
                {translations.dashboard.add_product}
              </Button>
            )}
            {hasPermission(PERMISSIONS.CUSTOMERS_CREATE) && (
              <Button
                variant="secondary"
                onClick={() => navigate('/customers?action=add')}
                leftIcon={<Plus className="w-4 h-4 lg:w-5 lg:h-5" />}
                className="text-sm lg:text-base"
              >
                {translations.dashboard.add_customer}
              </Button>
            )}
            {hasPermission(PERMISSIONS.REPORTS_VIEW) && (
              <Button
                variant="outline"
                onClick={() => navigate('/reports')}
                leftIcon={<ArrowLeft className="w-4 h-4 lg:w-5 lg:h-5" />}
                className="text-sm lg:text-base"
              >
                {translations.dashboard.view_reports}
              </Button>
            )}
            {isOwnerOrAdmin && (
              <Button
                variant="outline"
                onClick={() => setShowClosing(true)}
                className="text-sm lg:text-base"
              >
                📋 داخستنی ڕۆژ
              </Button>
            )}
            {isOwnerOrAdmin && hasPermission(PERMISSIONS.DEBT_VIEW) && (
              <Button
                variant="outline"
                onClick={() => setShowDebtReminder(true)}
                className="text-sm lg:text-base"
              >
                📩 یادەوەری قەرز
              </Button>
            )}
          </div>
        </Card>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          {/* Left Column - Sales & Activity */}
          <div className="lg:col-span-2 space-y-4 lg:space-y-6">
            {/* Recent Sales */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base lg:text-lg font-semibold text-slate-900">
                  {translations.dashboard.latest_sales}
                </h3>
                {hasPermission(PERMISSIONS.SALES_VIEW) && (
                  <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
                    بینین
                  </Button>
                )}
              </div>

              {recentSales.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Receipt className="w-10 h-10 lg:w-12 lg:h-12 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">هیچ فرۆشتنێک نییە</p>
                </div>
              ) : (
                <div className="space-y-2 lg:space-y-3">
                  {recentSales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between p-2.5 lg:p-3 bg-slate-50 rounded-xl"
                    >
                      <div className="flex items-center gap-2 lg:gap-3">
                        <div className="w-8 h-8 lg:w-10 lg:h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                          <Receipt className="w-4 h-4 lg:w-5 lg:h-5 text-indigo-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 text-sm lg:text-base">{sale.receipt_number}</p>
                          <p className="text-xs text-slate-500">
                            {format(new Date(sale.created_at), 'HH:mm')}
                            {sale.customer && ` • ${sale.customer.name}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-slate-900 text-sm lg:text-base">
                          {formatCurrency(sale.total_amount, sale.currency)}
                        </p>
                        <PaymentTypeBadge type={sale.payment_type} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Low Stock Products */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base lg:text-lg font-semibold text-slate-900">
                  {translations.dashboard.low_stock_products}
                </h3>
                {hasPermission(PERMISSIONS.INVENTORY_VIEW) && (
                  <Button variant="ghost" size="sm" onClick={() => navigate('/inventory')}>
                    بینین
                  </Button>
                )}
              </div>

              {lowStockProducts.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Package className="w-10 h-10 lg:w-12 lg:h-12 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">هەموو کاڵاکان کۆگایان باشە</p>
                </div>
              ) : (
                <div className="space-y-2 lg:space-y-3">
                  {lowStockProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between p-2.5 lg:p-3 bg-red-50 rounded-xl"
                    >
                      <div className="flex items-center gap-2 lg:gap-3">
                        <div className="w-8 h-8 lg:w-10 lg:h-10 bg-red-100 rounded-lg flex items-center justify-center">
                          <AlertTriangle className="w-4 h-4 lg:w-5 lg:h-5 text-red-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 text-sm lg:text-base">{product.name}</p>
                          <p className="text-xs text-slate-500">{product.barcode}</p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-red-600 text-sm lg:text-base">
                          {product.stock_quantity} {product.unit}
                        </p>
                        <p className="text-xs text-slate-500">
                          کەمترین: {product.low_stock_limit}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Right Column - Widgets */}
          <div className="space-y-4 lg:space-y-6">
            {/* Market Health Score */}
            {isOwnerOrAdmin && <MarketHealthScoreWidget />}

            {/* Daily Goal Setter */}
            <DailyGoalSetterWidget />

            {/* Profit Pulse */}
            {isOwnerOrAdmin && <ProfitPulseWidget />}

            {/* Inventory Alerts */}
            {isOwnerOrAdmin && <InventoryAlertsWidget />}

            {/* Sales Goals */}
            <SalesGoalsWidget />

            {/* Sales Comparison */}
            {isOwnerOrAdmin && <SalesComparisonWidget />}

            {/* Debt Alerts */}
            {isOwnerOrAdmin && hasPermission(PERMISSIONS.DEBT_VIEW) && (
              <CustomerDebtAlerts />
            )}

            {/* Top Selling */}
            <TopSellingProductsWidget />

            {/* Customer Insights */}
            {isOwnerOrAdmin && <CustomerInsightsWidget />}

            {/* Activity Feed */}
            {isOwnerOrAdmin && <RecentActivityFeed />}
          </div>
        </div>

        {/* Visual Charts */}
        {isOwnerOrAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            <VisualChartsWidget />
            <SalesHeatmapWidget />
          </div>
        )}

        {/* Notes + Expenses */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <QuickNotesWidget />
          {isOwnerOrAdmin && <ExpenseTrackerWidget />}
        </div>

        {/* AI Suggestions - Full Width */}
        {isOwnerOrAdmin && <SmartSuggestionsWidget />}

        {/* Modals */}
        <DailyClosingReport isOpen={showClosing} onClose={() => setShowClosing(false)} />
        <DebtReminderModal isOpen={showDebtReminder} onClose={() => setShowDebtReminder(false)} />
      </PageContent>
    </div>
  );
}
