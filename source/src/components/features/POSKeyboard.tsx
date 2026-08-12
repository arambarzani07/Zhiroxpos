import { useEffect } from 'react';


interface POSKeyboardProps {
  onNewSale?: () => void;
  onCompleteSale?: () => void;
  onHoldCart?: () => void;
  onClearCart?: () => void;
  onFocusSearch?: () => void;
  onToggleCustomer?: () => void;
}

export function usePOSKeyboard({
  onNewSale, onCompleteSale, onHoldCart, onClearCart, onFocusSearch, onToggleCustomer,
}: POSKeyboardProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;

      switch (e.key) {
        case 'F1': e.preventDefault(); onNewSale?.(); break;
        case 'F2': e.preventDefault(); onFocusSearch?.(); break;
        case 'F4': e.preventDefault(); onToggleCustomer?.(); break;
        case 'F5': e.preventDefault(); onCompleteSale?.(); break;
        case 'F8': e.preventDefault(); onHoldCart?.(); break;
        case 'F9': e.preventDefault(); onClearCart?.(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNewSale, onCompleteSale, onHoldCart, onClearCart, onFocusSearch, onToggleCustomer]);
}

export function POSShortcutsHelp() {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      {[
        ['F1', 'فرۆشتنی نوێ'],
        ['F2', 'گەڕان'],
        ['F4', 'کڕیار'],
        ['F5', 'تەواوکردن'],
        ['F8', 'هەڵگرتن'],
        ['F9', 'بەتاڵکردن'],
      ].map(([key, label]) => (
        <div key={key} className="flex items-center justify-between p-1.5 bg-slate-50 rounded-lg">
          <span className="text-slate-600">{label}</span>
          <kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px] font-mono">{key}</kbd>
        </div>
      ))}
    </div>
  );
}
