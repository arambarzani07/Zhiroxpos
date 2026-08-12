// ==============================================
// ZHIROX - Sales Goals & Achievements
// تایبەتمەندی: ئامانجەکان و دەستکەوتەکان بۆ کاشێر
// ==============================================

import { useMemo } from 'react';
import { Target, Trophy, TrendingUp, Zap, Star, Award } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { cn } from '../../utils/cn';

interface Goal {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  icon: React.ElementType;
  color: string;
}

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} د.ع`;
}

export function SalesGoalsWidget() {
  const { getDashboardSummary } = useDataStore();
  const summary = getDashboardSummary();

  const goals: Goal[] = useMemo(() => [
    {
      id: 'sales',
      title: 'فرۆشتنی ڕۆژانە',
      target: 500000,
      current: summary.today_sales,
      unit: 'د.ع',
      icon: Target,
      color: 'indigo',
    },
    {
      id: 'receipts',
      title: 'ژمارەی وەسڵ',
      target: 50,
      current: summary.receipt_count,
      unit: 'وەسڵ',
      icon: Trophy,
      color: 'amber',
    },
    {
      id: 'cash',
      title: 'پارەی نەقد',
      target: 400000,
      current: summary.today_cash,
      unit: 'د.ع',
      icon: TrendingUp,
      color: 'emerald',
    },
  ], [summary]);

  const achievements = useMemo(() => {
    const list = [];
    
    if (summary.receipt_count >= 10) {
      list.push({ id: '10_sales', title: '١٠ فرۆشتن', icon: Star, color: 'amber' });
    }
    if (summary.receipt_count >= 25) {
      list.push({ id: '25_sales', title: '٢٥ فرۆشتن', icon: Award, color: 'purple' });
    }
    if (summary.today_sales >= 100000) {
      list.push({ id: '100k', title: '١٠٠ هەزار', icon: Zap, color: 'indigo' });
    }
    if (summary.today_sales >= 500000) {
      list.push({ id: '500k', title: '٥٠٠ هەزار', icon: Trophy, color: 'emerald' });
    }

    return list;
  }, [summary]);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <Target className="w-5 h-5 text-indigo-600" />
        ئامانجەکانی ئەمڕۆ
      </h3>

      <div className="space-y-4">
        {goals.map(goal => {
          const percentage = Math.min((goal.current / goal.target) * 100, 100);
          const isCompleted = percentage >= 100;

          return (
            <div key={goal.id}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <goal.icon className={cn('w-4 h-4', `text-${goal.color}-600`)} />
                  <span className="text-sm text-slate-600">{goal.title}</span>
                </div>
                <span className="text-sm font-medium text-slate-900">
                  {goal.id === 'receipts' 
                    ? `${goal.current} / ${goal.target}`
                    : `${formatCurrency(goal.current)}`
                  }
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    isCompleted ? 'bg-emerald-500' : `bg-${goal.color}-500`
                  )}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-slate-400">
                  {percentage.toFixed(0)}%
                </span>
                {isCompleted && (
                  <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                    <Trophy className="w-3 h-3" />
                    تەواوبوو!
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Achievements */}
      {achievements.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-500 mb-2">دەستکەوتەکان:</p>
          <div className="flex flex-wrap gap-2">
            {achievements.map(achievement => (
              <div
                key={achievement.id}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                  `bg-${achievement.color}-100 text-${achievement.color}-700`
                )}
              >
                <achievement.icon className="w-3 h-3" />
                {achievement.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Mini progress indicator for sidebar/header
export function SalesProgressMini() {
  const { getDashboardSummary } = useDataStore();
  const summary = getDashboardSummary();
  
  const target = 500000;
  const percentage = Math.min((summary.today_sales / target) * 100, 100);

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-slate-500">{percentage.toFixed(0)}%</span>
    </div>
  );
}
