// ==============================================
// ZHIROX - Customer Detail Modal
// تایبەتمەندی: وردەکاری کڕیار + مێژووی کڕین/قەرز/پارەدان
// ==============================================

import { useMemo } from 'react';
import { User, ShoppingBag, CreditCard, DollarSign, Calendar, Receipt, ArrowUpCircle, ArrowDownCircle, Phone, MapPin, Hash, Clock } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { Modal } from '../ui/Modal';
import { Badge, PaymentTypeBadge, StatusBadge } from '../ui/Badge';
import { cn } from '../../utils/cn';
import { format } from 'date-fns';
import type { Customer } from '../../types';

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} د.ع`;
}

interface CustomerDetailProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
}

export function CustomerDetailModal({ isOpen, onClose, customer }: CustomerDetailProps) {
  const { getSales, getCustomerBalance, getCustomerDebtTransactions, getPayments } = useDataStore();

  const data = useMemo(() => {
    if (!customer) return null;
    const balance = getCustomerBalance(customer.id);
    const sales = getSales()
      .filter(s => s.customer_id === customer.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const debtTxs = getCustomerDebtTransactions(customer.id);
    const payments = getPayments().filter(p => p.customer_id === customer.id);
    const totalSpent = sales.filter(s => s.status === 'completed').reduce((s, sale) => s + sale.total_amount, 0);
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

    return { balance, sales, debtTxs, payments, totalSpent, totalPaid };
  }, [customer, getSales, getCustomerBalance, getCustomerDebtTransactions, getPayments]);

  if (!customer || !data) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={customer.name} size="xl">
      <div className="space-y-6">
        {/* Customer Info Header */}
        <div className="flex flex-col sm:flex-row gap-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center flex-shrink-0">
            <User className="w-8 h-8 text-indigo-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-bold text-slate-900">{customer.name}</h3>
              <StatusBadge status={customer.status} />
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-slate-600">
              <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{customer.code}</span>
              {customer.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</span>}
              {customer.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{customer.address}</span>}
            </div>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              تۆمارکرا: {format(new Date(customer.created_at), 'yyyy/MM/dd')}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-red-50 rounded-xl text-center">
            <CreditCard className="w-5 h-5 text-red-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-red-600">{formatCurrency(data.balance?.balance_iqd || 0)}</p>
            <p className="text-[10px] text-slate-500">قەرزی ئێستا</p>
          </div>
          <div className="p-3 bg-indigo-50 rounded-xl text-center">
            <ShoppingBag className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-indigo-600">{formatCurrency(data.totalSpent)}</p>
            <p className="text-[10px] text-slate-500">کۆی کڕین</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-center">
            <DollarSign className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-emerald-600">{formatCurrency(data.totalPaid)}</p>
            <p className="text-[10px] text-slate-500">کۆی پارەدان</p>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl text-center">
            <Receipt className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-amber-600">{data.sales.length}</p>
            <p className="text-[10px] text-slate-500">ژمارەی کڕین</p>
          </div>
        </div>

        {/* Purchase History */}
        <div>
          <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-indigo-600" />
            مێژووی کڕین
          </h4>
          {data.sales.length === 0 ? (
            <div className="text-center py-6 text-slate-400"><p className="text-sm">هیچ کڕینێک نییە</p></div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data.sales.slice(0, 10).map(sale => (
                <div key={sale.id} className={cn('flex items-center justify-between p-3 rounded-xl', sale.status === 'cancelled' ? 'bg-red-50 opacity-60' : 'bg-slate-50')}>
                  <div>
                    <p className="font-mono text-sm font-medium">{sale.receipt_number}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(sale.created_at), 'yyyy/MM/dd HH:mm')}</p>
                  </div>
                  <div className="text-left">
                    <p className="font-semibold">{formatCurrency(sale.total_amount)}</p>
                    <PaymentTypeBadge type={sale.payment_type} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Debt History */}
        <div>
          <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-red-600" />
            مێژووی قەرز
          </h4>
          {data.debtTxs.length === 0 ? (
            <div className="text-center py-6 text-slate-400"><p className="text-sm">هیچ مامەڵەیەکی قەرز نییە</p></div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data.debtTxs.slice(0, 10).map(tx => (
                <div key={tx.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    {tx.type === 'debt_added' ? (
                      <ArrowUpCircle className="w-5 h-5 text-red-500" />
                    ) : (
                      <ArrowDownCircle className="w-5 h-5 text-emerald-500" />
                    )}
                    <div>
                      <Badge variant={tx.type === 'debt_added' ? 'danger' : 'success'} size="sm">
                        {tx.type === 'debt_added' ? 'قەرز' : 'پارەدان'}
                      </Badge>
                      <p className="text-xs text-slate-500 mt-0.5">{format(new Date(tx.created_at), 'yyyy/MM/dd HH:mm')}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className={cn('font-semibold', tx.type === 'debt_added' ? 'text-red-600' : 'text-emerald-600')}>
                      {tx.type === 'debt_added' ? '+' : '-'}{formatCurrency(Math.abs(tx.amount))}
                    </p>
                    <p className="text-xs text-slate-400">باڵانس: {formatCurrency(tx.balance_after)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {customer.notes && (
          <div className="p-3 bg-amber-50 rounded-xl">
            <p className="text-xs text-amber-700 font-medium mb-1">تێبینی:</p>
            <p className="text-sm text-amber-800">{customer.notes}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
