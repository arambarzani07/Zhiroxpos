import { useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { toast } from '../ui/Toast';
import { cn } from '../../utils/cn';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';

function fmt(n: number) { return `${n.toLocaleString()} د.ع`; }

export function SaleReturnModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuthStore();
  const { getSales, saleItems, updateProductStock, getProductById, addAuditLog } = useDataStore();
  const [receiptNumber, setReceiptNumber] = useState('');
  const [foundSale, setFoundSale] = useState<any>(null);
  const [returnItems, setReturnItems] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');

  const handleSearch = () => {
    const sale = getSales().find(s => s.receipt_number === receiptNumber.trim() && s.status === 'completed');
    if (sale) {
      const items = saleItems.filter(si => si.sale_id === sale.id);
      setFoundSale({ ...sale, items });
      setReturnItems({});
    } else {
      toast.error('وەسڵ نەدۆزرایەوە یان هەڵوەشێنراوە');
      setFoundSale(null);
    }
  };

  const handleReturn = () => {
    if (!user || !foundSale) return;
    const itemsToReturn = Object.entries(returnItems).filter(([, qty]) => qty > 0);
    if (itemsToReturn.length === 0) { toast.error('هیچ کاڵایەک هەڵنەبژێردراوە'); return; }
    if (!reason.trim()) { toast.error('هۆکاری گەڕانەوە بنووسە'); return; }

    let totalRefund = 0;
    const now = new Date().toISOString();

    for (const [itemId, qty] of itemsToReturn) {
      const saleItem = foundSale.items.find((si: any) => si.id === itemId);
      if (!saleItem) continue;
      const refundAmount = saleItem.unit_price * qty;
      totalRefund += refundAmount;

      // Return stock
      const product = getProductById(saleItem.product_id);
      if (product && product.is_trackable) {
        const newStock = product.stock_quantity + qty;
        updateProductStock(product.id, newStock);

        // Stock movement
        const { stockMovements } = useDataStore.getState();
        useDataStore.setState({
          stockMovements: [...stockMovements, {
            id: `sm-${uuidv4()}`, market_id: 'market-1', branch_id: 'branch-1',
            product_id: product.id, type: 'return' as const, quantity: qty,
            stock_before: product.stock_quantity, stock_after: newStock,
            reference_type: 'sale', reference_id: foundSale.id,
            notes: reason, created_by: user.id, created_at: now,
          }],
        });
      }
    }

    // If customer had debt from this sale, reduce it
    if (foundSale.customer_id && foundSale.debt_amount > 0) {
      const refundDebt = Math.min(totalRefund, foundSale.debt_amount);
      if (refundDebt > 0) {
        useDataStore.getState().updateCustomerBalance(foundSale.customer_id, -refundDebt, foundSale.currency);
        const bal = useDataStore.getState().getCustomerBalance(foundSale.customer_id);
        const { debtTransactions } = useDataStore.getState();
        useDataStore.setState({
          debtTransactions: [...debtTransactions, {
            id: `dt-${uuidv4()}`, market_id: 'market-1', branch_id: 'branch-1',
            customer_id: foundSale.customer_id, type: 'debt_adjustment' as const,
            amount: -refundDebt, currency: foundSale.currency,
            balance_before: (bal?.balance_iqd || 0) + refundDebt, balance_after: bal?.balance_iqd || 0,
            reference_type: 'sale', reference_id: foundSale.id,
            notes: `گەڕانەوە: ${reason}`, created_by: user.id, created_at: now,
          }],
        });
      }
    }

    addAuditLog({
      market_id: 'market-1', branch_id: 'branch-1', user_id: user.id,
      action: 'sales.cancelled', module: 'sales', table_name: 'sales',
      record_id: foundSale.id,
      new_value: { type: 'return', items: itemsToReturn, total_refund: totalRefund, reason } as any,
    });

    toast.success(`گەڕانەوە تەواوبوو - ${fmt(totalRefund)}`);
    setFoundSale(null);
    setReceiptNumber('');
    setReturnItems({});
    setReason('');
    onClose();
  };

  const totalRefund = foundSale ? Object.entries(returnItems).reduce((sum, [itemId, qty]) => {
    const item = foundSale.items.find((si: any) => si.id === itemId);
    return sum + (item ? item.unit_price * qty : 0);
  }, 0) : 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="گەڕانەوەی کاڵا" size="lg">
      <div className="space-y-4">
        {/* Search */}
        <div className="flex gap-2">
          <Input value={receiptNumber} onChange={e => setReceiptNumber(e.target.value)} placeholder="ژمارەی وەسڵ بنووسە..." leftIcon={<Search className="w-4 h-4" />}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }} />
          <Button onClick={handleSearch}>گەڕان</Button>
        </div>

        {foundSale && (
          <>
            {/* Sale Info */}
            <div className="p-3 bg-indigo-50 rounded-xl text-sm">
              <div className="flex justify-between"><span>وەسڵ:</span><span className="font-bold">{foundSale.receipt_number}</span></div>
              <div className="flex justify-between"><span>بەروار:</span><span>{format(new Date(foundSale.created_at), 'yyyy/MM/dd HH:mm')}</span></div>
              <div className="flex justify-between"><span>کۆ:</span><span className="font-bold">{fmt(foundSale.total_amount)}</span></div>
              {foundSale.customer && <div className="flex justify-between"><span>کڕیار:</span><span>{foundSale.customer.name}</span></div>}
            </div>

            {/* Items to Return */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">کاڵاکان هەڵبژێرە بۆ گەڕانەوە:</p>
              {foundSale.items.map((item: any) => {
                const returnQty = returnItems[item.id] || 0;
                return (
                  <div key={item.id} className={cn('p-3 rounded-xl border', returnQty > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200')}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium text-sm">{item.product?.name || 'کاڵا'}</p>
                        <p className="text-xs text-slate-500">{item.quantity} × {fmt(item.unit_price)}</p>
                      </div>
                      <p className="font-semibold">{fmt(item.total_price)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">بڕی گەڕانەوە:</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setReturnItems({ ...returnItems, [item.id]: Math.max(0, returnQty - 1) })} className="w-7 h-7 bg-white border rounded-lg flex items-center justify-center text-sm hover:bg-slate-100">-</button>
                        <span className="w-8 text-center font-bold">{returnQty}</span>
                        <button onClick={() => setReturnItems({ ...returnItems, [item.id]: Math.min(item.quantity, returnQty + 1) })} className="w-7 h-7 bg-white border rounded-lg flex items-center justify-center text-sm hover:bg-slate-100">+</button>
                      </div>
                      <span className="text-xs text-slate-400">لە {item.quantity}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reason */}
            <Input label="هۆکاری گەڕانەوە *" value={reason} onChange={e => setReason(e.target.value)} placeholder="بۆچی گەڕاوەتەوە..." />

            {/* Refund Summary */}
            {totalRefund > 0 && (
              <div className="p-4 bg-amber-50 rounded-xl text-center">
                <RotateCcw className="w-6 h-6 text-amber-600 mx-auto mb-1" />
                <p className="text-sm text-slate-600">بڕی گەڕانەوە</p>
                <p className="text-2xl font-bold text-amber-700">{fmt(totalRefund)}</p>
              </div>
            )}

            <Button onClick={handleReturn} variant="danger" className="w-full" disabled={totalRefund === 0 || !reason.trim()} leftIcon={<RotateCcw className="w-4 h-4" />}>
              تەواوکردنی گەڕانەوە
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
