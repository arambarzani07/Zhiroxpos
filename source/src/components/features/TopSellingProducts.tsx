// ==============================================
// ZHIROX - Top Selling Products Widget
// تایبەتمەندی: باشترین کاڵاکانی فرۆشراو
// ==============================================

import { useMemo } from 'react';
import { Flame, Crown, Medal } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { cn } from '../../utils/cn';

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} د.ع`;
}

interface TopProduct {
  productId: string;
  name: string;
  totalQty: number;
  totalRevenue: number;
  unit: string;
}

export function TopSellingProductsWidget() {
  const { saleItems, getProducts } = useDataStore();
  const products = getProducts();

  const topProducts: TopProduct[] = useMemo(() => {
    const productMap = new Map<string, { qty: number; revenue: number }>();

    saleItems.forEach(si => {
      const existing = productMap.get(si.product_id) || { qty: 0, revenue: 0 };
      productMap.set(si.product_id, {
        qty: existing.qty + si.quantity,
        revenue: existing.revenue + si.total_price,
      });
    });

    return Array.from(productMap.entries())
      .map(([productId, data]) => {
        const product = products.find(p => p.id === productId);
        return {
          productId,
          name: product?.name || 'کاڵا',
          totalQty: data.qty,
          totalRevenue: data.revenue,
          unit: product?.unit || 'دانە',
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 5);
  }, [saleItems, products]);

  const maxRevenue = topProducts[0]?.totalRevenue || 1;

  const rankIcons = [
    <Crown className="w-4 h-4 text-amber-500" />,
    <Medal className="w-4 h-4 text-slate-400" />,
    <Medal className="w-4 h-4 text-amber-700" />,
  ];

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <Flame className="w-5 h-5 text-orange-500" />
        باشترین فرۆشراو
      </h3>

      {topProducts.length === 0 ? (
        <div className="text-center py-6 text-slate-500">
          <Flame className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">هێشتا فرۆشتنێک نییە</p>
        </div>
      ) : (
        <div className="space-y-3">
          {topProducts.map((product, index) => {
            const barWidth = (product.totalRevenue / maxRevenue) * 100;
            
            return (
              <div key={product.productId} className="relative">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 flex items-center justify-center">
                      {index < 3 ? rankIcons[index] : (
                        <span className="text-xs font-bold text-slate-400">{index + 1}</span>
                      )}
                    </div>
                    <span className="text-sm font-medium text-slate-700 truncate max-w-[150px]">
                      {product.name}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">
                    {formatCurrency(product.totalRevenue)}
                  </span>
                </div>
                
                {/* Bar */}
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden mr-8">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-700',
                      index === 0 ? 'bg-gradient-to-l from-amber-400 to-amber-500' :
                      index === 1 ? 'bg-gradient-to-l from-slate-300 to-slate-400' :
                      'bg-gradient-to-l from-indigo-300 to-indigo-400'
                    )}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                
                <p className="text-xs text-slate-400 mt-0.5 mr-8">
                  {product.totalQty} {product.unit} فرۆشراوە
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
