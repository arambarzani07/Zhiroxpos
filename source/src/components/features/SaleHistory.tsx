// ==============================================
// ZHIROX - Sale History & Details Viewer
// تایبەتمەندی: مێژووی فرۆشتن و وردەکاری وەسڵ
// ==============================================

import { useState } from 'react';
import { Receipt, Search, Calendar, XCircle, AlertTriangle } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { PaymentTypeBadge, StatusBadge } from '../ui/Badge';
import { toast } from '../ui/Toast';
import { cn } from '../../utils/cn';
import { format } from 'date-fns';
import type { Sale } from '../../types';

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} د.ع`;
}

export function SaleHistoryModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  
  const { user } = useAuthStore();
  const { getSales, saleItems, addAuditLog } = useDataStore();
  const sales = getSales().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const filteredSales = sales.filter(s =>
    searchQuery === '' ||
    s.receipt_number.includes(searchQuery) ||
    s.customer?.name.includes(searchQuery)
  );

  const getSaleItems = (saleId: string) => saleItems.filter(si => si.sale_id === saleId);

  const handleCancelSale = () => {
    if (!selectedSale || !user) return;
    // Mark sale as cancelled (soft delete)
    const { sales: allSales } = useDataStore.getState();
    useDataStore.setState({
      sales: allSales.map(s => s.id === selectedSale.id ? { ...s, status: 'cancelled' as const, updated_at: new Date().toISOString() } : s),
    });
    addAuditLog({
      market_id: 'market-1',
      branch_id: 'branch-1',
      user_id: user.id,
      action: 'sales.cancelled',
      module: 'sales',
      table_name: 'sales',
      record_id: selectedSale.id,
      old_value: { status: 'completed' },
      new_value: { status: 'cancelled' },
    });
    toast.warning(`فرۆشتنی ${selectedSale.receipt_number} هەڵوەشێنرایەوە`);
    setShowCancelConfirm(false);
    setSelectedSale(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="مێژووی فرۆشتنەکان" size="xl">
      <div className="space-y-4">
        <Input placeholder="گەڕان بە ژمارەی وەسڵ یان ناوی کڕیار" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} leftIcon={<Search className="w-5 h-5" />} />

        <div className="max-h-[60vh] overflow-y-auto space-y-2">
          {filteredSales.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Receipt className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">هیچ فرۆشتنێک نییە</p>
            </div>
          ) : (
            filteredSales.map(sale => (
              <div
                key={sale.id}
                className={cn(
                  'p-4 rounded-xl border transition-colors cursor-pointer',
                  sale.status === 'cancelled' ? 'bg-red-50 border-red-200 opacity-70' : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'
                )}
                onClick={() => setSelectedSale(sale)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm">{sale.receipt_number}</span>
                    <StatusBadge status={sale.status} />
                  </div>
                  <span className="text-xl font-bold text-slate-900">{formatCurrency(sale.total_amount)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(sale.created_at), 'yyyy/MM/dd HH:mm')}</span>
                    {sale.customer && <span>{sale.customer.name}</span>}
                  </div>
                  <PaymentTypeBadge type={sale.payment_type} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Sale Detail Modal */}
      <Modal isOpen={!!selectedSale} onClose={() => setSelectedSale(null)} title={`وەسڵ: ${selectedSale?.receipt_number}`} size="md">
        {selectedSale && (
          <div className="space-y-4">
            {/* Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl"><p className="text-xs text-slate-500">بەروار</p><p className="font-medium text-sm">{format(new Date(selectedSale.created_at), 'yyyy/MM/dd HH:mm')}</p></div>
              <div className="p-3 bg-slate-50 rounded-xl"><p className="text-xs text-slate-500">دۆخ</p><StatusBadge status={selectedSale.status} /></div>
              <div className="p-3 bg-slate-50 rounded-xl"><p className="text-xs text-slate-500">کڕیار</p><p className="font-medium text-sm">{selectedSale.customer?.name || '-'}</p></div>
              <div className="p-3 bg-slate-50 rounded-xl"><p className="text-xs text-slate-500">جۆری پارەدان</p><PaymentTypeBadge type={selectedSale.payment_type} /></div>
            </div>

            {/* Items */}
            <div className="border rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs font-bold text-slate-500 bg-slate-50 px-4 py-2">
                <span>کاڵا</span><span>بڕ</span><span>نرخ</span>
              </div>
              {getSaleItems(selectedSale.id).map(item => (
                <div key={item.id} className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm px-4 py-2.5 border-t border-slate-100">
                  <span className="truncate">{item.product?.name || 'کاڵا'}</span>
                  <span className="text-slate-500">{item.quantity} × {formatCurrency(item.unit_price)}</span>
                  <span className="font-medium">{formatCurrency(item.total_price)}</span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="space-y-2 p-4 bg-slate-50 rounded-xl">
              {selectedSale.discount_amount > 0 && (
                <div className="flex justify-between text-sm"><span>کۆی ناو:</span><span>{formatCurrency(selectedSale.subtotal)}</span></div>
              )}
              {selectedSale.discount_amount > 0 && (
                <div className="flex justify-between text-sm text-emerald-600"><span>داشکاندن:</span><span>-{formatCurrency(selectedSale.discount_amount)}</span></div>
              )}
              <div className="flex justify-between font-bold text-lg"><span>کۆی گشتی:</span><span>{formatCurrency(selectedSale.total_amount)}</span></div>
              {selectedSale.paid_amount > 0 && <div className="flex justify-between text-sm text-emerald-600"><span>پارەی دراو:</span><span>{formatCurrency(selectedSale.paid_amount)}</span></div>}
              {selectedSale.debt_amount > 0 && <div className="flex justify-between text-sm text-red-600"><span>قەرز:</span><span>{formatCurrency(selectedSale.debt_amount)}</span></div>}
            </div>

            {/* Cancel Button */}
            {selectedSale.status === 'completed' && (
              <Button variant="danger" className="w-full" leftIcon={<XCircle className="w-4 h-4" />} onClick={() => setShowCancelConfirm(true)}>
                هەڵوەشاندنەوەی فرۆشتن
              </Button>
            )}

            {selectedSale.status === 'cancelled' && (
              <div className="p-3 bg-red-50 rounded-xl flex items-center gap-2 text-red-700 text-sm">
                <AlertTriangle className="w-4 h-4" />
                ئەم فرۆشتنە هەڵوەشێنراوەتەوە
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Cancel Confirmation */}
      <Modal isOpen={showCancelConfirm} onClose={() => setShowCancelConfirm(false)} title="هەڵوەشاندنەوەی فرۆشتن" size="sm">
        <div className="text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
          <p className="text-slate-700">دڵنیایت لە هەڵوەشاندنەوەی فرۆشتنی <strong>{selectedSale?.receipt_number}</strong>؟</p>
          <p className="text-sm text-slate-500">ئەم کردارە ناگەڕێتەوە</p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setShowCancelConfirm(false)}>نەخێر</Button>
            <Button variant="danger" className="flex-1" onClick={handleCancelSale}>بەڵێ، هەڵبوەشێنە</Button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}
