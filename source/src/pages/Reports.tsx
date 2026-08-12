import { useState } from 'react';
import {
  BarChart3,
  DollarSign,
  TrendingUp,
  CreditCard,
  Package,
  Users,
  Calendar,
} from 'lucide-react';
import { useDataStore } from '../stores/dataStore';
import { translations } from '../constants/translations';
import { PageHeader, PageContent } from '../components/layout/Layout';
import { SaleHistoryModal } from '../components/features/SaleHistory';
import { Card, StatCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PaymentTypeBadge } from '../components/ui/Badge';
import { exportSalesData } from '../components/features/DataExport';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyTable, DataList, DataListItem } from '../components/ui/Table';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';

function formatCurrency(amount: number, currency: 'IQD' | 'USD' = 'IQD'): string {
  if (currency === 'USD') {
    return `$${amount.toLocaleString()}`;
  }
  return `${amount.toLocaleString()} د.ع`;
}

type ReportType = 'daily' | 'profit' | 'product_sales' | 'debt' | 'inventory';
type DateRange = 'today' | 'yesterday' | 'week' | 'month';

export function ReportsPage() {
  const [activeReport, setActiveReport] = useState<ReportType>('daily');
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [showSaleHistory, setShowSaleHistory] = useState(false);

  const {
    getSales,
    getProducts,
    getCustomersWithDebt,
    getDashboardSummary,
    getLowStockProducts,
  } = useDataStore();

  const summary = getDashboardSummary();
  const sales = getSales().filter(s => s.status === 'completed');
  const products = getProducts();
  const customersWithDebt = getCustomersWithDebt();
  const lowStockProducts = getLowStockProducts();

  const getDateRange = () => {
    const now = new Date();
    switch (dateRange) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'yesterday':
        const yesterday = subDays(now, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      case 'week':
        return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
      case 'month':
        return { start: startOfDay(subDays(now, 30)), end: endOfDay(now) };
    }
  };

  const { start, end } = getDateRange();

  const filteredSales = sales.filter(s => {
    const saleDate = new Date(s.created_at);
    return saleDate >= start && saleDate <= end;
  });

  const totalSales = filteredSales.reduce((sum, s) => sum + s.total_amount, 0);
  const totalCash = filteredSales.reduce((sum, s) => sum + s.paid_amount, 0);
  const totalDebt = filteredSales.reduce((sum, s) => sum + s.debt_amount, 0);

  const reportTabs = [
    { id: 'daily', label: translations.reports.daily_sales, icon: BarChart3 },
    { id: 'profit', label: translations.reports.profit_report, icon: TrendingUp },
    { id: 'product_sales', label: 'فرۆشتنی کاڵا', icon: Package },
    { id: 'debt', label: translations.reports.debt_report, icon: CreditCard },
    { id: 'inventory', label: translations.reports.inventory_report, icon: Package },
  ];

  const dateRangeOptions = [
    { value: 'today', label: translations.common.today },
    { value: 'yesterday', label: translations.common.yesterday },
    { value: 'week', label: translations.common.this_week },
    { value: 'month', label: translations.common.this_month },
  ];

  return (
    <div>
      <PageHeader
        title={translations.reports.title}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportSalesData(filteredSales)}>
              📥 هەناردنی CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSaleHistory(true)}>
              مێژووی وەسڵەکان
            </Button>
          </div>
        }
      />
      <SaleHistoryModal isOpen={showSaleHistory} onClose={() => setShowSaleHistory(false)} />

      <PageContent>
        {/* Report Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {reportTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveReport(tab.id as ReportType)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl font-medium whitespace-nowrap transition-colors text-sm ${
                activeReport === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Date Range Filter */}
        <Card>
          <div className="flex items-center gap-3 overflow-x-auto">
            <Calendar className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <div className="flex gap-2">
              {dateRangeOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => setDateRange(option.value as DateRange)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    dateRange === option.value
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Daily Sales Report */}
        {activeReport === 'daily' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                title={translations.reports.total_sales}
                value={formatCurrency(totalSales)}
                icon={<DollarSign className="w-5 h-5" />}
                color="indigo"
              />
              <StatCard
                title={translations.reports.total_cash}
                value={formatCurrency(totalCash)}
                icon={<DollarSign className="w-5 h-5" />}
                color="emerald"
              />
              <StatCard
                title={translations.reports.total_debt}
                value={formatCurrency(totalDebt)}
                icon={<CreditCard className="w-5 h-5" />}
                color="red"
              />
              <StatCard
                title={translations.reports.transaction_count}
                value={filteredSales.length}
                icon={<BarChart3 className="w-5 h-5" />}
                color="blue"
              />
            </div>

            {/* Mobile Sales List */}
            <div className="lg:hidden">
              {filteredSales.length === 0 ? (
                <Card>
                  <EmptyTable message="هیچ فرۆشتنێک نییە" icon={<BarChart3 className="w-12 h-12" />} />
                </Card>
              ) : (
                <DataList>
                  {filteredSales.map(sale => (
                    <DataListItem key={sale.id}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-mono text-sm font-medium">{sale.receipt_number}</p>
                          <p className="text-xs text-slate-500">{format(new Date(sale.created_at), 'HH:mm')}</p>
                        </div>
                        <PaymentTypeBadge type={sale.payment_type} />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">{sale.customer?.name || '-'}</span>
                        <span className="font-semibold">{formatCurrency(sale.total_amount)}</span>
                      </div>
                    </DataListItem>
                  ))}
                </DataList>
              )}
            </div>

            {/* Desktop Sales Table */}
            <Card padding="none" className="hidden lg:block">
              {filteredSales.length === 0 ? (
                <EmptyTable message="هیچ فرۆشتنێک نییە" icon={<BarChart3 className="w-16 h-16" />} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ژمارەی وەسڵ</TableHead>
                      <TableHead>بەروار</TableHead>
                      <TableHead>کڕیار</TableHead>
                      <TableHead>جۆری پارەدان</TableHead>
                      <TableHead>پارەی دراو</TableHead>
                      <TableHead>قەرز</TableHead>
                      <TableHead>کۆی گشتی</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSales.map(sale => (
                      <TableRow key={sale.id}>
                        <TableCell className="font-mono">{sale.receipt_number}</TableCell>
                        <TableCell>{format(new Date(sale.created_at), 'yyyy/MM/dd HH:mm')}</TableCell>
                        <TableCell>{sale.customer?.name || '-'}</TableCell>
                        <TableCell><PaymentTypeBadge type={sale.payment_type} /></TableCell>
                        <TableCell className="text-emerald-600 font-medium">{formatCurrency(sale.paid_amount)}</TableCell>
                        <TableCell className="text-red-600 font-medium">{sale.debt_amount > 0 ? formatCurrency(sale.debt_amount) : '-'}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(sale.total_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </>
        )}

        {/* Profit Report */}
        {activeReport === 'profit' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard title={translations.reports.total_sales} value={formatCurrency(summary.today_sales)} icon={<DollarSign className="w-5 h-5" />} color="indigo" />
              <StatCard title={translations.reports.total_profit} value={formatCurrency(summary.today_profit)} icon={<TrendingUp className="w-5 h-5" />} color="emerald" />
              <StatCard title="ڕێژەی قازانج" value={summary.today_sales > 0 ? `${Math.round((summary.today_profit / summary.today_sales) * 100)}%` : '0%'} icon={<TrendingUp className="w-5 h-5" />} color="purple" />
            </div>

            <Card>
              <h3 className="font-semibold mb-4 text-sm sm:text-base">ئەمڕۆ</h3>
              <div className="space-y-3">
                {[
                  { label: 'کۆی فرۆشتن', value: formatCurrency(summary.today_sales), color: '' },
                  { label: 'پارەی نەقد', value: formatCurrency(summary.today_cash), color: 'text-emerald-600' },
                  { label: 'قەرزی نوێ', value: formatCurrency(summary.today_debt_added), color: 'text-red-600' },
                  { label: 'پارەدانی قەرز', value: formatCurrency(summary.today_debt_payments), color: 'text-emerald-600' },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between py-2 border-b text-sm">
                    <span className="text-slate-600">{item.label}</span>
                    <span className={`font-semibold ${item.color}`}>{item.value}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 text-base sm:text-lg">
                  <span className="font-semibold text-slate-900">قازانجی ڕۆژانە</span>
                  <span className="font-bold text-emerald-600">{formatCurrency(summary.today_profit)}</span>
                </div>
              </div>
            </Card>
          </>
        )}

        {/* Debt Report */}
        {activeReport === 'debt' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard title="کۆی قەرزی کڕیاران" value={formatCurrency(summary.total_customer_debt)} icon={<CreditCard className="w-5 h-5" />} color="red" />
              <StatCard title="کڕیارانی قەرزدار" value={customersWithDebt.length} icon={<Users className="w-5 h-5" />} color="amber" />
              <StatCard title="پارەدانی قەرزی ئەمڕۆ" value={formatCurrency(summary.today_debt_payments)} icon={<DollarSign className="w-5 h-5" />} color="emerald" />
            </div>

            {/* Mobile Debt List */}
            <div className="lg:hidden">
              {customersWithDebt.length === 0 ? (
                <Card>
                  <EmptyTable message="هیچ کڕیاری قەرزدار نییە" icon={<CreditCard className="w-12 h-12" />} />
                </Card>
              ) : (
                <DataList>
                  {customersWithDebt.map(customer => (
                    <DataListItem key={customer.id}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-indigo-600 font-mono">{customer.code}</p>
                          <p className="font-medium">{customer.name}</p>
                          <p className="text-xs text-slate-500">{customer.phone || '-'}</p>
                        </div>
                        <span className="font-semibold text-red-600">{formatCurrency(customer.balance?.balance_iqd || 0)}</span>
                      </div>
                    </DataListItem>
                  ))}
                </DataList>
              )}
            </div>

            {/* Desktop Debt Table */}
            <Card padding="none" className="hidden lg:block">
              {customersWithDebt.length === 0 ? (
                <EmptyTable message="هیچ کڕیاری قەرزدار نییە" icon={<CreditCard className="w-16 h-16" />} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>کۆد</TableHead>
                      <TableHead>ناو</TableHead>
                      <TableHead>ژمارە</TableHead>
                      <TableHead>قەرز (دینار)</TableHead>
                      <TableHead>قەرز (دۆلار)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customersWithDebt.map(customer => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-mono font-medium text-indigo-600">{customer.code}</TableCell>
                        <TableCell className="font-medium">{customer.name}</TableCell>
                        <TableCell>{customer.phone || '-'}</TableCell>
                        <TableCell className="text-red-600 font-semibold">{formatCurrency(customer.balance?.balance_iqd || 0)}</TableCell>
                        <TableCell>{customer.balance?.balance_usd ? `$${customer.balance.balance_usd.toLocaleString()}` : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </>
        )}

        {/* Product Sales Report */}
        {activeReport === 'product_sales' && (() => {
          const { saleItems } = useDataStore.getState();
          const productMap = new Map<string, { name: string; qty: number; revenue: number; cost: number }>();
          const todayItems = saleItems.filter(si => filteredSales.some(s => s.id === si.sale_id));
          todayItems.forEach(si => {
            const existing = productMap.get(si.product_id) || { name: si.product?.name || 'کاڵا', qty: 0, revenue: 0, cost: 0 };
            productMap.set(si.product_id, { name: existing.name, qty: existing.qty + si.quantity, revenue: existing.revenue + si.total_price, cost: existing.cost + si.cost_price * si.quantity });
          });
          const productStats = Array.from(productMap.entries()).map(([id, d]) => ({ id, ...d, profit: d.revenue - d.cost })).sort((a, b) => b.revenue - a.revenue);
          const totalRev = productStats.reduce((s, p) => s + p.revenue, 0);
          const totalProf = productStats.reduce((s, p) => s + p.profit, 0);

          return (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard title="کاڵای فرۆشراو" value={productStats.length} icon={<Package className="w-5 h-5" />} color="indigo" />
                <StatCard title="کۆی داهات" value={formatCurrency(totalRev)} icon={<DollarSign className="w-5 h-5" />} color="emerald" />
                <StatCard title="کۆی قازانج" value={formatCurrency(totalProf)} icon={<TrendingUp className="w-5 h-5" />} color="blue" />
              </div>

              {productStats.length === 0 ? (
                <Card><div className="text-center py-8 text-slate-500"><Package className="w-10 h-10 mx-auto mb-2 text-slate-300" /><p className="text-sm">هیچ فرۆشتنێکی کاڵا نییە</p></div></Card>
              ) : (
                <Card padding="none">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[500px]">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">#</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">کاڵا</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">بڕ</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">داهات</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">قازانج</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {productStats.map((p, i) => (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm text-slate-500">{i + 1}</td>
                            <td className="px-4 py-3 text-sm font-medium text-slate-900">{p.name}</td>
                            <td className="px-4 py-3 text-sm">{p.qty}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-indigo-600">{formatCurrency(p.revenue)}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-emerald-600">{formatCurrency(p.profit)}</td>
                            <td className="px-4 py-3 text-sm">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${totalRev > 0 ? (p.revenue / totalRev) * 100 : 0}%` }} />
                                </div>
                                <span className="text-xs text-slate-500">{totalRev > 0 ? ((p.revenue / totalRev) * 100).toFixed(1) : 0}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          );
        })()}

        {/* Inventory Report */}
        {activeReport === 'inventory' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard title="کاڵای چالاک" value={products.filter(p => p.status === 'active').length} icon={<Package className="w-5 h-5" />} color="indigo" />
              <StatCard title="کاڵای کەم" value={lowStockProducts.length} icon={<Package className="w-5 h-5" />} color={lowStockProducts.length > 0 ? 'red' : 'emerald'} />
              <StatCard title="کۆی یەکەی کۆگا" value={products.reduce((sum, p) => sum + p.stock_quantity, 0).toLocaleString()} icon={<Package className="w-5 h-5" />} color="blue" />
            </div>

            <Card>
              <h3 className="font-semibold mb-4 text-sm sm:text-base">کاڵاکانی کەم کۆگا</h3>
              {lowStockProducts.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">هەموو کاڵاکان کۆگایان باشە</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {lowStockProducts.map(product => (
                    <div key={product.id} className="flex items-center justify-between p-3 bg-red-50 rounded-xl">
                      <div>
                        <p className="font-medium text-slate-900 text-sm">{product.name}</p>
                        <p className="text-xs text-slate-500">{product.barcode}</p>
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-red-600 text-sm">{product.stock_quantity} {product.unit}</p>
                        <p className="text-xs text-slate-500">کەمترین: {product.low_stock_limit}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </PageContent>
    </div>
  );
}
