// ==============================================
// ZHIROX - Smart Receipt Designer
// تایبەتمەندی: پیشاندانی وەسڵی سمارت
// ==============================================

import { format } from 'date-fns';
import type { Sale, SaleItem } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} د.ع`;
}

interface ReceiptProps {
  sale: Sale;
  items: SaleItem[];
  showPrint?: boolean;
}

export function SmartReceipt({ sale, items, showPrint = true }: ReceiptProps) {
  const { market } = useAuthStore();

  return (
    <div className="bg-white max-w-sm mx-auto print-area" id="receipt-print">
      <div className="p-6 font-mono text-sm">
        {/* Header */}
        <div className="text-center mb-4 pb-4 border-b-2 border-dashed border-slate-300">
          <div className="text-3xl font-black tracking-tight mb-1">ZHIROX</div>
          <p className="text-slate-600">{market?.name || 'سوپەرمارکێت'}</p>
          <p className="text-xs text-slate-400 mt-1">{market?.address || 'سلێمانی'}</p>
          <p className="text-xs text-slate-400">{market?.phone || '07501234567'}</p>
        </div>

        {/* Receipt Info */}
        <div className="mb-4 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">وەسڵ:</span>
            <span className="font-bold">{sale.receipt_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">بەروار:</span>
            <span>{format(new Date(sale.created_at), 'yyyy/MM/dd')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">کات:</span>
            <span>{format(new Date(sale.created_at), 'HH:mm:ss')}</span>
          </div>
          {sale.customer && (
            <div className="flex justify-between">
              <span className="text-slate-500">کڕیار:</span>
              <span>{sale.customer.name}</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-dashed border-slate-300 my-3" />

        {/* Items */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-xs font-bold text-slate-500">
            <span>کاڵا</span>
            <span>کۆ</span>
          </div>
          {items.map(item => (
            <div key={item.id}>
              <div className="flex justify-between">
                <span className="flex-1 truncate">{item.product?.name || 'کاڵا'}</span>
                <span className="font-semibold mr-4">{formatCurrency(item.total_price)}</span>
              </div>
              <p className="text-xs text-slate-400">
                {item.quantity} × {formatCurrency(item.unit_price)}
              </p>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t-2 border-dashed border-slate-300 my-3" />

        {/* Totals */}
        <div className="space-y-1">
          {sale.discount_amount > 0 && (
            <>
              <div className="flex justify-between text-sm">
                <span>کۆی ناو:</span>
                <span>{formatCurrency(sale.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-emerald-600">
                <span>داشکاندن:</span>
                <span>-{formatCurrency(sale.discount_amount)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-lg font-black pt-1">
            <span>کۆی گشتی:</span>
            <span>{formatCurrency(sale.total_amount)}</span>
          </div>
          
          {sale.paid_amount > 0 && (
            <div className="flex justify-between text-sm text-emerald-700">
              <span>پارەی دراو:</span>
              <span>{formatCurrency(sale.paid_amount)}</span>
            </div>
          )}
          {sale.debt_amount > 0 && (
            <div className="flex justify-between text-sm text-red-600">
              <span>قەرز:</span>
              <span>{formatCurrency(sale.debt_amount)}</span>
            </div>
          )}
        </div>

        {/* Payment Type */}
        <div className="mt-4 pt-3 border-t border-dashed border-slate-300 text-center">
          <span className="inline-block px-4 py-1 rounded-full text-xs font-bold bg-slate-100">
            {sale.payment_type === 'cash' ? '💵 کاش' : 
             sale.payment_type === 'debt' ? '📝 قەرز' : '💵📝 تێکەڵ'}
          </span>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t-2 border-dashed border-slate-300 text-center">
          <p className="text-lg font-bold">سوپاس بۆ کڕینت! 🙏</p>
          <p className="text-xs text-slate-400 mt-2">ZHIROX HyperMarket Autopilot OS</p>
          <div className="mt-3 flex justify-center">
            <div className="w-24 h-24 bg-slate-100 rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-20 h-20">
                {/* Simple QR-like pattern */}
                {[0,1,2,3,4,5,6].map(row => 
                  [0,1,2,3,4,5,6].map(col => (
                    <rect
                      key={`${row}-${col}`}
                      x={col * 14 + 2}
                      y={row * 14 + 2}
                      width={12}
                      height={12}
                      fill={(row + col) % 2 === 0 || (row < 3 && col < 3) || (row < 3 && col > 3) ? '#000' : 'transparent'}
                      rx={1}
                    />
                  ))
                )}
              </svg>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">سکان بکە بۆ وەسڵی دیجیتاڵ</p>
        </div>
      </div>

      {/* Print Button */}
      {showPrint && (
        <div className="px-6 pb-6 no-print">
          <button
            onClick={() => window.print()}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
          >
            🖨️ چاپکردن
          </button>
        </div>
      )}
    </div>
  );
}

// Quick receipt lookup
export function ReceiptLookup() {
  const { getSales, saleItems } = useDataStore.getState();
  const sales = getSales();
  
  return { sales, saleItems };
}
