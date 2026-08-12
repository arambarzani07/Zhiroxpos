import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, History } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { cn } from '../../utils/cn';
import { format } from 'date-fns';

function fmt(n: number) { return `${n.toLocaleString()} د.ع`; }

interface PriceChange { date: string; oldPrice: number; newPrice: number; change: number; }

export function ProductPriceHistoryWidget({ productId }: { productId: string }) {
  const { getAuditLogs, getProductById } = useDataStore();
  const product = getProductById(productId);

  const priceHistory = useMemo(() => {
    const logs = getAuditLogs().filter(l =>
      l.module === 'products' && l.record_id === productId &&
      (l.action === 'products.update' || l.action === 'products.price_change')
    );

    const changes: PriceChange[] = [];
    logs.forEach(log => {
      const oldVal = log.old_value as any;
      const newVal = log.new_value as any;
      if (oldVal?.sale_price && newVal?.sale_price && oldVal.sale_price !== newVal.sale_price) {
        changes.push({
          date: log.created_at,
          oldPrice: oldVal.sale_price,
          newPrice: newVal.sale_price,
          change: newVal.sale_price - oldVal.sale_price,
        });
      }
    });

    return changes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [productId, getAuditLogs]);

  if (!product) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        <History className="w-4 h-4 text-indigo-600" />
        مێژووی نرخ
      </h4>

      <div className="p-3 bg-indigo-50 rounded-xl text-center">
        <p className="text-xs text-slate-500">نرخی ئێستا</p>
        <p className="text-2xl font-bold text-indigo-700">{fmt(product.sale_price)}</p>
      </div>

      {priceHistory.length === 0 ? (
        <p className="text-center text-xs text-slate-400 py-4">هیچ گۆڕانکارییەکی نرخ نییە</p>
      ) : (
        <div className="space-y-2">
          {priceHistory.map((change, i) => (
            <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-sm">
              <div className="flex items-center gap-2">
                {change.change > 0 ? (
                  <TrendingUp className="w-4 h-4 text-red-500" />
                ) : change.change < 0 ? (
                  <TrendingDown className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Minus className="w-4 h-4 text-slate-400" />
                )}
                <div>
                  <p className="text-xs text-slate-500">{format(new Date(change.date), 'MM/dd HH:mm')}</p>
                  <p className="text-xs"><span className="text-slate-400">{fmt(change.oldPrice)}</span> → <span className="font-medium">{fmt(change.newPrice)}</span></p>
                </div>
              </div>
              <span className={cn('text-xs font-bold', change.change > 0 ? 'text-red-600' : 'text-emerald-600')}>
                {change.change > 0 ? '+' : ''}{fmt(change.change)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
