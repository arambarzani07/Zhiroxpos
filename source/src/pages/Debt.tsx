import { useState } from 'react';
import {
  CreditCard,
  Search,
  Users,
  DollarSign,
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  History,
  Phone,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { translations } from '../constants/translations';
import { PERMISSIONS } from '../constants/permissions';
import { PageHeader, PageContent } from '../components/layout/Layout';
import { Card, StatCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyTable, DataList, DataListItem } from '../components/ui/Table';
import { toast } from '../components/ui/Toast';
import { ExportCSVButton } from '../components/features/DataExport';
import type { Customer, DebtTransaction } from '../types';
import { format } from 'date-fns';

function formatCurrency(amount: number, currency: 'IQD' | 'USD' = 'IQD'): string {
  if (currency === 'USD') {
    return `$${amount.toLocaleString()}`;
  }
  return `${amount.toLocaleString()} د.ع`;
}

export function DebtPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showTransactionsModal, setShowTransactionsModal] = useState(false);
  const [selectedTransactions, setSelectedTransactions] = useState<DebtTransaction[]>([]);

  const { hasPermission, user } = useAuthStore();
  const {
    getCustomersWithDebt,
    getCustomers,
    getCustomerBalance,
    getCustomerDebtTransactions,
    addDebtPayment,
  } = useDataStore();

  const customersWithDebt = getCustomersWithDebt();
  const allCustomers = getCustomers().filter(c => c.status === 'active');

  const totalDebt = customersWithDebt.reduce((sum, c) => sum + (c.balance?.balance_iqd || 0), 0);

  const filteredCustomers = customersWithDebt.filter(c =>
    searchQuery === '' ||
    c.name.includes(searchQuery) ||
    c.phone?.includes(searchQuery) ||
    c.code.includes(searchQuery)
  );

  const handleViewTransactions = (customer: Customer) => {
    const transactions = getCustomerDebtTransactions(customer.id);
    setSelectedTransactions(transactions);
    setSelectedCustomer(customer);
    setShowTransactionsModal(true);
  };

  const handlePayment = (customerId: string, amount: number, notes?: string) => {
    if (!user) return;

    addDebtPayment(customerId, amount, 'IQD', user.id, notes);
    toast.success(translations.debt.payment_success);
    setShowPaymentModal(false);
    setSelectedCustomer(null);
  };

  return (
    <div>
      <PageHeader
        title={translations.debt.title}
        subtitle={`${customersWithDebt.length} کڕیاری قەرزدار`}
        action={
          <ExportCSVButton
            headers={['کۆد', 'ناو', 'ژمارە', 'قەرز (دینار)', 'قەرز (دۆلار)']}
            rows={filteredCustomers.map(c => [c.code, c.name, c.phone || '-', (c.balance?.balance_iqd || 0).toString(), (c.balance?.balance_usd || 0).toString()])}
            filename={`zhirox-debt-${new Date().toISOString().slice(0, 10)}`}
            label="📥 CSV"
          />
        }
      />

      <PageContent>
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            title={translations.debt.total_debt}
            value={formatCurrency(totalDebt)}
            icon={<CreditCard className="w-5 h-5" />}
            color="red"
          />
          <StatCard
            title={translations.debt.debt_customers}
            value={customersWithDebt.length}
            icon={<Users className="w-5 h-5" />}
            color="amber"
          />
          <StatCard
            title="کڕیارانی چالاک"
            value={allCustomers.length}
            icon={<Users className="w-5 h-5" />}
            color="indigo"
          />
        </div>

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
            {hasPermission(PERMISSIONS.DEBT_PAYMENT) && (
              <Button
                onClick={() => setShowPaymentModal(true)}
                leftIcon={<Plus className="w-4 h-4" />}
                className="w-full sm:w-auto"
              >
                {translations.debt.add_payment}
              </Button>
            )}
          </div>
        </Card>

        {/* Mobile Debt List */}
        <div className="lg:hidden">
          {filteredCustomers.length === 0 ? (
            <Card>
              <EmptyTable
                message="هیچ کڕیاری قەرزدار نییە"
                icon={<CreditCard className="w-12 h-12" />}
              />
            </Card>
          ) : (
            <DataList>
              {filteredCustomers.map(customer => (
                <DataListItem key={customer.id}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-xs font-mono text-indigo-600">{customer.code}</p>
                      <p className="font-semibold text-slate-900">{customer.name}</p>
                      {customer.phone && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <Phone className="w-3 h-3" />
                          {customer.phone}
                        </p>
                      )}
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-red-600 text-lg">
                        {formatCurrency(customer.balance?.balance_iqd || 0)}
                      </p>
                      {customer.balance?.balance_usd ? (
                        <p className="text-xs text-red-500">
                          ${customer.balance.balance_usd.toLocaleString()}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewTransactions(customer)}
                      className="flex-1"
                    >
                      <History className="w-4 h-4 ml-1" />
                      مێژوو
                    </Button>
                    {hasPermission(PERMISSIONS.DEBT_PAYMENT) && (
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setShowPaymentModal(true);
                        }}
                        className="flex-1"
                      >
                        <DollarSign className="w-4 h-4 ml-1" />
                        پارەدان
                      </Button>
                    )}
                  </div>
                </DataListItem>
              ))}
            </DataList>
          )}
        </div>

        {/* Desktop Debt Table */}
        <Card padding="none" className="hidden lg:block">
          {filteredCustomers.length === 0 ? (
            <EmptyTable
              message="هیچ کڕیاری قەرزدار نییە"
              icon={<CreditCard className="w-16 h-16" />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{translations.customers.code}</TableHead>
                  <TableHead>{translations.customers.name}</TableHead>
                  <TableHead>{translations.customers.phone}</TableHead>
                  <TableHead>{translations.debt.debt_iqd}</TableHead>
                  <TableHead>{translations.debt.debt_usd}</TableHead>
                  <TableHead>{translations.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map(customer => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-mono font-medium text-indigo-600">
                      {customer.code}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-slate-900">{customer.name}</p>
                    </TableCell>
                    <TableCell>{customer.phone || '-'}</TableCell>
                    <TableCell>
                      <span className="font-semibold text-red-600">
                        {formatCurrency(customer.balance?.balance_iqd || 0)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {customer.balance?.balance_usd ? (
                        <span className="font-semibold text-red-600">
                          ${customer.balance.balance_usd.toLocaleString()}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewTransactions(customer)}
                        >
                          <History className="w-4 h-4" />
                        </Button>
                        {hasPermission(PERMISSIONS.DEBT_PAYMENT) && (
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => {
                              setSelectedCustomer(customer);
                              setShowPaymentModal(true);
                            }}
                          >
                            <DollarSign className="w-4 h-4 ml-1" />
                            {translations.debt.pay_debt}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </PageContent>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setSelectedCustomer(null);
        }}
        customer={selectedCustomer}
        customers={allCustomers}
        getCustomerBalance={getCustomerBalance}
        onPayment={handlePayment}
      />

      {/* Transactions Modal */}
      <Modal
        isOpen={showTransactionsModal}
        onClose={() => {
          setShowTransactionsModal(false);
          setSelectedCustomer(null);
          setSelectedTransactions([]);
        }}
        title={`${translations.debt.transactions} - ${selectedCustomer?.name}`}
        size="lg"
      >
        {selectedTransactions.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <History className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm">هیچ مامەڵەیەک نییە</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {selectedTransactions.map(tx => (
              <div
                key={tx.id}
                className="p-3 bg-slate-50 rounded-xl flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  {tx.type === 'debt_added' ? (
                    <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <ArrowUpCircle className="w-5 h-5 text-red-600" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <ArrowDownCircle className="w-5 h-5 text-emerald-600" />
                    </div>
                  )}
                  <div>
                    <Badge variant={tx.type === 'debt_added' ? 'danger' : 'success'} size="sm">
                      {tx.type === 'debt_added' ? translations.debt.debt_added : translations.debt.debt_payment}
                    </Badge>
                    <p className="text-xs text-slate-500 mt-1">
                      {format(new Date(tx.created_at), 'yyyy/MM/dd HH:mm')}
                    </p>
                  </div>
                </div>
                <div className="text-left">
                  <p className={`font-semibold ${tx.type === 'debt_added' ? 'text-red-600' : 'text-emerald-600'}`}>
                    {tx.type === 'debt_added' ? '+' : '-'}{formatCurrency(Math.abs(tx.amount), tx.currency)}
                  </p>
                  <p className="text-xs text-slate-500">
                    باڵانس: {formatCurrency(tx.balance_after, tx.currency)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  customers: Customer[];
  getCustomerBalance: (id: string) => { balance_iqd: number; balance_usd: number } | undefined;
  onPayment: (customerId: string, amount: number, notes?: string) => void;
}

function PaymentModal({ isOpen, onClose, customer, customers, getCustomerBalance, onPayment }: PaymentModalProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customer?.id || '');
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');

  const currentCustomer = customer || customers.find(c => c.id === selectedCustomerId);
  const balance = currentCustomer ? getCustomerBalance(currentCustomer.id) : undefined;
  const maxAmount = balance?.balance_iqd || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCustomer || amount <= 0) return;
    onPayment(currentCustomer.id, amount, notes);
    setAmount(0);
    setNotes('');
  };

  const customerOptions = customers
    .filter(c => {
      const bal = getCustomerBalance(c.id);
      return bal && bal.balance_iqd > 0;
    })
    .map(c => ({ value: c.id, label: `${c.name} (${c.code})` }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={translations.debt.pay_debt}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!customer && (
          <Select
            label={translations.debt.customer}
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            options={[{ value: '', label: translations.pos.select_customer }, ...customerOptions]}
            required
          />
        )}

        {currentCustomer && balance && (
          <div className="p-4 bg-slate-50 rounded-xl">
            <div className="flex justify-between mb-2 text-sm">
              <span className="text-slate-600">{translations.debt.customer}:</span>
              <span className="font-medium">{currentCustomer.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 text-sm">{translations.debt.total_debt}:</span>
              <span className="font-semibold text-red-600">{formatCurrency(balance.balance_iqd)}</span>
            </div>
          </div>
        )}

        <Input
          label={translations.debt.amount}
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          max={maxAmount}
          required
        />

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAmount(maxAmount)}
            className="flex-1"
          >
            {translations.debt.full_payment}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAmount(Math.floor(maxAmount / 2))}
            className="flex-1"
          >
            نیوەی قەرز
          </Button>
        </div>

        <Input
          label={translations.debt.notes}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">
            {translations.common.cancel}
          </Button>
          <Button type="submit" disabled={!currentCustomer || amount <= 0} className="w-full sm:w-auto">
            {translations.debt.pay_debt}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
