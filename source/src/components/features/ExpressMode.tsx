// ==============================================
// ZHIROX - Express Checkout Mode
// تایبەتمەندی: دۆخی پارەدانی خێرا
// ==============================================

import { useState } from 'react';
import { Zap, X, ShoppingCart, Check } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { toast } from '../ui/Toast';
import { cn } from '../../utils/cn';

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} د.ع`;
}

interface ExpressModeProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExpressMode({ isOpen, onClose }: ExpressModeProps) {
  const [barcode, setBarcode] = useState('');
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  
  const { user } = useAuthStore();
  const { 
    cart,
    getProductByBarcode, 
    addToCart,
    clearCart,
    completeSale,
  } = useDataStore();

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) return;

    const product = getProductByBarcode(barcode.trim());
    if (product) {
      addToCart(product);
      setLastAdded(product.name);
      setTimeout(() => setLastAdded(null), 1500);
    } else {
      toast.error('کاڵا نەدۆزرایەوە');
    }
    setBarcode('');
  };

  const handleQuickSale = () => {
    if (!user || cart.items.length === 0) return;

    const result = completeSale(user.id);
    if (result.success) {
      toast.success(`فرۆشتن تەواوبوو - ${formatCurrency(result.sale?.total_amount || 0)}`);
    } else {
      toast.error('هەڵە لە فرۆشتن');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6" />
          <div>
            <h1 className="font-bold text-lg">دۆخی خێرا</h1>
            <p className="text-indigo-200 text-sm">سکان و فرۆشتن</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-xl transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex flex-col h-[calc(100vh-72px)]">
        {/* Barcode Input */}
        <div className="p-4">
          <form onSubmit={handleBarcodeSubmit}>
            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="بارکۆد سکان بکە..."
              className="w-full px-6 py-5 bg-slate-800 border-2 border-slate-700 rounded-2xl text-white text-2xl text-center font-mono placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              autoFocus
              autoComplete="off"
            />
          </form>

          {/* Last Added Feedback */}
          {lastAdded && (
            <div className="mt-4 p-4 bg-emerald-500/20 border border-emerald-500/30 rounded-xl flex items-center justify-center gap-2 animate-fadeIn">
              <Check className="w-5 h-5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">{lastAdded} زیادکرا</span>
            </div>
          )}
        </div>

        {/* Cart Summary */}
        <div className="flex-1 p-4 overflow-y-auto">
          {cart.items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
              <ShoppingCart className="w-16 h-16 mb-4" />
              <p>سەبەتە بەتاڵە</p>
              <p className="text-sm mt-1">بارکۆد سکان بکە</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.items.map((item, index) => (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-center justify-between p-4 bg-slate-800 rounded-xl',
                    index === 0 && 'border-2 border-indigo-500'
                  )}
                >
                  <div>
                    <p className="text-white font-medium">{item.product.name}</p>
                    <p className="text-slate-400 text-sm">
                      {item.quantity} × {formatCurrency(item.unit_price)}
                    </p>
                  </div>
                  <p className="text-indigo-400 font-bold text-lg">
                    {formatCurrency(item.total_price)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="p-4 bg-slate-800 border-t border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400">کۆی گشتی</span>
            <span className="text-3xl font-bold text-white">
              {formatCurrency(cart.total_amount)}
            </span>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => clearCart()}
              disabled={cart.items.length === 0}
              className="flex-1 py-4 bg-slate-700 text-white rounded-xl font-medium disabled:opacity-50"
            >
              سڕینەوە
            </button>
            <button
              onClick={handleQuickSale}
              disabled={cart.items.length === 0}
              className="flex-[2] py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl font-bold text-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Check className="w-6 h-6" />
              فرۆشتن
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Express mode toggle button
export function ExpressModeButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-36 lg:bottom-20 right-20 z-30 w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all hover:scale-105"
        title="دۆخی خێرا"
      >
        <Zap className="w-6 h-6" />
      </button>
      
      <ExpressMode isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
