import { useMemo } from 'react';
import { Package, Barcode, Tag, TrendingUp, Warehouse, Calendar, DollarSign, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { Modal } from '../ui/Modal';
import { Badge, StatusBadge } from '../ui/Badge';
import { cn } from '../../utils/cn';
import { format } from 'date-fns';
import type { Product } from '../../types';

function fmt(n: number): string { return `${n.toLocaleString()} د.ع`; }

interface Props { isOpen: boolean; onClose: () => void; product: Product | null; }

export function ProductDetailModal({ isOpen, onClose, product }: Props) {
  const { saleItems, getStockMovements, getCategories } = useDataStore();
  const categories = getCategories();
  const movements = getStockMovements();

  const data = useMemo(() => {
    if (!product) return null;
    const items = saleItems.filter(si => si.product_id === product.id);
    const totalSold = items.reduce((s, i) => s + i.quantity, 0);
    const totalRevenue = items.reduce((s, i) => s + i.total_price, 0);
    const totalProfit = items.reduce((s, i) => s + (i.total_price - i.cost_price * i.quantity), 0);
    const prodMovements = movements.filter(m => m.product_id === product.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const category = categories.find(c => c.id === product.category_id);
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    return { totalSold, totalRevenue, totalProfit, profitMargin, prodMovements, category };
  }, [product, saleItems, movements, categories]);

  if (!product || !data) return null;

  const mvtLabels: Record<string, string> = {
    opening_stock: 'کۆگای دەستپێک', sale: 'فرۆشتن', purchase: 'کڕین',
    adjustment: 'ڕێکخستنەوە', damage: 'زیان', lost: 'ون', return: 'گەڕاوە', transfer: 'گواستنەوە',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={product.name} size="xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Package className="w-8 h-8 text-indigo-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-bold text-slate-900">{product.name}</h3>
              <StatusBadge status={product.status} />
            </div>
            {product.name_en && <p className="text-sm text-slate-500">{product.name_en}</p>}
            <div className="flex flex-wrap gap-3 text-sm text-slate-600 mt-1">
              <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{data.category?.name || '-'}</span>
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(product.created_at), 'yyyy/MM/dd')}</span>
            </div>
            {/* All Barcodes */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(product.barcodes && product.barcodes.length > 0 ? product.barcodes : [product.barcode]).map((bc, i) => (
                <span key={i} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-xs", bc === product.barcode ? "bg-indigo-100 text-indigo-700 font-semibold" : "bg-slate-100 text-slate-600")}>
                  <Barcode className="w-3 h-3" />{bc}
                  {bc === product.barcode && <span className="text-[9px]">●</span>}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-indigo-50 rounded-xl text-center">
            <DollarSign className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-indigo-600">{fmt(product.sale_price)}</p>
            <p className="text-[10px] text-slate-500">نرخی فرۆشتن</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl text-center">
            <DollarSign className="w-5 h-5 text-slate-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-600">{fmt(product.cost_price)}</p>
            <p className="text-[10px] text-slate-500">نرخی کڕین</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-center">
            <TrendingUp className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-emerald-600">{data.profitMargin.toFixed(1)}%</p>
            <p className="text-[10px] text-slate-500">ڕێژەی قازانج</p>
          </div>
          <div className={cn("p-3 rounded-xl text-center", product.stock_quantity <= product.low_stock_limit ? "bg-red-50" : "bg-blue-50")}>
            <Warehouse className="w-5 h-5 mx-auto mb-1" style={{color: product.stock_quantity <= product.low_stock_limit ? '#ef4444' : '#3b82f6'}} />
            <p className={cn("text-lg font-bold", product.stock_quantity <= product.low_stock_limit ? "text-red-600" : "text-blue-600")}>{product.stock_quantity}</p>
            <p className="text-[10px] text-slate-500">{product.unit} لە کۆگا</p>
          </div>
        </div>

        {/* Sales Stats */}
        <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl">
          <h4 className="font-semibold text-sm mb-3">📊 ئاماری فرۆشتن</h4>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><p className="text-xl font-bold text-emerald-700">{data.totalSold}</p><p className="text-xs text-slate-500">یەکەی فرۆشراو</p></div>
            <div><p className="text-xl font-bold text-emerald-700">{fmt(data.totalRevenue)}</p><p className="text-xs text-slate-500">کۆی داهات</p></div>
            <div><p className="text-xl font-bold text-emerald-700">{fmt(data.totalProfit)}</p><p className="text-xs text-slate-500">کۆی قازانج</p></div>
          </div>
        </div>

        {/* Stock Movements */}
        <div>
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Warehouse className="w-4 h-4 text-indigo-600" /> مێژووی جوڵەی کۆگا
          </h4>
          {data.prodMovements.length === 0 ? (
            <p className="text-center py-4 text-slate-400 text-sm">هیچ جوڵەیەک نییە</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data.prodMovements.slice(0, 15).map(m => (
                <div key={m.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl text-sm">
                  <div className="flex items-center gap-2">
                    {m.quantity > 0 ? <ArrowUpCircle className="w-4 h-4 text-emerald-500" /> : <ArrowDownCircle className="w-4 h-4 text-red-500" />}
                    <div>
                      <Badge variant={m.quantity > 0 ? 'success' : 'danger'} size="sm">{mvtLabels[m.type] || m.type}</Badge>
                      <p className="text-xs text-slate-400 mt-0.5">{format(new Date(m.created_at), 'MM/dd HH:mm')}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <span className={cn("font-semibold", m.quantity > 0 ? "text-emerald-600" : "text-red-600")}>
                      {m.quantity > 0 ? '+' : ''}{m.quantity}
                    </span>
                    <p className="text-xs text-slate-400">→ {m.stock_after}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
