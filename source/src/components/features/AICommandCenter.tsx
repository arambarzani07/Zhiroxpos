// ==============================================
// ZHIROX - AI Command Center 🧠
// داهێنان: ناوەندی فرماندەی زیرەکی دەستکرد
// تەحلیل + پێشبینی + پێشنیار + خاڵبەندی بە AI
// ==============================================

import { useState, useMemo } from 'react';
import { Brain, Sparkles, TrendingUp, TrendingDown, AlertTriangle, Users, Package, CreditCard, ChevronDown, ChevronUp, Award, Clock } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { Modal } from '../ui/Modal';
import { cn } from '../../utils/cn';
import { format, subDays, differenceInDays } from 'date-fns';

function fmt(n: number) { return `${n.toLocaleString()} د.ع`; }

// ============ AI BRAIN ============
interface AIInsight {
  id: string;
  type: 'opportunity' | 'risk' | 'action' | 'prediction' | 'achievement';
  priority: number; // 1-10
  title: string;
  description: string;
  impact: string;
  action: string;
  confidence: number;
  icon: React.ElementType;
  color: string;
  metric?: { label: string; value: string; trend?: 'up' | 'down' | 'neutral' };
}

function useAIBrain(): { insights: AIInsight[]; score: number; grade: string; summary: string } {
  const { getDashboardSummary, getProducts, getCustomers, getCustomersWithDebt, getSales, saleItems, getLowStockProducts, getDebtTransactions, getCustomerBalance } = useDataStore();

  return useMemo(() => {
    const summary = getDashboardSummary();
    const products = getProducts().filter(p => p.status === 'active');
    const customers = getCustomers();
    const debtCustomers = getCustomersWithDebt();
    const sales = getSales().filter(s => s.status === 'completed');
    getLowStockProducts();
    getDebtTransactions();
    const now = new Date();
    const insights: AIInsight[] = [];

    // ===== 1. Sales Velocity Analysis =====
    const todaySales = sales.filter(s => {
      const d = new Date(s.created_at); d.setHours(0,0,0,0);
      const t = new Date(); t.setHours(0,0,0,0);
      return d.getTime() === t.getTime();
    });
    const yesterdaySales = sales.filter(s => {
      const d = new Date(s.created_at); d.setHours(0,0,0,0);
      const y = subDays(new Date(), 1); y.setHours(0,0,0,0);
      return d.getTime() === y.getTime();
    });
    const todayTotal = todaySales.reduce((s, sale) => s + sale.total_amount, 0);
    const yesterdayTotal = yesterdaySales.reduce((s, sale) => s + sale.total_amount, 0);
    const salesGrowth = yesterdayTotal > 0 ? ((todayTotal - yesterdayTotal) / yesterdayTotal * 100) : 0;

    if (salesGrowth > 20) {
      insights.push({
        id: 'sales-boom', type: 'achievement', priority: 9, title: '🚀 فرۆشتن لە بەرزترین ئاستدایە!',
        description: `فرۆشتنی ئەمڕۆ ${salesGrowth.toFixed(0)}% زیاترە لە دوێنێ`,
        impact: 'داهاتی زیاتر و پشتڕاستکردنەوەی ستراتیجی',
        action: 'ئەم ستراتیجیە بەردەوام بکە و کاڵاکانی پڕفرۆش زیاتر بکەوە',
        confidence: 92, icon: TrendingUp, color: 'emerald',
        metric: { label: 'گەشە', value: `+${salesGrowth.toFixed(0)}%`, trend: 'up' },
      });
    } else if (todayTotal === 0 && now.getHours() >= 12) {
      insights.push({
        id: 'no-sales', type: 'risk', priority: 10, title: '⚠️ هیچ فرۆشتنێک ئەمڕۆ نەکراوە!',
        description: 'نیوەی ڕۆژ تێپەڕیوە و هیچ فرۆشتنێک نییە',
        impact: 'لەدەستدانی داهاتی ڕۆژانە',
        action: 'بپشکنە ئایا مارکێت کراوەیە، کاشێر هەیە، کاڵا هەیە',
        confidence: 98, icon: AlertTriangle, color: 'red',
      });
    }

    // ===== 2. Dead Stock Detection =====
    const soldIds = new Set(saleItems.map(si => si.product_id));
    const deadStock = products.filter(p => !soldIds.has(p.id) && p.stock_quantity > 0);
    if (deadStock.length > 2) {
      const deadValue = deadStock.reduce((s, p) => s + p.cost_price * p.stock_quantity, 0);
      insights.push({
        id: 'dead-stock', type: 'risk', priority: 7, title: `📦 ${deadStock.length} کاڵا نەفرۆشراون`,
        description: `${fmt(deadValue)} سەرمایە لە کاڵای نەفرۆشراودا قفڵبووە`,
        impact: 'سەرمایەی مردوو - پارەی بێسوودە',
        action: 'داشکاندن بخەرەسەر یان وەک پاکێتی تایبەت بیفرۆشە',
        confidence: 85, icon: Package, color: 'amber',
        metric: { label: 'سەرمایەی مردوو', value: fmt(deadValue) },
      });
    }

    // ===== 3. Customer Behavior Intelligence =====
    const activeCustomers = customers.filter(c => {
      return sales.some(s => s.customer_id === c.id && differenceInDays(now, new Date(s.created_at)) <= 30);
    });
    const inactiveCustomers = customers.filter(c => c.status === 'active' && !activeCustomers.includes(c));
    if (inactiveCustomers.length > 2) {
      insights.push({
        id: 'lost-customers', type: 'opportunity', priority: 6, title: `👤 ${inactiveCustomers.length} کڕیار لەدەستچوون`,
        description: 'ئەم کڕیارانە لە مانگی ڕابردوودا هیچ کڕینیان نەکردووە',
        impact: 'لەدەستدانی داهاتی بەردەوام',
        action: 'پەیوەندی بکە و پێشکەشکراو یان داشکاندن بخەرەسەر',
        confidence: 78, icon: Users, color: 'purple',
        metric: { label: 'کڕیاری لەدەستچوو', value: inactiveCustomers.length.toString() },
      });
    }

    // ===== 4. Debt Risk Scoring =====
    const totalDebt = summary.total_customer_debt;
    const highRiskDebt = debtCustomers.filter(c => {
      const limit = c.debt_limit || Infinity;
      return (c.balance?.balance_iqd || 0) / limit > 0.8;
    });
    if (totalDebt > 300000) {
      insights.push({
        id: 'debt-risk', type: 'risk', priority: 8, title: '💳 قەرزی کڕیاران بەرزە',
        description: `کۆی قەرز: ${fmt(totalDebt)} - ${highRiskDebt.length} کڕیار نزیکی سنوورن`,
        impact: 'مەترسی نەگەڕانەوەی پارە',
        action: 'لە هەفتەیەکدا پلانی وەرگرتنەوە دابنێ',
        confidence: 88, icon: CreditCard, color: 'red',
        metric: { label: 'کۆی قەرز', value: fmt(totalDebt), trend: 'down' },
      });
    }

    // ===== 5. Profit Margin Intelligence =====
    const todayItems = saleItems.filter(si => todaySales.some(s => s.id === si.sale_id));
    const totalRevenue = todayItems.reduce((s, i) => s + i.total_price, 0);
    const totalCost = todayItems.reduce((s, i) => s + i.cost_price * i.quantity, 0);
    const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0;
    
    if (profitMargin > 0 && profitMargin < 15) {
      insights.push({
        id: 'low-margin', type: 'risk', priority: 7, title: '📉 ڕێژەی قازانج کەمە',
        description: `ڕێژەی قازانج ${profitMargin.toFixed(1)}% - کەمترە لە ١٥%`,
        impact: 'قازانجی کەم بۆ بەردەوامبوونی مارکێت',
        action: 'نرخی فرۆشتنی کاڵاکانی کەم قازانج پێداچوونەوە بکە',
        confidence: 90, icon: TrendingDown, color: 'amber',
        metric: { label: 'ڕێژەی قازانج', value: `${profitMargin.toFixed(1)}%`, trend: 'down' },
      });
    } else if (profitMargin >= 30) {
      insights.push({
        id: 'great-margin', type: 'achievement', priority: 5, title: '💰 قازانجی بەرز!',
        description: `ڕێژەی قازانج ${profitMargin.toFixed(1)}% - نایاب!`,
        impact: 'داهاتی باش و بنەمای بەهێز',
        action: 'بەردەوام بە و لە سەرمایەکاندا بیبەکارهێنە',
        confidence: 95, icon: Award, color: 'emerald',
        metric: { label: 'ڕێژەی قازانج', value: `${profitMargin.toFixed(1)}%`, trend: 'up' },
      });
    }

    // ===== 6. Stock Emergency =====
    const outOfStock = products.filter(p => p.stock_quantity === 0 && p.is_trackable);
    if (outOfStock.length > 0) {
      insights.push({
        id: 'out-of-stock', type: 'action', priority: 10, title: `🔴 ${outOfStock.length} کاڵا تەواو بووە!`,
        description: outOfStock.slice(0, 3).map(p => p.name).join('، '),
        impact: 'لەدەستدانی فرۆشتن و کڕیار',
        action: 'ئێستا داواکاری بکە بۆ ئەم کاڵایانە',
        confidence: 99, icon: Package, color: 'red',
        metric: { label: 'کاڵای تەواو', value: outOfStock.length.toString() },
      });
    }

    // ===== 7. Best Time Prediction =====
    if (sales.length >= 10) {
      const hourCounts: Record<number, number> = {};
      sales.forEach(s => { const h = new Date(s.created_at).getHours(); hourCounts[h] = (hourCounts[h] || 0) + 1; });
      const bestHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
      if (bestHour) {
        insights.push({
          id: 'best-time', type: 'prediction', priority: 3, title: `⏰ باشترین کاتی فرۆشتن: ${bestHour[0]}:00`,
          description: `زۆرترین فرۆشتن لە کاتژمێر ${bestHour[0]} دایە`,
          impact: 'زانینی کاتی پڕ فرۆشتن بۆ ئامادەکاری',
          action: 'لەو کاتەدا هەموو کاشێرەکان ئامادە بن',
          confidence: 72, icon: Clock, color: 'blue',
          metric: { label: 'باشترین کات', value: `${bestHour[0]}:00` },
        });
      }
    }

    // ===== 8. Top Product Opportunity =====
    const productSales = new Map<string, number>();
    saleItems.forEach(si => productSales.set(si.product_id, (productSales.get(si.product_id) || 0) + si.total_price));
    const topProduct = Array.from(productSales.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topProduct) {
      const prod = products.find(p => p.id === topProduct[0]);
      if (prod) {
        insights.push({
          id: 'top-product', type: 'opportunity', priority: 4, title: `⭐ باشترین کاڵا: ${prod.name}`,
          description: `کۆی فرۆشتن: ${fmt(topProduct[1])}`,
          impact: 'ئەم کاڵایە ستوونی فرۆشتنتە',
          action: 'کۆگای ئەم کاڵایە هەمیشە پڕ بهێڵەوە و ناونیشانەکەی لە POS بکەرەوە',
          confidence: 88, icon: Sparkles, color: 'indigo',
          metric: { label: 'داهات', value: fmt(topProduct[1]), trend: 'up' },
        });
      }
    }

    // Sort by priority
    insights.sort((a, b) => b.priority - a.priority);

    // Calculate overall score
    const riskCount = insights.filter(i => i.type === 'risk').length;
    const achievementCount = insights.filter(i => i.type === 'achievement').length;
    const score = Math.max(0, Math.min(100, 70 + achievementCount * 10 - riskCount * 15));
    const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';

    const summaryText = score >= 85 ? 'مارکێتەکەت لە دۆخێکی نایابدایە! 🔥'
      : score >= 70 ? 'دۆخی مارکێت باشە، بەردەوام بە 👍'
      : score >= 55 ? 'پێویستە لە هەندێ بوارەکدا باشتر بیت ⚠️'
      : 'ئاگاداری! مارکێتەکەت پێویستی بە ئاگاداری هەیە 🚨';

    return { insights, score, grade, summary: summaryText };
  }, [getDashboardSummary, getProducts, getCustomers, getCustomersWithDebt, getSales, saleItems, getLowStockProducts, getDebtTransactions, getCustomerBalance]);
}

