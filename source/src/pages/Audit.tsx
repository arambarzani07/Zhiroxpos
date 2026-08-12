import { useState } from 'react';
import {
  History,
  Search,
  Calendar,
  Eye,
  Activity,
} from 'lucide-react';
import { useDataStore } from '../stores/dataStore';
import { translations } from '../constants/translations';
import { PageHeader, PageContent } from '../components/layout/Layout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyTable, DataList, DataListItem } from '../components/ui/Table';
import type { AuditLog } from '../types';
import { format } from 'date-fns';

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'چوونەژوورەوە',
  'auth.logout': 'دەرچوون',
  'auth.failed_login': 'هەوڵی چوونەژوورەوە بێسەرکەوتوو',
  'products.create': 'دروستکردنی کاڵا',
  'products.update': 'نوێکردنەوەی کاڵا',
  'products.price_change': 'گۆڕینی نرخ',
  'products.status_change': 'گۆڕینی دۆخ',
  'customers.create': 'دروستکردنی کڕیار',
  'customers.update': 'نوێکردنەوەی کڕیار',
  'customers.status_change': 'گۆڕینی دۆخی کڕیار',
  'sales.completed': 'تەواوکردنی فرۆشتن',
  'sales.cancelled': 'هەڵوەشاندنەوەی فرۆشتن',
  'payments.created': 'تۆمارکردنی پارەدان',
  'debt.added': 'زیادکردنی قەرز',
  'debt.payment': 'پارەدانی قەرز',
  'stock.adjusted': 'ڕێکخستنەوەی کۆگا',
  'stock.sale_reduced': 'کەمکردنەوەی کۆگا بۆ فرۆشتن',
  'settings.changed': 'گۆڕینی ڕێکخستنەکان',
  'permissions.changed': 'گۆڕینی ڕێگەپێدان',
  'feature_flags.changed': 'گۆڕینی تایبەتمەندی',
  'receipt.generated': 'دروستکردنی وەسڵ',
};

const MODULE_LABELS: Record<string, string> = {
  auth: 'ڕاگەیاندن',
  products: 'کاڵاکان',
  customers: 'کڕیاران',
  sales: 'فرۆشتن',
  payments: 'پارەدان',
  debt: 'قەرز',
  inventory: 'کۆگا',
  settings: 'ڕێکخستنەکان',
  permissions: 'ڕێگەپێدان',
};

