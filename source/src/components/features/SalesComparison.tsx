// ==============================================
// ZHIROX - Sales Comparison Widget
// تایبەتمەندی: بەراوردکردنی فرۆشتن
// ==============================================

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { cn } from '../../utils/cn';

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} د.ع`;
}

interface ComparisonItem {
  label: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
}

export function SalesComparisonWidget() {
  const { getSales, getDashboardSummary } = useDataStore();
  const summary = getDashboardSummary();
  const allSales = getSales().filter(s => s.status === 'completed');

  const comparison = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Yesterday's sales
    const yesterdaySales = allSales.filter(s => {
      const saleDate = new Date(s.created_at);
      return saleDate >= yesterday && saleDate < today;
    });

    // Last week same day sales
    const lastWeekSales = allSales.filter(s => {
      const saleDate = new Date(s.created_at);
      const lwStart = new Date(lastWeek.getFullYear(), lastWeek.getMonth(), lastWeek.getDate());
      const lwEnd = new Date(lwStart.getTime() + 24 * 60 * 60 * 1000);
      return saleDate >= lwStart && saleDate < lwEnd;
    });

    const yesterdayTotal = yesterdaySales.reduce((sum, s) => sum + s.total_amount, 0);
    const lastWeekTotal = lastWeekSales.reduce((sum, s) => sum + s.total_amount, 0);

    const items: ComparisonItem[] = [
      {
        label: 'بەراورد بە دوێنێ',
        current: summary.today_sales,
        previous: yesterdayTotal,
        change: summary.today_sales - yesterdayTotal,
        changePercent: yesterdayTotal > 0 
          ? ((summary.today_sales - yesterdayTotal) / yesterdayTotal) * 100 
          : 0,
      },
      {
        label: 'بەراورد بە هەفتەی پێشوو',
        current: summary.today_sales,
        previous: lastWeekTotal,
        change: summary.today_sales - lastWeekTotal,
        changePercent: lastWeekTotal > 0 
          ? ((summary.today_sales - lastWeekTotal) / lastWeekTotal) * 100 
          : 0,
      },
    ];

    return items;
  }, [allSales, summary.today_sales]);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-indigo-600" />
        بەراوردکردنی فرۆشتن
      </h3>

      <div className="space-y-4">
        {comparison.map((item, index) => {
          const isPositive = item.change > 0;
          const isNeutral = item.change === 0;

          return (
            <div key={index} className="p-3 bg-slate-50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-600">{item.label}</span>
                <div className={cn(
                  'flex items-center gap-1 text-sm font-medium',
                  isNeutral ? 'text-slate-500' :
                  isPositive ? 'text-emerald-600' : 'text-red-600'
                )}>
                  {isNeutral ? (
                    <Minus className="w-4 h-4" />
                  ) : isPositive ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  {Math.abs(item.changePercent).toFixed(1)}%
                </div>
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-slate-500">ئەمڕۆ</p>
                  <p className="text-lg font-bold text-slate-900">{formatCurrency(item.current)}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-slate-500">پێشوو</p>
                  <p className="text-sm text-slate-600">{formatCurrency(item.previous)}</p>
                </div>
              </div>

              {/* Difference */}
              <div className={cn(
                'mt-2 pt-2 border-t border-slate-200 text-sm',
                isNeutral ? 'text-slate-500' :
                isPositive ? 'text-emerald-600' : 'text-red-600'
              )}>
                {isPositive ? '+' : ''}{formatCurrency(item.change)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Stats */}
      <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3">
        <div className="text-center p-2 bg-indigo-50 rounded-lg">
          <p className="text-2xl font-bold text-indigo-600">{summary.receipt_count}</p>
          <p className="text-xs text-slate-500">وەسڵی ئەمڕۆ</p>
        </div>
        <div className="text-center p-2 bg-emerald-50 rounded-lg">
          <p className="text-2xl font-bold text-emerald-600">
            {summary.receipt_count > 0 
              ? formatCurrency(Math.round(summary.today_sales / summary.receipt_count))
              : '0'
            }
          </p>
          <p className="text-xs text-slate-500">تێکڕای وەسڵ</p>
        </div>
      </div>
    </div>
  );
}
