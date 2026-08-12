import { useMemo } from 'react';
import { AlertTriangle, BellRing, PackageX, ShieldAlert } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { Card } from '../ui/Card';

export function InventoryAlertsWidget() {
  const { getProducts } = useDataStore();
  const products = getProducts().filter((p) => p.status === 'active' && p.is_trackable);

  const data = useMemo(() => {
    const outOfStock = products.filter((p) => p.stock_quantity === 0);
    const lowStock = products.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_limit);
    const highValue = products.filter((p) => p.stock_quantity * p.cost_price >= 500000);
    return { outOfStock, lowStock, highValue };
  }, [products]);

  if (data.outOfStock.length === 0 && data.lowStock.length === 0 && data.highValue.length === 0) return null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <BellRing className="w-5 h-5 text-red-500" />
          ئاگاداری کۆگا
        </h3>
        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
          {data.outOfStock.length + data.lowStock.length}
        </span>
      </div>

      <div className="space-y-3">
        {data.outOfStock.length > 0 && (
          <div className="p-3 bg-red-50 rounded-xl border border-red-200">
            <div className="flex items-center gap-2 mb-2 text-red-700 font-semibold text-sm">
              <PackageX className="w-4 h-4" />
              تەواوبووەکان ({data.outOfStock.length})
            </div>
            <div className="space-y-1">
              {data.outOfStock.slice(0, 4).map((p) => (
                <div key={p.id} className="flex justify-between text-xs text-red-600">
                  <span>{p.name}</span>
                  <span>٠ {p.unit}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.lowStock.length > 0 && (
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
            <div className="flex items-center gap-2 mb-2 text-amber-700 font-semibold text-sm">
              <AlertTriangle className="w-4 h-4" />
              کەمەکان ({data.lowStock.length})
            </div>
            <div className="space-y-1">
              {data.lowStock.slice(0, 4).map((p) => (
                <div key={p.id} className="flex justify-between text-xs text-amber-700">
                  <span>{p.name}</span>
                  <span>{p.stock_quantity} / {p.low_stock_limit}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.highValue.length > 0 && (
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
            <div className="flex items-center gap-2 mb-2 text-blue-700 font-semibold text-sm">
              <ShieldAlert className="w-4 h-4" />
              کۆگای بەرز نرخ ({data.highValue.length})
            </div>
            <div className="space-y-1">
              {data.highValue.slice(0, 3).map((p) => (
                <div key={p.id} className="flex justify-between text-xs text-blue-700">
                  <span>{p.name}</span>
                  <span>{(p.stock_quantity * p.cost_price).toLocaleString()} د.ع</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
