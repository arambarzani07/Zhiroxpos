// ==============================================
// ZHIROX - Smart AI Suggestions
// تایبەتمەندی: پێشنیاری زیرەکی AI بۆ خاوەن
// ==============================================

import { useMemo, useState } from 'react';
import {
  Brain,
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  Package,
  Users,
  CreditCard,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { cn } from '../../utils/cn';

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} د.ع`;
}

type SuggestionPriority = 'critical' | 'high' | 'medium' | 'low';
type SuggestionStatus = 'pending' | 'accepted' | 'dismissed';

interface AISuggestion {
  id: string;
  category: string;
  icon: React.ElementType;
  title: string;
  problem: string;
  suggestion: string;
  benefit: string;
  confidence: number;
  priority: SuggestionPriority;
  status: SuggestionStatus;
}

export function SmartSuggestionsWidget() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, SuggestionStatus>>({});

  const { 
    getLowStockProducts, 
    getCustomersWithDebt, 
    getDashboardSummary,
    getProducts,
    getCustomers,
  } = useDataStore();

  const lowStock = getLowStockProducts();
  const debtCustomers = getCustomersWithDebt();
  const summary = getDashboardSummary();
  const products = getProducts();
  const customers = getCustomers();

  const suggestions: AISuggestion[] = useMemo(() => {
    const items: AISuggestion[] = [];

    // 1. Restock suggestions
    if (lowStock.length > 0) {
      const outOfStock = lowStock.filter(p => p.stock_quantity === 0);
      if (outOfStock.length > 0) {
        items.push({
          id: 'restock-critical',
          category: 'کۆگا',
          icon: Package,
          title: `${outOfStock.length} کاڵا بەتەواوی تەواو بووە`,
          problem: `${outOfStock.map(p => p.name).slice(0, 3).join('، ')} ${outOfStock.length > 3 ? '...' : ''} کۆگایان ٠ یە`,
          suggestion: 'ئەم کاڵایانە دەبێت بە خێرایی داواکاری بکرێت',
          benefit: 'ڕێگری لە لەدەستدانی فرۆشتن و کڕیار',
          confidence: 98,
          priority: 'critical',
          status: statuses['restock-critical'] || 'pending',
        });
      }

      if (lowStock.length > 3) {
        items.push({
          id: 'restock-warning',
          category: 'کۆگا',
          icon: AlertTriangle,
          title: `${lowStock.length} کاڵا کۆگایان کەمە`,
          problem: 'ژمارەیەکی زۆر لە کاڵاکان نزیکی تەواوبوونن',
          suggestion: 'پلانی داواکاری هەفتانە دابنێ',
          benefit: 'کەمکردنەوەی مەترسی نەبوونی کاڵا',
          confidence: 85,
          priority: 'high',
          status: statuses['restock-warning'] || 'pending',
        });
      }
    }

    // 2. Debt risk
    const totalDebt = summary.total_customer_debt;
    if (totalDebt > 500000) {
      const highDebt = debtCustomers.filter(c => (c.balance?.balance_iqd || 0) > 100000);
      items.push({
        id: 'debt-risk',
        category: 'قەرز',
        icon: CreditCard,
        title: 'قەرزی کڕیاران زۆرە',
        problem: `کۆی قەرز: ${formatCurrency(totalDebt)} - ${highDebt.length} کڕیار قەرزیان لە ١٠٠ هەزار زیاترە`,
        suggestion: 'پلانی وەرگرتنەوەی قەرز دابنێ و سنووری قەرز بکەمەوە',
        benefit: 'باشکردنی پارەی نەقد و کەمکردنی مەترسی',
        confidence: 90,
        priority: totalDebt > 1000000 ? 'critical' : 'high',
        status: statuses['debt-risk'] || 'pending',
      });
    }

    // 3. Blocked customers with debt
    const blockedWithDebt = customers.filter(c => {
      if (c.status !== 'blocked') return false;
      const debt = debtCustomers.find(d => d.id === c.id);
      return debt && (debt.balance?.balance_iqd || 0) > 0;
    });

    if (blockedWithDebt.length > 0) {
      items.push({
        id: 'blocked-debt',
        category: 'کڕیار',
        icon: ShieldAlert,
        title: `${blockedWithDebt.length} کڕیاری بلۆککراو قەرزیان هەیە`,
        problem: 'کڕیارانی بلۆککراو قەرزیان نەدراوەتەوە',
        suggestion: 'پەیوەندی بکە بە کڕیارەکان بۆ وەرگرتنەوەی قەرز',
        benefit: 'وەرگرتنەوەی پارەی لەدەستچوو',
        confidence: 75,
        priority: 'medium',
        status: statuses['blocked-debt'] || 'pending',
      });
    }

    // 4. Sales improvement
    if (summary.receipt_count < 5 && new Date().getHours() >= 14) {
      items.push({
        id: 'low-sales',
        category: 'فرۆشتن',
        icon: TrendingUp,
        title: 'فرۆشتنی ئەمڕۆ کەمە',
        problem: `تەنها ${summary.receipt_count} وەسڵ ئەمڕۆ - ${formatCurrency(summary.today_sales)}`,
        suggestion: 'داشکاندن بۆ کاڵاکانی نزیکی بەسەرچوون یان کاڵاکانی کۆگا زۆر',
        benefit: 'زیادبوونی فرۆشتن و جوڵەی کاڵا',
        confidence: 70,
        priority: 'medium',
        status: statuses['low-sales'] || 'pending',
      });
    }

    // 5. Price optimization
    const highMarginProducts = products.filter(p => {
      if (p.cost_price === 0) return false;
      const margin = ((p.sale_price - p.cost_price) / p.cost_price) * 100;
      return margin > 100;
    });
    
    if (highMarginProducts.length > 0) {
      items.push({
        id: 'price-review',
        category: 'نرخ',
        icon: Lightbulb,
        title: `${highMarginProducts.length} کاڵا ڕێژەی قازانجیان زۆر بەرزە`,
        problem: 'ئەم کاڵایانە ڕێژەی قازانجیان لە ١٠٠٪ زیاترە',
        suggestion: 'نرخەکان پێداچوونەوە بکە - لەوانەیە کڕیار لەدەست بدەیت',
        benefit: 'هاوسەنگی نێوان قازانج و ڕەزامەندی کڕیار',
        confidence: 65,
        priority: 'low',
        status: statuses['price-review'] || 'pending',
      });
    }

    // 6. Customer growth
    if (customers.length < 10) {
      items.push({
        id: 'customer-growth',
        category: 'گەشەکردن',
        icon: Users,
        title: 'پێویستە کڕیاری زیاتر زیاد بکەیت',
        problem: `تەنها ${customers.length} کڕیار تۆمارکراوە`,
        suggestion: 'هەر کڕیارێکی نوێ تۆمار بکە و زانیاریەکانی پاشەکەوت بکە',
        benefit: 'بنەمای کڕیاری بەهێز و فرۆشتنی زیاتر',
        confidence: 80,
        priority: 'medium',
        status: statuses['customer-growth'] || 'pending',
      });
    }

    return items.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [lowStock, debtCustomers, summary, products, customers, statuses]);

  const handleAction = (id: string, action: SuggestionStatus) => {
    setStatuses(prev => ({ ...prev, [id]: action }));
  };

  const pendingSuggestions = suggestions.filter(s => s.status === 'pending');

  const priorityStyles: Record<SuggestionPriority, { bg: string; dot: string; label: string }> = {
    critical: { bg: 'bg-red-50 border-red-200', dot: 'bg-red-500', label: 'بەپەلە' },
    high: { bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500', label: 'گرنگ' },
    medium: { bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500', label: 'مامناوەند' },
    low: { bg: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500', label: 'ئاسایی' },
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            <h3 className="font-semibold">پێشنیاری زیرەکی AI</h3>
          </div>
          {pendingSuggestions.length > 0 && (
            <span className="px-2.5 py-0.5 bg-white/20 rounded-full text-xs font-bold">
              {pendingSuggestions.length} نوێ
            </span>
          )}
        </div>
        <p className="text-purple-200 text-xs mt-1">
          بەپێی شیکاری داتاکانت پێشنیارت بۆ دەکەم
        </p>
      </div>

      {/* Suggestions */}
      <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
        {suggestions.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <Brain className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm">هیچ پێشنیارێک نییە - هەموو شت باشە!</p>
          </div>
        ) : (
          suggestions.map(suggestion => {
            const isExpanded = expandedId === suggestion.id;
            const styles = priorityStyles[suggestion.priority];
            const Icon = suggestion.icon;
            const isDismissed = suggestion.status === 'dismissed';
            const isAccepted = suggestion.status === 'accepted';

            return (
              <div
                key={suggestion.id}
                className={cn(
                  'transition-all',
                  isDismissed && 'opacity-40'
                )}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : suggestion.id)}
                  className="w-full p-4 flex items-start gap-3 text-right hover:bg-slate-50 transition-colors"
                >
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border',
                    styles.bg
                  )}>
                    <Icon className="w-5 h-5 text-slate-700" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn('w-2 h-2 rounded-full', styles.dot)} />
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        {styles.label} • {suggestion.category}
                      </span>
                      {isAccepted && <CheckCircle className="w-3 h-3 text-emerald-500" />}
                    </div>
                    <p className="font-medium text-slate-900 text-sm">{suggestion.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{suggestion.problem}</p>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-left hidden sm:block">
                      <span className="text-xs font-bold text-indigo-600">{suggestion.confidence}%</span>
                      <p className="text-[10px] text-slate-400">دڵنیایی</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 animate-slideUp">
                    <div className="mr-[52px] space-y-3">
                      <div className="p-3 bg-red-50 rounded-lg">
                        <p className="text-xs font-bold text-red-700 mb-1">🔍 کێشە:</p>
                        <p className="text-sm text-red-600">{suggestion.problem}</p>
                      </div>
                      <div className="p-3 bg-indigo-50 rounded-lg">
                        <p className="text-xs font-bold text-indigo-700 mb-1">💡 پێشنیار:</p>
                        <p className="text-sm text-indigo-600">{suggestion.suggestion}</p>
                      </div>
                      <div className="p-3 bg-emerald-50 rounded-lg">
                        <p className="text-xs font-bold text-emerald-700 mb-1">✅ سوود:</p>
                        <p className="text-sm text-emerald-600">{suggestion.benefit}</p>
                      </div>

                      {/* Confidence Bar */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">ئاستی دڵنیایی AI</span>
                          <span className="font-bold text-indigo-600">{suggestion.confidence}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-l from-indigo-500 to-purple-500 rounded-full"
                            style={{ width: `${suggestion.confidence}%` }}
                          />
                        </div>
                      </div>

                      {/* Actions */}
                      {suggestion.status === 'pending' && (
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={() => handleAction(suggestion.id, 'accepted')}
                            className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1"
                          >
                            <CheckCircle className="w-4 h-4" />
                            قبوڵکردن
                          </button>
                          <button
                            onClick={() => handleAction(suggestion.id, 'dismissed')}
                            className="flex-1 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300 transition-colors flex items-center justify-center gap-1"
                          >
                            <XCircle className="w-4 h-4" />
                            پاشگوێخستن
                          </button>
                        </div>
                      )}

                      {suggestion.status !== 'pending' && (
                        <div className={cn(
                          'flex items-center gap-2 p-2 rounded-lg text-sm',
                          suggestion.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        )}>
                          {suggestion.status === 'accepted' ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                          {suggestion.status === 'accepted' ? 'قبوڵکرا' : 'پاشگوێخرا'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
