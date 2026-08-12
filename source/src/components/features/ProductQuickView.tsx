import { Package, X, ShoppingCart } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { cn } from '../../utils/cn';
import type { Product } from '../../types';

function fmt(n: number) { return `${n.toLocaleString()} د.ع`; }

export function ProductQuickView({ product, onClose, onAddToCart }: { product: Product | null; onClose: () => void; onAddToCart?: (p: Product) => void }) {
  const { saleItems, getCategories } = useDataStore();
  const categories = getCategories();

  if (!product) return null;

  const category = categories.find(c => c.id === product.category_id);
  const soldQty = saleItems.filter(si => si.product_id === product.id).reduce((s, i) => s + i.quantity, 0);
  const profitMargin = product.cost_price > 0 ? ((product.sale_price - product.cost_price) / product.cost_price * 100) : 0;
  const isLow = product.stock_quantity <= product.low_stock_limit;

  return (
    <div className="fixed bottom-20 lg:bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 animate-slideUp overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-indigo-50 to-blue-50 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
            <Package className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">{product.name}</h3>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {category && <span>{category.name}</span>}
              <span className="font-mono">{product.barcode}</span>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-white/50 rounded-lg"><X className="w-4 h-4 text-slate-400" /></button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-px bg-slate-100">
        <div className="bg-white p-3 text-center">
          <p className="text-lg font-bold text-emerald-600">{fmt(product.sale_price)}</p>
          <p className="text-[9px] text-slate-400">نرخ</p>
        </div>
        <div className="bg-white p-3 text-center">
          <p className={cn("text-lg font-bold", isLow ? "text-red-600" : "text-slate-900")}>{product.stock_quantity}</p>
          <p className="text-[9px] text-slate-400">کۆگا</p>
        </div>
        <div className="bg-white p-3 text-center">
          <p className="text-lg font-bold text-blue-600">{soldQty}</p>
          <p className="text-[9px] text-slate-400">فرۆشراو</p>
        </div>
        <div className="bg-white p-3 text-center">
          <p className="text-lg font-bold text-purple-600">{profitMargin.toFixed(0)}%</p>
          <p className="text-[9px] text-slate-400">قازانج</p>
        </div>
      </div>

      {/* Action */}
      {onAddToCart && (
        <div className="p-3">
          <button onClick={() => { onAddToCart(product); onClose(); }} disabled={product.is_trackable && product.stock_quantity <= 0}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
            <ShoppingCart className="w-4 h-4" />
            زیادکردن بۆ سەبەتە
          </button>
        </div>
      )}
    </div>
  );
}