export function AuditPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterModule, setFilterModule] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const { getAuditLogs } = useDataStore();

  const auditLogs = getAuditLogs();

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = searchQuery === '' ||
      log.action.includes(searchQuery) ||
      log.record_id?.includes(searchQuery);
    const matchesModule = filterModule === 'all' || log.module === filterModule;
    let matchesDate = true;
    if (filterDate !== 'all') {
      const logDate = new Date(log.created_at);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (filterDate === 'today') matchesDate = logDate >= today;
      else if (filterDate === 'week') matchesDate = logDate >= new Date(today.getTime() - 7 * 86400000);
      else if (filterDate === 'month') matchesDate = logDate >= new Date(today.getTime() - 30 * 86400000);
    }
    return matchesSearch && matchesModule && matchesDate;
  });

  const moduleOptions = [
    { value: 'all', label: translations.common.all },
    { value: 'auth', label: 'ڕاگەیاندن' },
    { value: 'products', label: 'کاڵاکان' },
    { value: 'customers', label: 'کڕیاران' },
    { value: 'sales', label: 'فرۆشتن' },
    { value: 'payments', label: 'پارەدان' },
    { value: 'debt', label: 'قەرز' },
    { value: 'inventory', label: 'کۆگا' },
    { value: 'settings', label: 'ڕێکخستنەکان' },
  ];

  const getActionBadgeVariant = (action: string): 'success' | 'danger' | 'warning' | 'info' | 'default' => {
    if (action.includes('create') || action.includes('completed')) return 'success';
    if (action.includes('cancelled') || action.includes('failed')) return 'danger';
    if (action.includes('update') || action.includes('change')) return 'warning';
    if (action.includes('login') || action.includes('logout')) return 'info';
    return 'default';
  };

  return (
    <div>
      <PageHeader
        title={translations.audit.title}
        subtitle={`${auditLogs.length} تۆمار`}
      />

      <PageContent>
        {/* Filters */}
        <Card>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder={translations.common.search}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-5 h-5" />}
              />
            </div>
            <div className="w-full sm:w-40">
              <Select
                value={filterModule}
                onChange={(e) => setFilterModule(e.target.value)}
                options={moduleOptions}
              />
            </div>
            <div className="w-full sm:w-36">
              <Select
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                options={[
                  { value: 'all', label: 'هەموو' },
                  { value: 'today', label: 'ئەمڕۆ' },
                  { value: 'week', label: 'ئەم هەفتە' },
                  { value: 'month', label: 'ئەم مانگە' },
                ]}
              />
            </div>
          </div>
        </Card>

        {/* Mobile Audit List */}
        <div className="lg:hidden">
          {filteredLogs.length === 0 ? (
            <Card>
              <EmptyTable
                message="هیچ تۆمارێک نییە"
                icon={<History className="w-12 h-12" />}
              />
            </Card>
          ) : (
            <DataList>
              {filteredLogs.map(log => (
                <DataListItem key={log.id} onClick={() => setSelectedLog(log)}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Activity className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <Badge variant={getActionBadgeVariant(log.action)} size="sm">
                          {ACTION_LABELS[log.action] || log.action}
                        </Badge>
                        <p className="text-xs text-slate-500 mt-1">
                          {MODULE_LABELS[log.module] || log.module}
                        </p>
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(log.created_at), 'yyyy/MM/dd HH:mm')}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </DataListItem>
              ))}
            </DataList>
          )}
        </div>

        {/* Desktop Audit Table */}
        <Card padding="none" className="hidden lg:block">
          {filteredLogs.length === 0 ? (
            <EmptyTable
              message="هیچ تۆمارێک نییە"
              icon={<History className="w-16 h-16" />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{translations.audit.date}</TableHead>
                  <TableHead>{translations.audit.module}</TableHead>
                  <TableHead>{translations.audit.action}</TableHead>
                  <TableHead>ئایدی تۆمار</TableHead>
                  <TableHead>{translations.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span>{format(new Date(log.created_at), 'yyyy/MM/dd HH:mm')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">
                        {MODULE_LABELS[log.module] || log.module}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getActionBadgeVariant(log.action)}>
                        {ACTION_LABELS[log.action] || log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.record_id || '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </PageContent>

      {/* Log Details Modal */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title={translations.audit.details}
        size="lg"
      >
        {selectedLog && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500">{translations.audit.date}</p>
                <p className="font-medium text-sm">{format(new Date(selectedLog.created_at), 'yyyy/MM/dd HH:mm:ss')}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500">{translations.audit.module}</p>
                <p className="font-medium text-sm">{MODULE_LABELS[selectedLog.module] || selectedLog.module}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500">{translations.audit.action}</p>
                <Badge variant={getActionBadgeVariant(selectedLog.action)} size="sm">
                  {ACTION_LABELS[selectedLog.action] || selectedLog.action}
                </Badge>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500">ئایدی تۆمار</p>
                <p className="font-mono text-xs truncate">{selectedLog.record_id || '-'}</p>
              </div>
            </div>

            {selectedLog.old_value && (
              <div className="p-3 bg-red-50 rounded-xl">
                <p className="text-xs text-red-600 mb-2">{translations.audit.old_value}</p>
                <pre className="text-xs bg-white p-2 rounded-lg overflow-x-auto max-h-32">
                  {JSON.stringify(selectedLog.old_value, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.new_value && (
              <div className="p-3 bg-emerald-50 rounded-xl">
                <p className="text-xs text-emerald-600 mb-2">{translations.audit.new_value}</p>
                <pre className="text-xs bg-white p-2 rounded-lg overflow-x-auto max-h-32">
                  {JSON.stringify(selectedLog.new_value, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.ip_address && (
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500">{translations.audit.ip_address}</p>
                <p className="font-mono text-sm">{selectedLog.ip_address}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
