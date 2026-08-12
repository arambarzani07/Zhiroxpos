// ==============================================
// ZHIROX - Customer Insights Widget
// تایبەتمەندی: تەحلیلی کڕیاران
// ==============================================

import { useMemo } from 'react';
import { Users, Crown, UserCheck, UserX, ShoppingBag } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { cn } from '../../utils/cn';

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} د.ع`;
}

interface CustomerStat {
  customerId: string;
  name: string;
  totalSpent: number;
  salesCount: number;
  avgTransaction: number;
  lastPurchase: Date | null;
  debtAmount: number;
}

export function CustomerInsightsWidget() {
  const { getCustomers, getCustomerBalance, getSales } = useDataStore();
  const customers = getCustomers();
  const sales = getSales().filter(s => s.status === 'completed');

  const insights = useMemo(() => {
    const stats: CustomerStat[] = customers.map(customer => {
      const customerSales = sales.filter(s => s.customer_id === customer.id);
      const totalSpent = customerSales.reduce((sum, s) => sum + s.total_amount, 0);
      const balance = getCustomerBalance(customer.id);
      const lastSale = customerSales.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      return {
        customerId: customer.id,
        name: customer.name,
        totalSpent,
        salesCount: customerSales.length,
        avgTransaction: customerSales.length > 0 ? totalSpent / customerSales.length : 0,
        lastPurchase: lastSale ? new Date(lastSale.created_at) : null,
        debtAmount: balance?.balance_iqd || 0,
      };
    }).sort((a, b) => b.totalSpent - a.totalSpent);

    const topCustomers = stats.filter(s => s.salesCount > 0).slice(0, 5);
    const newCustomers = customers.filter(c => {
      const d = new Date(c.created_at);
      const week = new Date();
      week.setDate(week.getDate() - 7);
      return d >= week;
    });
    const totalRevFromCustomers = stats.reduce((s, c) => s + c.totalSpent, 0);
    const activeCount = stats.filter(s => s.salesCount > 0).length;
    const inactiveCount = customers.length - activeCount;

    return {
      topCustomers,
      newCustomers,
      totalRevFromCustomers,
      activeCount,
      inactiveCount,
      totalCustomers: customers.length,
    };
  }, [customers, sales, getCustomerBalance]);

  const rankEmojis = ['👑', '🥈', '🥉', '4️⃣', '5️⃣'];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 p-4 text-white">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-5 h-5" />
          <h3 className="font-semibold">تەحلیلی کڕیاران</h3>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-white/10 rounded-lg p-2 text-center">
            <p className="text-lg font-bold">{insights.totalCustomers}</p>
            <p className="text-[10px] text-white/70">کۆی کڕیار</p>
          </div>
          <div className="bg-white/10 rounded-lg p-2 text-center">
            <p className="text-lg font-bold">{insights.activeCount}</p>
            <p className="text-[10px] text-white/70">چالاک</p>
          </div>
          <div className="bg-white/10 rounded-lg p-2 text-center">
            <p className="text-lg font-bold">{insights.newCustomers.length}</p>
            <p className="text-[10px] text-white/70">نوێ</p>
          </div>
        </div>
      </div>

      {/* VIP Customers */}
      <div className="p-4">
        <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-500" />
          VIP کڕیاران
        </h4>
        
        {insights.topCustomers.length === 0 ? (
          <div className="text-center py-4 text-slate-500">
            <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs">هێشتا کڕینێک نییە</p>
          </div>
        ) : (
          <div className="space-y-2">
            {insights.topCustomers.map((customer, index) => (
              <div
                key={customer.customerId}
                className={cn(
                  'flex items-center justify-between p-3 rounded-xl',
                  index === 0 ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{rankEmojis[index]}</span>
                  <div>
                    <p className="font-medium text-slate-900 text-sm">{customer.name}</p>
                    <p className="text-xs text-slate-500">
                      {customer.salesCount} کڕین • تێکڕا {formatCurrency(Math.round(customer.avgTransaction))}
                    </p>
                  </div>
                </div>
                <div className="text-left">
                  <p className="font-bold text-slate-900 text-sm">
                    {formatCurrency(customer.totalSpent)}
                  </p>
                  {customer.debtAmount > 0 && (
                    <p className="text-[10px] text-red-500">
                      قەرز: {formatCurrency(customer.debtAmount)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Customer Mix */}
      <div className="px-4 pb-4">
        <div className="p-3 bg-gradient-to-r from-violet-50 to-fuchsia-50 rounded-xl">
          <div className="flex justify-between text-sm mb-2">
            <span className="flex items-center gap-1 text-emerald-700">
              <UserCheck className="w-3 h-3" /> چالاک
            </span>
            <span className="flex items-center gap-1 text-slate-500">
              <UserX className="w-3 h-3" /> ناچالاک
            </span>
          </div>
          <div className="h-3 bg-slate-200 rounded-full overflow-hidden flex">
            <div
              className="bg-emerald-500 rounded-r-full"
              style={{ 
                width: `${insights.totalCustomers > 0 ? (insights.activeCount / insights.totalCustomers) * 100 : 0}%` 
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>{insights.activeCount}</span>
            <span>{insights.inactiveCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
