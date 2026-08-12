// ==============================================
// ZHIROX - Market Health Score
// تایبەتمەندی: خاڵی تەندروستی مارکێت
// ==============================================

import { useMemo } from 'react';
import { Heart, TrendingUp, Package, Users, CreditCard, ShieldCheck } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { cn } from '../../utils/cn';

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} د.ع`;
}

interface HealthFactor {
  name: string;
  score: number;
  maxScore: number;
  status: 'great' | 'good' | 'warn' | 'bad';
  tip: string;
  icon: React.ElementType;
}

export function MarketHealthScoreWidget() {
  const { getDashboardSummary, getProducts, getCustomersWithDebt, getLowStockProducts, getCustomers } = useDataStore();
  const summary = getDashboardSummary();
  const products = getProducts().filter(p => p.status === 'active');
  const customers = getCustomers().filter(c => c.status === 'active');
  const lowStock = getLowStockProducts();
  const debtCustomers = getCustomersWithDebt();

  const healthFactors: HealthFactor[] = useMemo(() => {
    const factors: HealthFactor[] = [];

    // 1. Sales Activity (0-25 points)
    const salesScore = Math.min(summary.receipt_count * 2, 25);
    factors.push({
      name: 'چالاکی فرۆشتن',
      score: salesScore,
      maxScore: 25,
      status: salesScore >= 20 ? 'great' : salesScore >= 12 ? 'good' : salesScore >= 5 ? 'warn' : 'bad',
      tip: salesScore < 12 ? 'هەوڵ بدە فرۆشتنەکان زیاد بکەیت' : 'فرۆشتنەکان باشن',
      icon: TrendingUp,
    });

    // 2. Stock Health (0-25 points)
    const stockRatio = products.length > 0 ? (products.length - lowStock.length) / products.length : 1;
    const stockScore = Math.round(stockRatio * 25);
    factors.push({
      name: 'تەندروستی کۆگا',
      score: stockScore,
      maxScore: 25,
      status: stockScore >= 22 ? 'great' : stockScore >= 15 ? 'good' : stockScore >= 8 ? 'warn' : 'bad',
      tip: lowStock.length > 0 ? `${lowStock.length} کاڵا کۆگایان کەمە` : 'کۆگا باشە',
      icon: Package,
    });

    // 3. Debt Health (0-25 points)
    const totalDebt = summary.total_customer_debt;
    const debtScore = totalDebt === 0 ? 25 : totalDebt < 500000 ? 20 : totalDebt < 1000000 ? 12 : totalDebt < 3000000 ? 5 : 0;
    factors.push({
      name: 'تەندروستی قەرز',
      score: debtScore,
      maxScore: 25,
      status: debtScore >= 20 ? 'great' : debtScore >= 12 ? 'good' : debtScore >= 5 ? 'warn' : 'bad',
      tip: totalDebt > 0 ? `کۆی قەرز: ${formatCurrency(totalDebt)}` : 'هیچ قەرزێک نییە',
      icon: CreditCard,
    });

    // 4. Customer Base (0-25 points)
    const customerScore = Math.min(customers.length * 5, 25);
    factors.push({
      name: 'بنەمای کڕیار',
      score: customerScore,
      maxScore: 25,
      status: customerScore >= 20 ? 'great' : customerScore >= 10 ? 'good' : customerScore >= 5 ? 'warn' : 'bad',
      tip: `${customers.length} کڕیاری چالاک`,
      icon: Users,
    });

    return factors;
  }, [summary, products, lowStock, customers, debtCustomers]);

  const totalScore = healthFactors.reduce((sum, f) => sum + f.score, 0);
  const maxScore = healthFactors.reduce((sum, f) => sum + f.maxScore, 0);
  const percentage = Math.round((totalScore / maxScore) * 100);

  const overallStatus = percentage >= 80 ? 'great' : percentage >= 60 ? 'good' : percentage >= 40 ? 'warn' : 'bad';
  const statusConfig = {
    great: { label: 'نایاب', color: 'emerald', bg: 'from-emerald-500 to-emerald-600', emoji: '💚' },
    good: { label: 'باش', color: 'blue', bg: 'from-blue-500 to-blue-600', emoji: '💙' },
    warn: { label: 'ئاگادار', color: 'amber', bg: 'from-amber-500 to-amber-600', emoji: '💛' },
    bad: { label: 'مەترسیدار', color: 'red', bg: 'from-red-500 to-red-600', emoji: '❤️‍🩹' },
  };

  const config = statusConfig[overallStatus];
  const factorStatusStyles = {
    great: 'text-emerald-600 bg-emerald-100',
    good: 'text-blue-600 bg-blue-100',
    warn: 'text-amber-600 bg-amber-100',
    bad: 'text-red-600 bg-red-100',
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header with Score */}
      <div
        className="p-5 text-white text-center"
        style={{
          background: overallStatus === 'great' ? 'linear-gradient(135deg, #10b981, #059669)' :
                      overallStatus === 'good' ? 'linear-gradient(135deg, #3b82f6, #2563eb)' :
                      overallStatus === 'warn' ? 'linear-gradient(135deg, #f59e0b, #d97706)' :
                      'linear-gradient(135deg, #ef4444, #dc2626)'
        }}
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          <Heart className="w-5 h-5" />
          <h3 className="font-semibold">تەندروستی مارکێت</h3>
        </div>

        {/* Circular Score */}
        <div className="relative w-28 h-28 mx-auto my-3">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="42" fill="none" stroke="white" strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${percentage * 2.64} ${264 - percentage * 2.64}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black">{percentage}</span>
            <span className="text-xs text-white/80">لە ١٠٠</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          <span className="text-xl">{config.emoji}</span>
          <span className="font-medium">{config.label}</span>
        </div>
      </div>

      {/* Factors */}
      <div className="p-4 space-y-3">
        {healthFactors.map((factor, i) => {
          const Icon = factor.icon;
          const pct = Math.round((factor.score / factor.maxScore) * 100);
          
          return (
            <div key={i} className="flex items-center gap-3">
              <div className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                factorStatusStyles[factor.status]
              )}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700">{factor.name}</span>
                  <span className="text-xs font-bold text-slate-500">{factor.score}/{factor.maxScore}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', `bg-${factor.status === 'great' ? 'emerald' : factor.status === 'good' ? 'blue' : factor.status === 'warn' ? 'amber' : 'red'}-500`)}
                    style={{ 
                      width: `${pct}%`,
                      backgroundColor: factor.status === 'great' ? '#10b981' :
                                       factor.status === 'good' ? '#3b82f6' :
                                       factor.status === 'warn' ? '#f59e0b' : '#ef4444'
                    }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{factor.tip}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Tip */}
      <div className="p-4 pt-0">
        <div className="p-3 bg-indigo-50 rounded-xl flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-indigo-700">
            {overallStatus === 'great' && 'مارکێتەکەت لە دۆخێکی نایابدایە! بەردەوام بە.'}
            {overallStatus === 'good' && 'مارکێتەکەت باشە. هەوڵ بدە کۆگا و قەرز باشتر بکرێت.'}
            {overallStatus === 'warn' && 'پێویستە سەرنج بدەیت بە کۆگا و قەرز. ئاگادار بە!'}
            {overallStatus === 'bad' && 'مارکێتەکەت پێویستی بە ئاگاداری هەیە. هەوڵ بدە باشی بکەیت.'}
          </p>
        </div>
      </div>
    </div>
  );
}
