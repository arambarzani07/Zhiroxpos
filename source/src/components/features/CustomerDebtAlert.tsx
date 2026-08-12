// ==============================================
// ZHIROX - Customer Debt Alert System
// تایبەتمەندی: ئاگاداری قەرزی کڕیار
// ==============================================

import { useMemo } from 'react';
import { AlertTriangle, AlertCircle, User } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { cn } from '../../utils/cn';

interface DebtAlert {
  customerId: string;
  customerName: string;
  debt: number;
  limit: number;
  percentage: number;
  level: 'warning' | 'danger' | 'critical';
}

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} د.ع`;
}

export function CustomerDebtAlerts() {
  const { getCustomers, getCustomerBalance } = useDataStore();
  const customers = getCustomers();

  const alerts: DebtAlert[] = useMemo(() => {
    return customers
      .map(customer => {
        const balance = getCustomerBalance(customer.id);
        const debt = balance?.balance_iqd || 0;
        const limit = customer.debt_limit || 0;
        
        if (limit === 0 || debt === 0) return null;
        
        const percentage = (debt / limit) * 100;
        
        if (percentage < 70) return null;

        let level: DebtAlert['level'] = 'warning';
        if (percentage >= 100) level = 'critical';
        else if (percentage >= 90) level = 'danger';

        return {
          customerId: customer.id,
          customerName: customer.name,
          debt,
          limit,
          percentage,
          level,
        };
      })
      .filter((alert): alert is DebtAlert => alert !== null)
      .sort((a, b) => b.percentage - a.percentage);
  }, [customers, getCustomerBalance]);

  if (alerts.length === 0) return null;

  const levelStyles = {
    warning: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      icon: 'text-amber-500',
      text: 'text-amber-700',
    },
    danger: {
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      icon: 'text-orange-500',
      text: 'text-orange-700',
    },
    critical: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      icon: 'text-red-500',
      text: 'text-red-700',
    },
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        ئاگاداری قەرز
        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
          {alerts.length}
        </span>
      </h3>

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {alerts.map(alert => {
          const styles = levelStyles[alert.level];
          
          return (
            <div
              key={alert.customerId}
              className={cn(
                'p-3 rounded-xl border',
                styles.bg,
                styles.border
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', styles.bg)}>
                    {alert.level === 'critical' ? (
                      <AlertCircle className={cn('w-4 h-4', styles.icon)} />
                    ) : (
                      <User className={cn('w-4 h-4', styles.icon)} />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 text-sm">{alert.customerName}</p>
                    <p className={cn('text-xs', styles.text)}>
                      {alert.level === 'critical' && 'تێپەڕیوە لە سنوور!'}
                      {alert.level === 'danger' && 'نزیکی سنوورە'}
                      {alert.level === 'warning' && 'ئاگادار بە'}
                    </p>
                  </div>
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-slate-900">
                    {formatCurrency(alert.debt)}
                  </p>
                  <p className="text-xs text-slate-500">
                    لە {formatCurrency(alert.limit)}
                  </p>
                </div>
              </div>
              
              {/* Progress bar */}
              <div className="mt-2">
                <div className="h-1.5 bg-white/50 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      alert.level === 'critical' ? 'bg-red-500' :
                      alert.level === 'danger' ? 'bg-orange-500' : 'bg-amber-500'
                    )}
                    style={{ width: `${Math.min(alert.percentage, 100)}%` }}
                  />
                </div>
                <p className={cn('text-xs mt-1', styles.text)}>
                  {alert.percentage.toFixed(0)}% لە سنوور
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Inline alert for POS when selecting customer
export function CustomerDebtWarning({ customerId }: { customerId: string }) {
  const { getCustomerBalance, getCustomerById } = useDataStore();
  const customer = getCustomerById(customerId);
  const balance = getCustomerBalance(customerId);

  if (!customer || !balance || !customer.debt_limit) return null;

  const debt = balance.balance_iqd;
  const limit = customer.debt_limit;
  const percentage = (debt / limit) * 100;

  if (percentage < 70) return null;

  const isOverLimit = percentage >= 100;
  const isDanger = percentage >= 90;

  return (
    <div className={cn(
      'p-2 rounded-lg text-sm flex items-center gap-2',
      isOverLimit ? 'bg-red-100 text-red-700' :
      isDanger ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'
    )}>
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>
        {isOverLimit && 'ئەم کڕیارە تێپەڕیوە لە سنووری قەرز!'}
        {isDanger && !isOverLimit && `نزیکی سنووری قەرز (${percentage.toFixed(0)}%)`}
        {!isDanger && !isOverLimit && `${percentage.toFixed(0)}% لە سنووری قەرز`}
      </span>
    </div>
  );
}
