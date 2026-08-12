// ==============================================
// ZHIROX - Notification Center
// تایبەتمەندی: ناوەندی ئاگادارکردنەوەکان
// ==============================================

import { useState, useMemo } from 'react';
import {
  Bell,
  Package,
  CreditCard,
  TrendingDown,
  CheckCircle,
} from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { cn } from '../../utils/cn';
import { formatDistanceToNow } from 'date-fns';

interface Notification {
  id: string;
  type: 'warning' | 'danger' | 'info' | 'success';
  title: string;
  message: string;
  icon: React.ElementType;
  timestamp: Date;
  read: boolean;
}

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);

  const { getLowStockProducts, getCustomersWithDebt, getDashboardSummary } = useDataStore();

  const notifications = useMemo(() => {
    const items: Notification[] = [];
    const now = new Date();

    // Low stock notifications
    const lowStock = getLowStockProducts();
    if (lowStock.length > 0) {
      items.push({
        id: 'low-stock',
        type: 'warning',
        title: 'کاڵای کەم',
        message: `${lowStock.length} کاڵا کۆگایان کەمە`,
        icon: Package,
        timestamp: now,
        read: readIds.includes('low-stock'),
      });
    }

    // Debt warnings
    const debtCustomers = getCustomersWithDebt();
    const highDebtCustomers = debtCustomers.filter(c => {
      const debt = c.balance?.balance_iqd || 0;
      const limit = c.debt_limit || Infinity;
      return (debt / limit) >= 0.9;
    });

    if (highDebtCustomers.length > 0) {
      items.push({
        id: 'high-debt',
        type: 'danger',
        title: 'ئاگاداری قەرز',
        message: `${highDebtCustomers.length} کڕیار نزیکی سنووری قەرزن`,
        icon: CreditCard,
        timestamp: now,
        read: readIds.includes('high-debt'),
      });
    }

    // Sales performance
    const summary = getDashboardSummary();
    if (summary.today_sales === 0 && now.getHours() >= 12) {
      items.push({
        id: 'no-sales',
        type: 'info',
        title: 'فرۆشتن',
        message: 'هێشتا هیچ فرۆشتنێک ئەمڕۆ نەکراوە',
        icon: TrendingDown,
        timestamp: now,
        read: readIds.includes('no-sales'),
      });
    }

    // Achievement notifications
    if (summary.receipt_count >= 50) {
      items.push({
        id: 'achievement-50',
        type: 'success',
        title: 'دەستکەوت!',
        message: '٥٠ فرۆشتن ئەمڕۆ تەواوکرا',
        icon: CheckCircle,
        timestamp: now,
        read: readIds.includes('achievement-50'),
      });
    }

    return items;
  }, [getLowStockProducts, getCustomersWithDebt, getDashboardSummary, readIds]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id: string) => {
    setReadIds(prev => [...prev, id]);
  };

  const markAllAsRead = () => {
    setReadIds(notifications.map(n => n.id));
  };

  const typeStyles = {
    warning: {
      bg: 'bg-amber-50',
      icon: 'text-amber-500',
      border: 'border-amber-200',
    },
    danger: {
      bg: 'bg-red-50',
      icon: 'text-red-500',
      border: 'border-red-200',
    },
    info: {
      bg: 'bg-blue-50',
      icon: 'text-blue-500',
      border: 'border-blue-200',
    },
    success: {
      bg: 'bg-emerald-50',
      icon: 'text-emerald-500',
      border: 'border-emerald-200',
    },
  };

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors"
      >
        <Bell className="w-5 h-5 text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 sm:right-0 sm:left-auto mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 animate-slideUp">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">ئاگادارکردنەوەکان</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-indigo-600 hover:text-indigo-700"
                >
                  هەموو بخوێنەوە
                </button>
              )}
            </div>

            {/* Notifications List */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <Bell className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">هیچ ئاگادارکردنەوەیەک نییە</p>
                </div>
              ) : (
                <div className="p-2">
                  {notifications.map(notification => {
                    const styles = typeStyles[notification.type];
                    const Icon = notification.icon;

                    return (
                      <div
                        key={notification.id}
                        onClick={() => markAsRead(notification.id)}
                        className={cn(
                          'p-3 rounded-xl mb-2 cursor-pointer transition-all',
                          notification.read ? 'opacity-60' : styles.bg,
                          `border ${styles.border}`
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', styles.bg)}>
                            <Icon className={cn('w-4 h-4', styles.icon)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 text-sm">{notification.title}</p>
                            <p className="text-xs text-slate-600 mt-0.5">{notification.message}</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                            </p>
                          </div>
                          {!notification.read && (
                            <div className="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
