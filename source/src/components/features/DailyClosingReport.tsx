import { useMemo } from 'react';
import { Printer, DollarSign, Package, TrendingUp, ArrowDown, ArrowUp } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { format } from 'date-fns';

function fmt(n: number) { return `${n.toLocaleString()} د.ع`; }

export function DailyClosingReport({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, market } = useAuthStore();
  const { getDashboardSummary, getSales, saleItems, getDebtTransactions, getStockMovements, getLowStockProducts } = useDataStore();
  const summary = getDashboardSummary();

  const data = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sales = getSales().filter(s => s.status === 'completed' && new Date(s.created_at) >= today);
    const items = saleItems.filter(si => sales.some(s => s.id === si.sale_id));
    const totalCost = items.reduce((s, i) => s + i.cost_price * i.quantity, 0);
    const totalRevenue = sales.reduce((s, sale) => s + sale.total_amount, 0);
    const totalProfit = totalRevenue - totalCost;
    const cashSales = sales.filter(s => s.payment_type === 'cash').length;
    const debtSales = sales.filter(s => s.payment_type === 'debt' || s.payment_type === 'mixed').length;
    const cancelledSales = getSales().filter(s => s.status === 'cancelled' && new Date(s.created_at) >= today).length;
    const debtTxs = getDebtTransactions().filter(d => new Date(d.created_at) >= today);
    const debtAdded = debtTxs.filter(d => d.type === 'debt_added').reduce((s, d) => s + Math.abs(d.amount), 0);
    const debtPaid = debtTxs.filter(d => d.type === 'debt_payment').reduce((s, d) => s + Math.abs(d.amount), 0);
    const stockMoves = getStockMovements().filter(m => new Date(m.created_at) >= today);
    const lowStock = getLowStockProducts();
    const topProducts = Object.entries(items.reduce((acc, i) => {
      acc[i.product_id] = acc[i.product_id] || { name: i.product?.name || '?', qty: 0, revenue: 0 };
      acc[i.product_id].qty += i.quantity;
      acc[i.product_id].revenue += i.total_price;
      return acc;
    }, {} as Record<string, { name: string; qty: number; revenue: number }>)).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);

    return {
      sales, totalRevenue, totalCost, totalProfit, cashSales, debtSales, cancelledSales,
      debtAdded, debtPaid, stockMoves, lowStock, topProducts,
      profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue * 100) : 0,
      avgSale: sales.length > 0 ? totalRevenue / sales.length : 0,
      itemsSold: items.reduce((s, i) => s + i.quantity, 0),
    };
  }, [getSales, saleItems, getDebtTransactions, getStockMovements, getLowStockProducts, summary]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ڕاپۆرتی داخستنی ڕۆژ" size="xl">
      <div className="print-area" id="daily-report">
        {/* Header */}
        <div className="text-center mb-6 pb-4 border-b-2 border-dashed">
          <h1 className="text-2xl font-black">{market?.name || 'ZHIROX'}</h1>
          <p className="text-sm text-slate-500">ڕاپۆرتی داخستنی ڕۆژ</p>
          <p className="text-xs text-slate-400 mt-1">{format(new Date(), 'yyyy/MM/dd')} • {user?.full_name}</p>
        </div>

        {/* Main Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="p-3 bg-indigo-50 rounded-xl text-center">
            <DollarSign className="w-5 h-5 text-indigo-600 mx-auto mb-1" />
            <p className="text-xl font-bold text-indigo-700">{fmt(data.totalRevenue)}</p>
            <p className="text-[10px] text-slate-500">کۆی فرۆشتن</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-center">
            <TrendingUp className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
            <p className="text-xl font-bold text-emerald-700">{fmt(data.totalProfit)}</p>
            <p className="text-[10px] text-slate-500">قازانج ({data.profitMargin.toFixed(1)}%)</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl text-center">
            <Package className="w-5 h-5 text-blue-600 mx-auto mb-1" />
            <p className="text-xl font-bold text-blue-700">{data.itemsSold}</p>
            <p className="text-[10px] text-slate-500">یەکەی فرۆشراو</p>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-3 mb-6">
          <h4 className="font-semibold text-sm text-slate-700 border-b pb-1">وردەکاری فرۆشتن</h4>
          {[
            ['ژمارەی وەسڵ', data.sales.length.toString()],
            ['فرۆشتنی نەقد', `${data.cashSales} وەسڵ - ${fmt(summary.today_cash)}`],
            ['فرۆشتنی قەرز', `${data.debtSales} وەسڵ - ${fmt(summary.today_debt_added)}`],
            ['فرۆشتنی هەڵوەشێنراو', data.cancelledSales.toString()],
            ['تێکڕای وەسڵ', fmt(Math.round(data.avgSale))],
          ].map(([label, value], i) => (
            <div key={i} className="flex justify-between text-sm py-1 border-b border-slate-100">
              <span className="text-slate-600">{label}</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </div>

        {/* Debt */}
        <div className="space-y-3 mb-6">
          <h4 className="font-semibold text-sm text-slate-700 border-b pb-1">قەرز</h4>
          <div className="flex justify-between text-sm py-1 border-b border-slate-100">
            <span className="text-slate-600 flex items-center gap-1"><ArrowUp className="w-3 h-3 text-red-500" /> قەرزی نوێ</span>
            <span className="font-medium text-red-600">{fmt(data.debtAdded)}</span>
          </div>
          <div className="flex justify-between text-sm py-1 border-b border-slate-100">
            <span className="text-slate-600 flex items-center gap-1"><ArrowDown className="w-3 h-3 text-emerald-500" /> پارەدانی قەرز</span>
            <span className="font-medium text-emerald-600">{fmt(data.debtPaid)}</span>
          </div>
          <div className="flex justify-between text-sm py-1 font-bold">
            <span>کۆی قەرزی کڕیاران</span>
            <span className="text-red-600">{fmt(summary.total_customer_debt)}</span>
          </div>
        </div>

        {/* Top Products */}
        {data.topProducts.length > 0 && (
          <div className="mb-6">
            <h4 className="font-semibold text-sm text-slate-700 border-b pb-1 mb-3">باشترین فرۆشراو</h4>
            {data.topProducts.map(([id, p], i) => (
              <div key={id} className="flex justify-between text-sm py-1 border-b border-slate-100">
                <span>{i + 1}. {p.name} ({p.qty}×)</span>
                <span className="font-medium">{fmt(p.revenue)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Low Stock Warning */}
        {data.lowStock.length > 0 && (
          <div className="p-3 bg-amber-50 rounded-xl mb-6">
            <h4 className="text-sm font-semibold text-amber-700 mb-2">⚠ کاڵای کەم ({data.lowStock.length})</h4>
            <div className="text-xs text-amber-600 space-y-1">
              {data.lowStock.slice(0, 5).map(p => (
                <div key={p.id} className="flex justify-between">
                  <span>{p.name}</span>
                  <span className="font-medium">{p.stock_quantity} {p.unit}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary Box */}
        <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl text-center">
          <p className="text-sm text-slate-600 mb-1">خاڵەسەی ڕۆژ</p>
          <p className="text-3xl font-black text-indigo-700">{fmt(data.totalProfit)}</p>
          <p className="text-xs text-slate-500 mt-1">قازانجی خاوەن</p>
        </div>

        {/* Print */}
        <div className="mt-6 flex gap-3 no-print">
          <Button variant="secondary" className="flex-1" onClick={onClose}>داخستن</Button>
          <Button className="flex-1" leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>چاپکردن</Button>
        </div>
      </div>
    </Modal>
  );
}
