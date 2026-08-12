// ==============================================
// ZHIROX - POS Calculator
// تایبەتمەندی: ژمێرەری کاشێر بۆ پارە هەژماردنەوە
// ==============================================

import { useState } from 'react';
import { Calculator, Delete } from 'lucide-react';
import { Modal } from '../ui/Modal';

function formatCurrency(amount: number): string {
  return amount.toLocaleString();
}

interface POSCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: (amount: number) => void;
  initialValue?: number;
  totalDue?: number;
}

export function POSCalculator({ isOpen, onClose, onConfirm, initialValue = 0, totalDue }: POSCalculatorProps) {
  const [display, setDisplay] = useState(initialValue > 0 ? initialValue.toString() : '');
  const [hasDecimal, setHasDecimal] = useState(false);

  const handleNumber = (num: string) => {
    if (display.length >= 12) return;
    setDisplay(prev => prev + num);
  };

  const handleDecimal = () => {
    if (hasDecimal) return;
    setDisplay(prev => (prev || '0') + '.');
    setHasDecimal(true);
  };

  const handleDelete = () => {
    setDisplay(prev => {
      const newVal = prev.slice(0, -1);
      if (!newVal.includes('.')) setHasDecimal(false);
      return newVal;
    });
  };

  const handleClear = () => {
    setDisplay('');
    setHasDecimal(false);
  };

  const handleConfirm = () => {
    const amount = parseFloat(display) || 0;
    if (onConfirm) onConfirm(amount);
    onClose();
  };

  const currentAmount = parseFloat(display) || 0;
  const change = totalDue ? currentAmount - totalDue : 0;

  const buttons = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['.', '0', 'DEL'],
  ];

  // Quick amount buttons (IQD denominations)
  const quickAmounts = [1000, 5000, 10000, 25000, 50000, 100000];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ژمێرەری پارە" size="sm">
      <div className="space-y-4">
        {/* Display */}
        <div className="bg-slate-900 rounded-2xl p-4">
          {totalDue && (
            <div className="flex justify-between text-sm text-slate-400 mb-2">
              <span>پارەی پێویست:</span>
              <span>{formatCurrency(totalDue)} د.ع</span>
            </div>
          )}
          <div className="text-left" dir="ltr">
            <p className="text-4xl font-bold text-white font-mono">
              {display || '0'}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {formatCurrency(currentAmount)} د.ع
            </p>
          </div>
          {totalDue && currentAmount > 0 && (
            <div className={`mt-3 pt-3 border-t border-slate-700 flex justify-between text-sm ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              <span>پارەی گەڕاوە:</span>
              <span className="font-bold">{formatCurrency(Math.max(0, change))} د.ع</span>
            </div>
          )}
        </div>

        {/* Quick Amounts */}
        <div className="grid grid-cols-3 gap-2">
          {quickAmounts.map(amount => (
            <button
              key={amount}
              onClick={() => {
                setDisplay(amount.toString());
                setHasDecimal(false);
              }}
              className="py-2.5 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-medium hover:bg-indigo-100 transition-colors"
            >
              {formatCurrency(amount)}
            </button>
          ))}
        </div>

        {/* Number Pad */}
        <div className="grid grid-cols-3 gap-2">
          {buttons.flat().map(btn => (
            <button
              key={btn}
              onClick={() => {
                if (btn === 'DEL') handleDelete();
                else if (btn === '.') handleDecimal();
                else handleNumber(btn);
              }}
              className={`py-4 rounded-xl text-lg font-bold transition-colors ${
                btn === 'DEL'
                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300'
              }`}
            >
              {btn === 'DEL' ? <Delete className="w-5 h-5 mx-auto" /> : btn}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleClear}
            className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300 transition-colors"
          >
            سڕینەوە
          </button>
          {onConfirm && (
            <button
              onClick={handleConfirm}
              className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors"
            >
              ✓ تەواو
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Floating calculator button for POS
export function POSCalculatorButton({ totalDue, onConfirm }: { totalDue?: number; onConfirm?: (amount: number) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        title="ژمێرەر"
      >
        <Calculator className="w-5 h-5 text-slate-600" />
      </button>
      
      <POSCalculator
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={onConfirm}
        totalDue={totalDue}
      />
    </>
  );
}
