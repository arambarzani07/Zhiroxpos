import { cn } from '../../utils/cn';
import type { ReactNode } from 'react';

interface TableProps {
  children: ReactNode;
  className?: string;
}

export function Table({ children, className }: TableProps) {
  return (
    <div className={cn('overflow-x-auto rounded-lg lg:rounded-xl border border-slate-200', className)}>
      <table className="w-full min-w-[600px]">{children}</table>
    </div>
  );
}

interface TableHeaderProps {
  children: ReactNode;
}

export function TableHeader({ children }: TableHeaderProps) {
  return <thead className="bg-slate-50">{children}</thead>;
}

interface TableBodyProps {
  children: ReactNode;
}

export function TableBody({ children }: TableBodyProps) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

interface TableRowProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function TableRow({ children, onClick, className }: TableRowProps) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'hover:bg-slate-50 transition-colors',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </tr>
  );
}

interface TableHeadProps {
  children: ReactNode;
  className?: string;
}

export function TableHead({ children, className }: TableHeadProps) {
  return (
    <th
      className={cn(
        'text-right px-3 lg:px-4 py-2.5 lg:py-3 font-semibold text-slate-700 text-xs lg:text-sm whitespace-nowrap',
        className
      )}
    >
      {children}
    </th>
  );
}

interface TableCellProps {
  children: ReactNode;
  className?: string;
}

export function TableCell({ children, className }: TableCellProps) {
  return (
    <td className={cn('px-3 lg:px-4 py-2.5 lg:py-3 text-slate-600 text-sm', className)}>{children}</td>
  );
}

interface EmptyTableProps {
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyTable({
  message = 'داتا نییە',
  icon,
  action,
}: EmptyTableProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 lg:py-12 text-center">
      {icon && <div className="text-slate-300 mb-4">{icon}</div>}
      <p className="text-slate-500 mb-4 text-sm lg:text-base">{message}</p>
      {action}
    </div>
  );
}

// Mobile-friendly card list alternative to tables
interface DataListProps {
  children: ReactNode;
  className?: string;
}

export function DataList({ children, className }: DataListProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {children}
    </div>
  );
}

interface DataListItemProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function DataListItem({ children, onClick, className }: DataListItemProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white p-4 rounded-xl border border-slate-100 shadow-sm',
        onClick && 'cursor-pointer hover:shadow-md transition-shadow',
        className
      )}
    >
      {children}
    </div>
  );
}
