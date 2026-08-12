import { useState } from 'react';
import {
  Plus,
  Search,
  Users,
  Edit,
  Phone,
  MapPin,
  CreditCard,
  Eye,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { translations } from '../constants/translations';
import { PERMISSIONS } from '../constants/permissions';
import { PageHeader, PageContent } from '../components/layout/Layout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { StatusBadge } from '../components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyTable, DataList, DataListItem } from '../components/ui/Table';
import { toast } from '../components/ui/Toast';
import { CustomerDetailModal } from '../components/features/CustomerDetail';
import { exportCustomersData } from '../components/features/DataExport';
import type { Customer } from '../types';
import { ApiError, serverApi } from '../services/serverApi';

function formatCurrency(amount: number, currency: 'IQD' | 'USD' = 'IQD'): string {
  if (currency === 'USD') {
    return `$${amount.toLocaleString()}`;
  }
  return `${amount.toLocaleString()} د.ع`;
}

export function CustomersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDebt, setFilterDebt] = useState<'all' | 'with_debt' | 'no_debt'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);

  const { hasPermission, user } = useAuthStore();
  const { getCustomers, getCustomerBalance, upsertAuthoritativeCustomer } = useDataStore();

  const customers = getCustomers();

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = searchQuery === '' ||
      c.name.includes(searchQuery) ||
      c.phone?.includes(searchQuery) ||
      c.code.includes(searchQuery);
    
    if (filterDebt === 'all') return matchesSearch;
    
    const balance = getCustomerBalance(c.id);
    const hasDebt = balance && balance.balance_iqd > 0;
    
    if (filterDebt === 'with_debt') return matchesSearch && hasDebt;
    if (filterDebt === 'no_debt') return matchesSearch && !hasDebt;
    
    return matchesSearch;
  });

  const handleSaveCustomer = async (customerData: Partial<Customer>) => {
    if (!user?.market_id || !user.branch_id) { toast.error('هەژماری فرۆشگا/لق دیاری نەکراوە'); return; }
    try {
      const {customer}=await serverApi.saveCustomer({id:editingCustomer?.id,version:editingCustomer?.version,code:editingCustomer?.code||`C-${Date.now()}`,name:customerData.name||editingCustomer?.name||'',phone:customerData.phone,address:customerData.address,notes:customerData.notes,debt_limit_iqd:customerData.debt_limit??editingCustomer?.debt_limit??null,status:(customerData.status||editingCustomer?.status||'active') as 'active'|'blocked'});
      upsertAuthoritativeCustomer(customer); toast.success(editingCustomer?translations.success.customer_updated:translations.success.customer_created); setEditingCustomer(null); setShowAddModal(false);
    } catch(error){const code=error instanceof ApiError?error.code:'UNKNOWN_ERROR';toast.error(code==='VERSION_CONFLICT'?'کڕیارەکە لە ئامێرێکی تر گۆڕاوە؛ پەڕەکە نوێ بکەرەوە':code==='CUSTOMER_CODE_DUPLICATE'?'کۆدی کڕیار دووبارەیە':code);}
  };

  const debtFilterOptions = [
    { value: 'all', label: translations.common.all },
    { value: 'with_debt', label: translations.customers.has_debt },
    { value: 'no_debt', label: translations.customers.no_debt },
  ];

  return (
    <div>
      <PageHeader
        title={translations.customers.title}
        subtitle={`${customers.length} کڕیار`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportCustomersData(filteredCustomers, getCustomerBalance)}>
              📥 CSV
            </Button>
            {hasPermission(PERMISSIONS.CUSTOMERS_CREATE) && (
              <Button onClick={() => setShowAddModal(true)} leftIcon={<Plus className="w-4 h-4" />} size="sm">
                {translations.customers.add_customer}
              </Button>
            )}
          </div>
        }
      />

      <PageContent>
        {/* Filters */}
        <Card>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder={translations.customers.search}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-5 h-5" />}
              />
            </div>
            <div className="w-full sm:w-40">
              <Select
                value={filterDebt}
                onChange={(e) => setFilterDebt(e.target.value as typeof filterDebt)}
                options={debtFilterOptions}
              />
            </div>
          </div>
        </Card>

        {/* Customers - Mobile Cards */}
        <div className="lg:hidden">
          {filteredCustomers.length === 0 ? (
            <Card>
              <EmptyTable
                message={translations.common.no_data}
                icon={<Users className="w-12 h-12" />}
              />
            </Card>
          ) : (
            <DataList>
              {filteredCustomers.map(customer => {
                const balance = getCustomerBalance(customer.id);
                const totalDebt = balance?.balance_iqd || 0;

                return (
                  <DataListItem key={customer.id}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-indigo-600">{customer.code}</span>
                          <StatusBadge status={customer.status} />
                        </div>
                        <p className="font-semibold text-slate-900 mt-1">{customer.name}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setViewingCustomer(customer)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      {hasPermission(PERMISSIONS.CUSTOMERS_EDIT) && (
                        <Button variant="ghost" size="sm" onClick={() => setEditingCustomer(customer)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                      {customer.phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <span>{customer.phone}</span>
                        </div>
                      )}
                      {customer.address && (
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span>{customer.address}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                      <span className="text-sm text-slate-500">{translations.customers.total_debt}</span>
                      {totalDebt > 0 ? (
                        <span className="font-semibold text-red-600 flex items-center gap-1">
                          <CreditCard className="w-4 h-4" />
                          {formatCurrency(totalDebt)}
                        </span>
                      ) : (
                        <span className="text-emerald-600 text-sm">{translations.customers.no_debt}</span>
                      )}
                    </div>
                  </DataListItem>
                );
              })}
            </DataList>
          )}
        </div>

        {/* Customers Table - Desktop */}
        <Card padding="none" className="hidden lg:block">
          {filteredCustomers.length === 0 ? (
            <EmptyTable
              message={translations.common.no_data}
              icon={<Users className="w-16 h-16" />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{translations.customers.code}</TableHead>
                  <TableHead>{translations.customers.name}</TableHead>
                  <TableHead>{translations.customers.phone}</TableHead>
                  <TableHead>{translations.customers.address}</TableHead>
                  <TableHead>{translations.customers.total_debt}</TableHead>
                  <TableHead>{translations.customers.debt_limit}</TableHead>
                  <TableHead>{translations.customers.status}</TableHead>
                  <TableHead>{translations.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map(customer => {
                  const balance = getCustomerBalance(customer.id);
                  const totalDebt = balance?.balance_iqd || 0;

                  return (
                    <TableRow key={customer.id}>
                      <TableCell className="font-mono font-medium text-indigo-600">
                        {customer.code}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-900">{customer.name}</p>
                      </TableCell>
                      <TableCell>
                        {customer.phone && (
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Phone className="w-4 h-4" />
                            {customer.phone}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {customer.address && (
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <MapPin className="w-4 h-4" />
                            {customer.address}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {totalDebt > 0 ? (
                          <div className="flex items-center gap-1.5 text-red-600 font-medium">
                            <CreditCard className="w-4 h-4" />
                            {formatCurrency(totalDebt)}
                          </div>
                        ) : (
                          <span className="text-emerald-600">{translations.customers.no_debt}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {customer.debt_limit ? formatCurrency(customer.debt_limit) : '-'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={customer.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setViewingCustomer(customer)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {hasPermission(PERMISSIONS.CUSTOMERS_EDIT) && (
                            <Button variant="ghost" size="sm" onClick={() => setEditingCustomer(customer)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </PageContent>

      {/* Add/Edit Customer Modal */}
      <CustomerFormModal
        isOpen={showAddModal || !!editingCustomer}
        onClose={() => {
          setShowAddModal(false);
          setEditingCustomer(null);
        }}
        customer={editingCustomer}
        onSave={(data) => void handleSaveCustomer(data)}
      />

      <CustomerDetailModal
        isOpen={!!viewingCustomer}
        onClose={() => setViewingCustomer(null)}
        customer={viewingCustomer}
      />
    </div>
  );
}

interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  onSave: (data: Partial<Customer>) => void;
}

function CustomerFormModal({ isOpen, onClose, customer, onSave }: CustomerFormModalProps) {
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: '',
    phone: '',
    address: '',
    notes: '',
    debt_limit: undefined,
    status: 'active',
  });

  useState(() => {
    if (customer) {
      setFormData(customer);
    } else {
      setFormData({
        name: '',
        phone: '',
        address: '',
        notes: '',
        debt_limit: undefined,
        status: 'active',
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const statusOptions = [
    { value: 'active', label: translations.customers.active },
    { value: 'blocked', label: translations.customers.blocked },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={customer ? translations.customers.edit_customer : translations.customers.add_customer}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={translations.customers.name}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={translations.customers.phone}
            value={formData.phone || ''}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
          <Input
            label={translations.customers.debt_limit}
            type="number"
            value={formData.debt_limit || ''}
            onChange={(e) => setFormData({ ...formData, debt_limit: Number(e.target.value) || undefined })}
          />
        </div>

        <Input
          label={translations.customers.address}
          value={formData.address || ''}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
        />

        <Input
          label={translations.customers.notes}
          value={formData.notes || ''}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />

        {customer && (
          <Select
            label={translations.customers.status}
            value={formData.status || 'active'}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'blocked' })}
            options={statusOptions}
          />
        )}

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">
            {translations.common.cancel}
          </Button>
          <Button type="submit" className="w-full sm:w-auto">
            {translations.common.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
