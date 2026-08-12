import { useMemo, useState } from 'react';
import { ShoppingBasket, ClipboardCopy, Check, TrendingUp } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { toast } from '../ui/Toast';

interface ReorderSuggestion {
  productId: string;
  name: string;
  currentStock: number;
  lowLimit: number;
  soldLast7Days: number;
  suggestedQty: number;
  urgency: 'critical' | 'high' | 'normal';
  unit: string;
}

export function ReorderPlannerWidget() {
  const { getLowStockProducts, getSales, saleItems } = useDataStore();
  const [copied, setCopied] = useState(false);

  const suggestions = useMemo<ReorderSuggestion[]>(() => {
    const lowStock = getLowStockProducts();
    const sales = getSales();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentSales = sales.filter((s) => new Date(s.created_at) >= weekAgo && s.status === 'completed');

    return lowStock
      .map((product) => {
        const soldLast7Days = saleItems
          .filter((si) => si.product_id === product.id && recentSales.some((s) => s.id === si.sale_id))
          .reduce((sum, si) => sum + si.quantity, 0);

        const baseTarget = Math.max(product.low_stock_limit * 2, soldLast7Days + product.low_stock_limit);
        const suggestedQty = Math.max(0, Math.ceil(baseTarget - product.stock_quantity));
        const urgency: ReorderSuggestion['urgency'] =
          product.stock_quantity === 0 ? 'critical' :
          product.stock_quantity <= product.low_stock_limit / 2 ? 'high' : 'normal';

        return {
          productId: product.id,
          name: product.name,
          currentStock: product.stock_quantity,
          lowLimit: product.low_stock_limit,
          soldLast7Days,
          suggestedQty,
          urgency,
          unit: product.unit,
        };
      })
      .filter((s) => s.suggestedQty > 0)
      .sort((a, b) => {
        const order = { critical: 0, high: 1, normal: 2 };
        return order[a.urgency] - order[b.urgency] || b.soldLast7Days - a.soldLast7Days;
      });
  }, [getLowStockProducts, getSales, saleItems]);

  const totalSuggested = suggestions.reduce((sum, s) => sum + s.suggestedQty, 0);

  const handleCopy = async () => {
    const text = suggestions
      .map((s, i) => `${i + 1}. ${s.name} — ${s.suggestedQty} ${s.unit}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('لیستی داواکاری کۆپی کرا');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('کۆپی سەرنەکەوت');
    }
  };

  if (suggestions.length === 0) return null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <ShoppingBasket className="w-5 h-5 text-indigo-600" />
            پلانەری داواکاری
          </h3>
          <p className="text-xs text-slate-500 mt-1">پێشنیاری بڕی داواکاری بەپێی فرۆشتنی ٧ ڕۆژی دوایی</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleCopy} leftIcon={copied ? <Check className="w-4 h-4" /> : <ClipboardCopy className="w-4 h-4" />}>
          {copied ? 'کۆپیکرا' : 'کۆپی'}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 bg-indigo-50 rounded-xl text-center">
          <p className="text-xl font-bold text-indigo-700">{suggestions.length}</p>
          <p className="text-[10px] text-slate-500">کاڵای پێویست بە داواکاری</p>
        </div>
        <div className="p-3 bg-emerald-50 rounded-xl text-center">
          <p className="text-xl font-bold text-emerald-700">{totalSuggested}</p>
          <p className="text-[10px] text-slate-500">کۆی داواکاری</p>
        </div>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto">
        {suggestions.map((s) => (
          <div key={s.productId} className="p-3 rounded-xl border bg-slate-50 border-slate-200">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-medium text-slate-900 text-sm">{s.name}</p>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <TrendingUp className="w-3 h-3" />
                  فرۆشراو لە ٧ ڕۆژ: {s.soldLast7Days} {s.unit}
                </p>
              </div>
              <span className={
                s.urgency === 'critical'
                  ? 'px-2 py-0.5 text-[10px] rounded-full bg-red-100 text-red-700 font-bold'
                  : s.urgency === 'high'
                    ? 'px-2 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-700 font-bold'
                    : 'px-2 py-0.5 text-[10px] rounded-full bg-blue-100 text-blue-700 font-bold'
              }>
                {s.urgency === 'critical' ? 'بەپەلە' : s.urgency === 'high' ? 'گرنگ' : 'ئاسایی'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-white rounded-lg">
                <p className="text-sm font-bold text-slate-900">{s.currentStock}</p>
                <p className="text-[10px] text-slate-500">ئێستا</p>
              </div>
              <div className="p-2 bg-white rounded-lg">
                <p className="text-sm font-bold text-slate-900">{s.lowLimit}</p>
                <p className="text-[10px] text-slate-500">کەمترین</p>
              </div>
              <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-200">
                <p className="text-sm font-bold text-indigo-700">{s.suggestedQty}</p>
                <p className="text-[10px] text-indigo-600">داواکاری</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
