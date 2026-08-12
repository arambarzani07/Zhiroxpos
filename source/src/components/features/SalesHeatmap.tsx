// ==============================================
// ZHIROX - Sales Heatmap
// تایبەتمەندی: نەخشەی گەرمی فرۆشتن بە پێی کات
// ==============================================

import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { cn } from '../../utils/cn';

const hourLabels = Array.from({ length: 24 }, (_, i) => 
  `${i.toString().padStart(2, '0')}:00`
);

const dayLabels = ['یەکشەممە', 'دووشەممە', 'سێشەممە', 'چوارشەممە', 'پێنجشەممە', 'هەینی', 'شەممە'];
const dayLabelsShort = ['یەک', 'دوو', 'سێ', 'چوار', 'پێنج', 'هەی', 'شەم'];

export function SalesHeatmapWidget() {
  const { getSales } = useDataStore();
  const sales = getSales().filter(s => s.status === 'completed');

  const heatmapData = useMemo(() => {
    // 7 days × 24 hours grid
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

    sales.forEach(sale => {
      const date = new Date(sale.created_at);
      const day = date.getDay();
      const hour = date.getHours();
      grid[day][hour] += sale.total_amount;
    });

    // Find max for color scaling
    let max = 0;
    grid.forEach(row => row.forEach(val => { if (val > max) max = val; }));

    return { grid, max };
  }, [sales]);

  const getColor = (value: number) => {
    if (value === 0) return 'bg-slate-100';
    const intensity = heatmapData.max > 0 ? value / heatmapData.max : 0;
    if (intensity > 0.75) return 'bg-indigo-600';
    if (intensity > 0.5) return 'bg-indigo-500';
    if (intensity > 0.25) return 'bg-indigo-400';
    if (intensity > 0.1) return 'bg-indigo-300';
    return 'bg-indigo-200';
  };

  // Busiest hour
  const busiestHour = useMemo(() => {
    const hourTotals = Array(24).fill(0);
    heatmapData.grid.forEach(row => {
      row.forEach((val, hour) => { hourTotals[hour] += val; });
    });
    const maxHour = hourTotals.indexOf(Math.max(...hourTotals));
    return maxHour;
  }, [heatmapData]);

  // Focus on business hours (6 AM - 11 PM)
  const startHour = 6;
  const endHour = 23;
  const visibleHours = Array.from({ length: endHour - startHour + 1 }, (_, i) => i + startHour);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-600" />
          نەخشەی گەرمی فرۆشتن
        </h3>
        {sales.length > 0 && (
          <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
            پڕترین: {hourLabels[busiestHour]}
          </span>
        )}
      </div>

      {sales.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <Clock className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">داتای فرۆشتن پێویستە بۆ پیشاندانی نەخشە</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[500px]">
            {/* Hour Labels */}
            <div className="flex mr-14 mb-1">
              {visibleHours.filter((_, i) => i % 3 === 0).map(hour => (
                <div
                  key={hour}
                  className="text-[10px] text-slate-400 text-center"
                  style={{ width: `${(3 / visibleHours.length) * 100}%` }}
                >
                  {hour}:00
                </div>
              ))}
            </div>

            {/* Grid */}
            {heatmapData.grid.map((row, dayIndex) => (
              <div key={dayIndex} className="flex items-center gap-1 mb-1">
                <span className="text-[10px] text-slate-500 w-12 text-left flex-shrink-0">
                  {dayLabelsShort[dayIndex]}
                </span>
                <div className="flex gap-[2px] flex-1">
                  {visibleHours.map(hour => (
                    <div
                      key={hour}
                      className={cn(
                        'flex-1 h-5 rounded-sm transition-colors cursor-pointer',
                        getColor(row[hour])
                      )}
                      title={`${dayLabels[dayIndex]} ${hourLabels[hour]} - ${row[hour].toLocaleString()} د.ع`}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Legend */}
            <div className="flex items-center justify-end gap-2 mt-3">
              <span className="text-[10px] text-slate-400">کەم</span>
              <div className="flex gap-[2px]">
                {['bg-slate-100', 'bg-indigo-200', 'bg-indigo-300', 'bg-indigo-400', 'bg-indigo-500', 'bg-indigo-600'].map((c, i) => (
                  <div key={i} className={cn('w-4 h-3 rounded-sm', c)} />
                ))}
              </div>
              <span className="text-[10px] text-slate-400">زۆر</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
