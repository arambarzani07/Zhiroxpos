// ==============================================
// ZHIROX - Visual Charts Dashboard 📊
// داهێنان: گرافی ڤیژواڵ بۆ شیکاری فرۆشتن
// بێ هیچ کتێبخانەی دەرەکی - تەنها SVG خاوەن
// ==============================================

import { useMemo, useState } from 'react';
import { BarChart3, PieChart, Activity, TrendingUp, Calendar } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { Card } from '../ui/Card';
import { cn } from '../../utils/cn';
import { subDays, format } from 'date-fns';

function fmt(n: number) { return `${n.toLocaleString()} د.ع`; }

// ============ BAR CHART (SVG) ============
function BarChartSVG({ data, height = 200 }: { data: { label: string; value: number; color?: string }[]; height?: number }) {
  if (data.length === 0) return <p className="text-center text-sm text-slate-400 py-8">داتا نییە</p>;
  const max = Math.max(...data.map(d => d.value), 1);
  const barWidth = Math.min(40, Math.floor(280 / data.length));
  const gap = Math.max(4, Math.floor(20 / data.length));
  const totalWidth = data.length * (barWidth + gap);

  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(totalWidth + 40, 300)} height={height + 40} className="mx-auto">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
          <g key={i}>
            <line x1={30} y1={height - height * pct + 10} x2={totalWidth + 35} y2={height - height * pct + 10} stroke="#e2e8f0" strokeWidth={1} strokeDasharray={pct > 0 ? "4,4" : "0"} />
            <text x={28} y={height - height * pct + 14} textAnchor="end" fontSize={9} fill="#94a3b8">{Math.round(max * pct / 1000)}K</text>
          </g>
        ))}
        {/* Bars */}
        {data.map((d, i) => {
          const barH = (d.value / max) * (height - 20);
          const x = 35 + i * (barWidth + gap);
          return (
            <g key={i}>
              <rect x={x} y={height - barH + 10} width={barWidth} height={barH} rx={4} fill={d.color || '#6366f1'} className="transition-all duration-500 hover:opacity-80" />
              <text x={x + barWidth / 2} y={height + 28} textAnchor="middle" fontSize={8} fill="#64748b" className="select-none">{d.label}</text>
              <text x={x + barWidth / 2} y={height - barH + 5} textAnchor="middle" fontSize={8} fill="#6366f1" fontWeight="bold">{d.value > 0 ? `${Math.round(d.value / 1000)}K` : ''}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ============ LINE CHART (SVG) ============
function LineChartSVG({ data, height = 160 }: { data: { label: string; value: number }[]; height?: number }) {
  if (data.length < 2) return <p className="text-center text-sm text-slate-400 py-8">داتا نییە</p>;
  const max = Math.max(...data.map(d => d.value), 1);
  const width = 320;
  const padding = 35;
  const chartW = width - padding * 2;
  const chartH = height - 30;

  const points = data.map((d, i) => ({
    x: padding + (i / (data.length - 1)) * chartW,
    y: 10 + chartH - (d.value / max) * chartH,
    ...d,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${chartH + 10} L ${points[0].x} ${chartH + 10} Z`;

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height + 20} className="mx-auto">
        {/* Grid */}
        {[0, 0.5, 1].map((pct, i) => (
          <line key={i} x1={padding} y1={10 + chartH - chartH * pct} x2={width - padding} y2={10 + chartH - chartH * pct} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4,4" />
        ))}
        {/* Area */}
        <path d={areaPath} fill="url(#lineGrad)" opacity={0.15} />
        {/* Line */}
        <path d={linePath} fill="none" stroke="#6366f1" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4} fill="#6366f1" stroke="white" strokeWidth={2} />
            <text x={p.x} y={chartH + 28} textAnchor="middle" fontSize={8} fill="#64748b">{p.label}</text>
          </g>
        ))}
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

// ============ DONUT CHART (SVG) ============
function DonutChartSVG({ data, size = 160 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="text-center text-sm text-slate-400 py-8">داتا نییە</p>;
  const r = size / 2 - 15;
  const cx = size / 2;
  const cy = size / 2;
  let cumAngle = -90;

  const slices = data.map(d => {
    const angle = (d.value / total) * 360;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const largeArc = angle > 180 ? 1 : 0;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    return { ...d, path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`, pct: ((d.value / total) * 100).toFixed(0) };
  });

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={size} height={size}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} className="transition-all hover:opacity-80" stroke="white" strokeWidth={2} />
        ))}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="white" />
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize={18} fontWeight="bold" fill="#1e293b">{fmt(total)}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={9} fill="#94a3b8">کۆی گشتی</text>
      </svg>
      <div className="flex flex-wrap gap-2 justify-center">
        {slices.map((s, i) => (
          <span key={i} className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label} ({s.pct}%)
          </span>
        ))}
      </div>
    </div>
  );
}

