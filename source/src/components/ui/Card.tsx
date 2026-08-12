import { cn } from '../../utils/cn';
import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ children, padding = 'md', className, ...props }: CardProps) {
  const paddingStyles = {
    none: '',
    sm: 'p-3 lg:p-4',
    md: 'p-4 lg:p-6',
    lg: 'p-6 lg:p-8',
  };

  return (
    <div
      className={cn(
        'bg-white rounded-xl lg:rounded-2xl shadow-sm border border-slate-100',
        paddingStyles[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function CardHeader({ title, subtitle, action, icon }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-2 lg:gap-3">
        {icon && (
          <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg lg:rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-base lg:text-lg font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs lg:text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'indigo' | 'emerald' | 'amber' | 'red' | 'blue' | 'purple';
}

export function StatCard({ title, value, icon, trend, color = 'indigo' }: StatCardProps) {
  const colorStyles = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <Card className="hover:shadow-md transition-shadow duration-300">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs lg:text-sm font-medium text-slate-500 truncate">{title}</p>
          <p className="text-lg lg:text-2xl font-bold text-slate-900 mt-1 truncate">{value}</p>
          {trend && (
            <div className={cn('flex items-center gap-1 mt-2 text-xs lg:text-sm', trend.isPositive ? 'text-emerald-600' : 'text-red-600')}>
              <span>{trend.isPositive ? '↑' : '↓'}</span>
              <span>{Math.abs(trend.value)}%</span>
            </div>
          )}
        </div>
        {icon && (
          <div className={cn('w-10 h-10 lg:w-12 lg:h-12 rounded-lg lg:rounded-xl flex items-center justify-center flex-shrink-0 mr-2', colorStyles[color])}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
