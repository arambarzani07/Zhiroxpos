// ==============================================
// ZHIROX - Real-time Activity Feed
// تایبەتمەندی: چالاکیەکان بە شێوەی زیندوو
// ==============================================

import { useEffect, useState } from 'react';
import { 
  Activity, 
  ShoppingCart, 
  CreditCard,
  DollarSign,
} from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { cn } from '../../utils/cn';
import { formatDistanceToNow } from 'date-fns';

interface ActivityItem {
  id: string;
  type: 'sale' | 'payment' | 'debt' | 'stock' | 'customer';
  title: string;
  subtitle: string;
  amount?: number;
  timestamp: Date;
  icon: React.ElementType;
  color: string;
}

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} د.ع`;
}

export function RecentActivityFeed() {
  const { getRecentSales, getPayments, getDebtTransactions } = useDataStore();
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  useEffect(() => {
    const sales = getRecentSales(5).map(sale => ({
      id: `sale-${sale.id}`,
      type: 'sale' as const,
      title: `فرۆشتن ${sale.receipt_number}`,
      subtitle: sale.customer?.name || 'کڕیاری نەناسراو',
      amount: sale.total_amount,
      timestamp: new Date(sale.created_at),
      icon: ShoppingCart,
      color: 'emerald',
    }));

    const payments = getPayments().slice(0, 5).map(payment => ({
      id: `payment-${payment.id}`,
      type: 'payment' as const,
      title: payment.payment_for === 'debt_payment' ? 'پارەدانی قەرز' : 'پارەدان',
      subtitle: '',
      amount: payment.amount,
      timestamp: new Date(payment.created_at),
      icon: DollarSign,
      color: 'blue',
    }));

    const debts = getDebtTransactions().slice(0, 5).map(dt => ({
      id: `debt-${dt.id}`,
      type: 'debt' as const,
      title: dt.type === 'debt_added' ? 'قەرزی نوێ' : 'پارەدانی قەرز',
      subtitle: '',
      amount: Math.abs(dt.amount),
      timestamp: new Date(dt.created_at),
      icon: CreditCard,
      color: dt.type === 'debt_added' ? 'red' : 'emerald',
    }));

    const allActivities = [...sales, ...payments, ...debts]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);

    setActivities(allActivities);
  }, [getRecentSales, getPayments, getDebtTransactions]);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5 text-indigo-600" />
        چالاکی زیندوو
      </h3>

      {activities.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <Activity className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">هیچ چالاکییەک نییە</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {activities.map((activity, index) => {
            const Icon = activity.icon;
            
            return (
              <div
                key={activity.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-xl transition-colors',
                  index === 0 ? 'bg-indigo-50' : 'hover:bg-slate-50'
                )}
              >
                <div className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                  `bg-${activity.color}-100`
                )}>
                  <Icon className={cn('w-5 h-5', `text-${activity.color}-600`)} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{activity.title}</p>
                      {activity.subtitle && (
                        <p className="text-xs text-slate-500">{activity.subtitle}</p>
                      )}
                    </div>
                    {activity.amount && (
                      <p className={cn(
                        'font-semibold text-sm',
                        activity.type === 'debt' && activity.color === 'red' 
                          ? 'text-red-600' 
                          : 'text-emerald-600'
                      )}>
                        {formatCurrency(activity.amount)}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                  </p>
                </div>

                {index === 0 && (
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
