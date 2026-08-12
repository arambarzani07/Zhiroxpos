import { cn } from '../../utils/cn';
import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Badge({ children, variant = 'default', size = 'md', className }: BadgeProps) {
  const variants = {
    default: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2 py-0.5 text-xs',
    lg: 'px-3 py-1 text-sm',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full whitespace-nowrap',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
}

// Status badge helper
export function StatusBadge({ status }: { status: string }) {
  const statusMap: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    active: { label: 'چالاک', variant: 'success' },
    inactive: { label: 'ناچالاک', variant: 'default' },
    blocked: { label: 'بلۆککراو', variant: 'danger' },
    completed: { label: 'تەواوبوو', variant: 'success' },
    cancelled: { label: 'هەڵوەشێنراو', variant: 'danger' },
    returned: { label: 'گەڕاوە', variant: 'warning' },
    archived: { label: 'ئەرشیفکراو', variant: 'default' },
  };

  const { label, variant } = statusMap[status] || { label: status, variant: 'default' };

  return <Badge variant={variant} size="sm">{label}</Badge>;
}

// Payment type badge
export function PaymentTypeBadge({ type }: { type: 'cash' | 'debt' | 'mixed' }) {
  const typeMap = {
    cash: { label: 'کاش', variant: 'success' as const },
    debt: { label: 'قەرز', variant: 'danger' as const },
    mixed: { label: 'تێکەڵ', variant: 'warning' as const },
  };

  const { label, variant } = typeMap[type];

  return <Badge variant={variant} size="sm">{label}</Badge>;
}