// ============ MAIN WIDGET ============
type ChartTab = 'weekly' | 'category' | 'payment' | 'trend';

export function VisualChartsWidget() {
  const [activeTab, setActiveTab] = useState<ChartTab>('weekly');
  const { getSales, saleItems, getProducts, getCategories } = useDataStore();
  const sales = getSales().filter(s => s.status === 'completed');
  const products = getProducts();
  const categories = getCategories();

  // Weekly sales data
  const weeklyData = useMemo(() => {
    const days = ['یەک', 'دوو', 'سێ', 'چوار', 'پێنج', 'هەی', 'شەم'];
    return Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
      date.setHours(0, 0, 0, 0);
      const nextDay = new Date(date); nextDay.setDate(nextDay.getDate() + 1);
      const daySales = sales.filter(s => { const d = new Date(s.created_at); return d >= date && d < nextDay; });
      return { label: days[date.getDay()], value: daySales.reduce((s, sale) => s + sale.total_amount, 0) };
    });
  }, [sales]);

  // Category breakdown
  const categoryData = useMemo(() => {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];
    const catMap = new Map<string, number>();
    saleItems.forEach(si => {
      const prod = products.find(p => p.id === si.product_id);
      const catId = prod?.category_id || 'other';
      catMap.set(catId, (catMap.get(catId) || 0) + si.total_price);
    });
    return Array.from(catMap.entries())
      .map(([catId, value], i) => ({
        label: categories.find(c => c.id === catId)?.name || 'تر',
        value, color: colors[i % colors.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [saleItems, products, categories]);

  // Payment type breakdown
  const paymentData = useMemo(() => {
    const cash = sales.filter(s => s.payment_type === 'cash').reduce((sum, s) => sum + s.total_amount, 0);
    const debt = sales.filter(s => s.payment_type === 'debt').reduce((sum, s) => sum + s.total_amount, 0);
    const mixed = sales.filter(s => s.payment_type === 'mixed').reduce((sum, s) => sum + s.total_amount, 0);
    return [
      { label: 'کاش', value: cash, color: '#10b981' },
      { label: 'قەرز', value: debt, color: '#ef4444' },
      { label: 'تێکەڵ', value: mixed, color: '#f59e0b' },
    ].filter(d => d.value > 0);
  }, [sales]);

  // Sales trend (last 14 days)
  const trendData = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const date = subDays(new Date(), 13 - i);
      date.setHours(0, 0, 0, 0);
      const nextDay = new Date(date); nextDay.setDate(nextDay.getDate() + 1);
      const daySales = sales.filter(s => { const d = new Date(s.created_at); return d >= date && d < nextDay; });
      return { label: format(date, 'MM/dd'), value: daySales.reduce((s, sale) => s + sale.total_amount, 0) };
    });
  }, [sales]);

  const tabs = [
    { id: 'weekly' as const, label: 'هەفتانە', icon: BarChart3 },
    { id: 'category' as const, label: 'پۆلەکان', icon: PieChart },
    { id: 'payment' as const, label: 'پارەدان', icon: PieChart },
    { id: 'trend' as const, label: 'ترەند', icon: Activity },
  ];

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600" />
          گرافی ڤیژواڵ
        </h3>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
              activeTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100')}>
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Charts */}
      {activeTab === 'weekly' && (
        <div>
          <p className="text-xs text-slate-500 mb-3 flex items-center gap-1"><Calendar className="w-3 h-3" /> فرۆشتنی ٧ ڕۆژی دوایی</p>
          <BarChartSVG data={weeklyData} />
        </div>
      )}

      {activeTab === 'category' && (
        <div>
          <p className="text-xs text-slate-500 mb-3">فرۆشتن بە پێی پۆل</p>
          <DonutChartSVG data={categoryData} />
        </div>
      )}

      {activeTab === 'payment' && (
        <div>
          <p className="text-xs text-slate-500 mb-3">فرۆشتن بە پێی جۆری پارەدان</p>
          <DonutChartSVG data={paymentData} size={180} />
        </div>
      )}

      {activeTab === 'trend' && (
        <div>
          <p className="text-xs text-slate-500 mb-3 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> ترەندی ١٤ ڕۆژی دوایی</p>
          <LineChartSVG data={trendData} />
        </div>
      )}
    </Card>
  );
}
