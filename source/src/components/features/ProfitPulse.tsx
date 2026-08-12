// ==============================================
// ZHIROX - Profit Pulse Widget
// تایبەتمەندی: لێدانی قازانج - پیشاندانی قازانج بە شێوەی زیندوو
// ==============================================

import { useMemo } from 'react';
import { TrendingUp, ArrowUp } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { cn } from '../../utils/cn';

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} د.ع`;
}

export function ProfitPulseWidget() {
  const { getSales, saleItems } = useDataStore();
  const allSales = getSales().filter(s => s.status === 'completed');
  const allItems = saleItems;

  const analytics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySales = allSales.filter(s => {
      const d = new Date(s.created_at);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    });

    const todayItems = allItems.filter(si =>
      todaySales.some(s => s.id === si.sale_id)
    );

    const totalRevenue = todaySales.reduce((s, sale) => s + sale.total_amount, 0);
    const totalCost = todayItems.reduce((s, si) => s + si.cost_price * si.quantity, 0);
    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const avgTransaction = todaySales.length > 0 ? totalRevenue / todaySales.length : 0;

    // Most profitable items
    const itemProfits = todayItems.map(si => ({
      name: si.product?.name || 'کاڵا',
      revenue: si.total_price,
      cost: si.cost_price * si.quantity,
      profit: si.total_price - si.cost_price * si.quantity,
      margin: si.total_price > 0 ? ((si.total_price - si.cost_price * si.quantity) / si.total_price) * 100 : 0,
      qty: si.quantity,
    })).sort((a, b) => b.profit - a.profit);

    // Top 5 most profitable
    const topItems = itemProfits.slice(0, 5);

    // Profit segments
    const cashProfit = todaySales
      .filter(s => s.payment_type === 'cash')
      .reduce((sum, s) => sum + s.total_amount, 0);
    const debtSales = todaySales
      .filter(s => s.payment_type === 'debt' || s.payment_type === 'mixed')
      .reduce((sum, s) => sum + s.debt_amount, 0);

    return {
      totalRevenue,
      totalCost,
      totalProfit,
      profitMargin,
      avgTransaction,
      topItems,
      cashProfit,
      debtSales,
      salesCount: todaySales.length,
      itemsSold: todayItems.reduce((s, si) => s + si.quantity, 0),
    };
  }, [allSales, allItems]);

  const profitLevel = analytics.profitMargin >= 30 ? 'excellent' 
    : analytics.profitMargin >= 20 ? 'good' 
    : analytics.profitMargin >= 10 ? 'fair' 
    : 'low';

  const levelConfig = {
    excellent: { label: 'نایاب', color: 'emerald', emoji: '🔥' },
    good: { label: 'باش', color: 'blue', emoji: '✅' },
    fair: { label: 'مامناوەند', color: 'amber', emoji: '⚠️' },
    low: { label: 'کەم', color: 'red', emoji: '📉' },
  };

  const config = levelConfig[profitLevel];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className={cn(
        'p-4',
        `bg-gradient-to-r from-${config.color}-500 to-${config.color}-600`
      )} style={{
        background: profitLevel === 'excellent' ? 'linear-gradient(to left, #10b981, #059669)' :
                    profitLevel === 'good' ? 'linear-gradient(to left, #3b82f6, #2563eb)' :
                    profitLevel === 'fair' ? 'linear-gradient(to left, #f59e0b, #d97706)' :
                    'linear-gradient(to left, #ef4444, #dc2626)'
      }}>
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            <h3 className="font-semibold">لێدانی قازانج</h3>
          </div>
          <span className="text-2xl">{config.emoji}</span>
        </div>
        <div className="mt-3">
          <p className="text-3xl font-black text-white">
            {formatCurrency(analytics.totalProfit)}
          </p>
          <div className="flex items-center gap-3 mt-1 text-white/80 text-sm">
            <span>ڕێژەی قازانج: {analytics.profitMargin.toFixed(1)}%</span>
            <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">
              {config.label}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-px bg-slate-100">
        <div className="bg-white p-3 text-center">
          <p className="text-xs text-slate-500 mb-1">داهات</p>
          <p className="font-bold text-slate-900">{formatCurrency(analytics.totalRevenue)}</p>
        </div>
        <div className="bg-white p-3 text-center">
          <p className="text-xs text-slate-500 mb-1">تێچوو</p>
          <p className="font-bold text-slate-900">{formatCurrency(analytics.totalCost)}</p>
        </div>
        <div className="bg-white p-3 text-center">
          <p className="text-xs text-slate-500 mb-1">تێکڕای وەسڵ</p>
          <p className="font-bold text-slate-900">{formatCurrency(Math.round(analytics.avgTransaction))}</p>
        </div>
        <div className="bg-white p-3 text-center">
          <p className="text-xs text-slate-500 mb-1">یەکەی فرۆشراو</p>
          <p className="font-bold text-slate-900">{analytics.itemsSold}</p>
        </div>
      </div>

      {/* Cash vs Debt */}
      <div className="p-4">
        <p className="text-xs text-slate-500 mb-2">نەقد بەرامبەر قەرز</p>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
          <div
            className="bg-emerald-500 rounded-r-full"
            style={{ width: `${analytics.totalRevenue > 0 ? (analytics.cashProfit / analytics.totalRevenue) * 100 : 0}%` }}
          />
          <div
            className="bg-red-400"
            style={{ width: `${analytics.totalRevenue > 0 ? (analytics.debtSales / analytics.totalRevenue) * 100 : 0}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs">
          <span className="text-emerald-600">نەقد {formatCurrency(analytics.cashProfit)}</span>
          <span className="text-red-500">قەرز {formatCurrency(analytics.debtSales)}</span>
        </div>
      </div>

      {/* Top Profitable Items */}
      {analytics.topItems.length > 0 && (
        <div className="p-4 pt-0">
          <p className="text-xs text-slate-500 mb-2">باشترین قازانج</p>
          <div className="space-y-2">
            {analytics.topItems.slice(0, 3).map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-indigo-100 text-indigo-600 text-xs font-bold rounded flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-slate-700 truncate max-w-[140px]">{item.name}</span>
                </div>
                <div className="flex items-center gap-1 text-emerald-600 font-medium">
                  <ArrowUp className="w-3 h-3" />
                  {formatCurrency(item.profit)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