// ============ COMPONENT ============
export function AICommandCenterModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { insights, score, grade, summary } = useAIBrain();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const typeConfig = {
    opportunity: { label: 'دەرفەت', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', emoji: '💡' },
    risk: { label: 'مەترسی', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', emoji: '⚠️' },
    action: { label: 'کردار', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', emoji: '⚡' },
    prediction: { label: 'پێشبینی', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', emoji: '🔮' },
    achievement: { label: 'دەستکەوت', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', emoji: '🏆' },
  };



  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" size="full">
      <div className="space-y-6 -mt-2">
        {/* AI Header */}
        <div className="relative overflow-hidden rounded-2xl p-6 text-white" style={{ background: 'linear-gradient(135deg, #312e81, #6366f1, #818cf8)' }}>
          <div className="absolute top-0 left-0 w-full h-full opacity-10">
            {[...Array(20)].map((_, i) => (
              <div key={i} className="absolute rounded-full bg-white" style={{ width: `${Math.random() * 6 + 2}px`, height: `${Math.random() * 6 + 2}px`, top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%`, animation: `pulse ${Math.random() * 3 + 2}s ease-in-out infinite` }} />
            ))}
          </div>

          <div className="relative flex flex-col sm:flex-row items-center gap-6">
            {/* Score Circle */}
            <div className="relative w-32 h-32 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="6" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${score * 2.64} ${264 - score * 2.64}`} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-black">{grade}</span>
                <span className="text-xs text-white/70">{score}/100</span>
              </div>
            </div>

            <div className="text-center sm:text-right flex-1">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                <Brain className="w-6 h-6" />
                <h2 className="text-xl font-black">ناوەندی فرماندەی AI</h2>
                <Sparkles className="w-5 h-5 text-amber-300" />
              </div>
              <p className="text-lg font-medium text-white/90 mb-1">{summary}</p>
              <p className="text-sm text-white/60">{insights.length} بینین و پێشنیار • {format(new Date(), 'yyyy/MM/dd HH:mm')}</p>

              <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                {Object.entries(typeConfig).map(([type, config]) => {
                  const count = insights.filter(i => i.type === type).length;
                  if (count === 0) return null;
                  return (
                    <span key={type} className="px-2.5 py-1 bg-white/10 rounded-full text-xs font-medium">
                      {config.emoji} {count} {config.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Insights */}
        <div className="space-y-3">
          {insights.length === 0 ? (
            <div className="text-center py-12">
              <Brain className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">هیچ بینینێکی AI نییە - داتا زیاتر پێویستە</p>
            </div>
          ) : (
            insights.map(insight => {
              const config = typeConfig[insight.type];
              const isExpanded = expandedId === insight.id;
              const Icon = insight.icon;

              return (
                <div key={insight.id} className={cn('rounded-2xl border overflow-hidden transition-all', config.bg, config.border)}>
                  <button onClick={() => setExpandedId(isExpanded ? null : insight.id)} className="w-full p-4 flex items-start gap-4 text-right">
                    <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', config.bg)} style={{ border: `2px solid currentColor` }}>
                      <Icon className={cn('w-6 h-6', config.text)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', config.bg, config.text)}>{config.emoji} {config.label}</span>
                        <span className="text-[10px] text-slate-400">دڵنیایی: {insight.confidence}%</span>
                      </div>
                      <h4 className="font-bold text-slate-900">{insight.title}</h4>
                      <p className="text-sm text-slate-600 mt-0.5">{insight.description}</p>
                      {insight.metric && (
                        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-white rounded-xl shadow-sm">
                          <span className="text-xs text-slate-500">{insight.metric.label}:</span>
                          <span className={cn('font-bold text-sm', insight.metric.trend === 'up' ? 'text-emerald-600' : insight.metric.trend === 'down' ? 'text-red-600' : 'text-slate-900')}>
                            {insight.metric.value}
                          </span>
                          {insight.metric.trend === 'up' && <TrendingUp className="w-3 h-3 text-emerald-500" />}
                          {insight.metric.trend === 'down' && <TrendingDown className="w-3 h-3 text-red-500" />}
                        </div>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 animate-slideUp">
                      <div className="mr-16 space-y-3">
                        <div className="p-3 bg-white rounded-xl shadow-sm">
                          <p className="text-xs font-bold text-slate-500 mb-1">📊 کاریگەری:</p>
                          <p className="text-sm text-slate-700">{insight.impact}</p>
                        </div>
                        <div className="p-3 bg-white rounded-xl shadow-sm border-2 border-indigo-100">
                          <p className="text-xs font-bold text-indigo-600 mb-1">🎯 پێشنیاری AI:</p>
                          <p className="text-sm text-slate-700 font-medium">{insight.action}</p>
                        </div>
                        <div className="h-1.5 bg-white rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-l from-indigo-500 to-purple-500 rounded-full transition-all" style={{ width: `${insight.confidence}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}

// ============ DASHBOARD BUTTON ============
export function AICommandButton() {
  const [isOpen, setIsOpen] = useState(false);
  const { grade } = useAIBrain();

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="fixed bottom-20 lg:bottom-4 left-1/2 -translate-x-1/2 z-30 bg-gradient-to-r from-indigo-600 to-purple-600 text-white pl-5 pr-4 py-3 rounded-2xl shadow-lg shadow-indigo-500/30 flex items-center gap-3 hover:shadow-xl hover:scale-105 transition-all group">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 group-hover:animate-pulse" />
          <span className="font-bold text-sm hidden sm:inline">ناوەندی AI</span>
        </div>
        <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
          {grade}
        </div>
      </button>

      <AICommandCenterModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
