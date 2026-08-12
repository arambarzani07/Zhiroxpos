// ==============================================
// ZHIROX - Currency Calculator Widget
// تایبەتمەندی: ژمێرەری گۆڕینی دراو (IQD ↔ USD)
// ==============================================

import { useState } from 'react';
import { Calculator, ArrowLeftRight, X } from 'lucide-react';


const EXCHANGE_RATE = 1500; // 1 USD = 1500 IQD

export function CurrencyCalculator({ onClose }: { onClose?: () => void }) {
  const [amount, setAmount] = useState<string>('');
  const [fromCurrency, setFromCurrency] = useState<'IQD' | 'USD'>('IQD');

  const convertedAmount = () => {
    const num = parseFloat(amount) || 0;
    if (fromCurrency === 'IQD') {
      return (num / EXCHANGE_RATE).toFixed(2);
    }
    return (num * EXCHANGE_RATE).toLocaleString();
  };

  const toCurrency = fromCurrency === 'IQD' ? 'USD' : 'IQD';

  const toggleCurrency = () => {
    setFromCurrency(fromCurrency === 'IQD' ? 'USD' : 'IQD');
    setAmount('');
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-4 w-72">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Calculator className="w-4 h-4 text-indigo-600" />
          </div>
          <h3 className="font-semibold text-slate-900">گۆڕینی دراو</h3>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        )}
      </div>

      <div className="space-y-3">
        {/* From Currency */}
        <div className="p-3 bg-slate-50 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">لە</span>
            <span className="text-xs font-medium text-indigo-600">
              {fromCurrency === 'IQD' ? 'دینار' : 'دۆلار'}
            </span>
          </div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full text-2xl font-bold text-slate-900 bg-transparent outline-none text-left"
            dir="ltr"
          />
        </div>

        {/* Toggle Button */}
        <div className="flex justify-center">
          <button
            onClick={toggleCurrency}
            className="p-2 bg-indigo-100 rounded-full hover:bg-indigo-200 transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4 text-indigo-600" />
          </button>
        </div>

        {/* To Currency */}
        <div className="p-3 bg-indigo-50 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">بۆ</span>
            <span className="text-xs font-medium text-indigo-600">
              {toCurrency === 'IQD' ? 'دینار' : 'دۆلار'}
            </span>
          </div>
          <p className="text-2xl font-bold text-indigo-600 text-left" dir="ltr">
            {toCurrency === 'USD' ? '$' : ''}{convertedAmount()}{toCurrency === 'IQD' ? ' د.ع' : ''}
          </p>
        </div>

        {/* Exchange Rate */}
        <p className="text-center text-xs text-slate-500">
          ڕێژەی گۆڕین: $1 = {EXCHANGE_RATE.toLocaleString()} د.ع
        </p>
      </div>
    </div>
  );
}

// Floating calculator button
export function CurrencyCalculatorButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-20 lg:bottom-4 right-4 z-30">
      {isOpen && (
        <div className="absolute bottom-14 right-0 animate-slideUp">
          <CurrencyCalculator onClose={() => setIsOpen(false)} />
        </div>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-xl flex items-center justify-center shadow-lg hover:shadow-xl transition-all hover:scale-105"
        title="ژمێرەری گۆڕینی دراو"
      >
        <Calculator className="w-6 h-6" />
      </button>
    </div>
  );
}
