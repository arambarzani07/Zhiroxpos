import { useState } from 'react';
import { RotateCw, Printer } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { PaymentTypeBadge } from '../ui/Badge';
import { format } from 'date-fns';

function fmt(n: number) { return `${n.toLocaleString()} د.ع`; }

export function LastSaleReprintButton() {
  const [showReceipt, setShowReceipt] = useState(false);
  const { getRecentSales, saleItems } = useDataStore();
  const lastSale = getRecentSales(1)[0];

  if (!lastSale) return null;

  const items = saleItems.filter(si => si.sale_id === lastSale.id);

  return (
    <>
      <button onClick={() => setShowReceipt(true)} className="px-3 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors flex items-center gap-1.5" title="چاپی دوایین وەسڵ">
        <RotateCw className="w-4 h-4" />
        <span className="hidden sm:inline">دوایین وەسڵ</span>
      </button>

      <Modal isOpen={showReceipt} onClose={() => setShowReceipt(false)} title="دوایین وەسڵ" size="md">
        <div className="print-area">
          <div className="text-center border-b border-dashed border-slate-300 pb-4 mb-4">
            <h2 className="text-2xl font-black">ZHIROX</h2>
            <p className="text-sm text-slate-500">سوپەرمارکێت</p>
          </div>

          <div className="space-y-1.5 text-sm mb-4">
            <div className="flex justify-between"><span className="text-slate-500">وەسڵ:</span><span className="font-bold">{lastSale.receipt_number}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">بەروار:</span><span>{format(new Date(lastSale.created_at), 'yyyy/MM/dd HH:mm')}</span></div>
            {lastSale.customer && <div className="flex justify-between"><span className="text-slate-500">کڕیار:</span><span>{lastSale.customer.name}</span></div>}
          </div>

          <div className="border-t border-dashed border-slate-300 pt-3 mb-3">
            {items.map(item => (
              <div key={item.id} className="flex justify-between text-sm py-1.5 border-b border-slate-100">
                <span className="truncate flex-1">{item.product?.name || 'کاڵا'}</span>
                <span className="text-slate-500 mx-2">{item.quantity}×</span>
                <span className="font-medium">{fmt(item.total_price)}</span>
              </div>
            ))}
          </div>

          <div className="border-t-2 border-dashed border-slate-300 pt-3 space-y-1.5">
            <div className="flex justify-between text-xl font-black"><span>کۆ:</span><span>{fmt(lastSale.total_amount)}</span></div>
            {lastSale.paid_amount > 0 && <div className="flex justify-between text-sm text-emerald-600"><span>دراو:</span><span>{fmt(lastSale.paid_amount)}</span></div>}
            {lastSale.debt_amount > 0 && <div className="flex justify-between text-sm text-red-600"><span>قەرز:</span><span>{fmt(lastSale.debt_amount)}</span></div>}
          </div>

          <div className="mt-4 text-center"><PaymentTypeBadge type={lastSale.payment_type} /></div>

          <div className="mt-6 text-center text-sm text-slate-500">سوپاس بۆ کڕینت! 🙏</div>

          <div className="mt-6 flex gap-3 no-print">
            <Button variant="secondary" className="flex-1" onClick={() => setShowReceipt(false)}>داخستن</Button>
            <Button className="flex-1" leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>چاپکردن</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
