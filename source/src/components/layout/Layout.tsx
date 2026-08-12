import { cn } from '../../utils/cn';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '../ui/Toast';

export function Layout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      
      {/* Main Content */}
      <main className="lg:mr-64 min-h-screen transition-all duration-300 pt-16 lg:pt-0">
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>

      <ToastContainer />
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-slate-500 mt-1 text-sm sm:text-base">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

interface PageContentProps {
  children: React.ReactNode;
  className?: string;
}

export function PageContent({ children, className }: PageContentProps) {
  return <div className={cn('space-y-4 lg:space-y-6', className)}>{children}</div>;
}
