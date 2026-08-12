// Kurdish Number Formatter Utilities

// Utility: Kurdish/Arabic number converter
const latinToKurdish: Record<string, string> = { '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤', '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩' };
const kurdishToLatin: Record<string, string> = Object.fromEntries(Object.entries(latinToKurdish).map(([k, v]) => [v, k]));

export function toKurdishNumber(n: string | number): string {
  return String(n).replace(/[0-9]/g, d => latinToKurdish[d] || d);
}

export function toLatinNumber(s: string): string {
  return s.replace(/[٠-٩]/g, d => kurdishToLatin[d] || d);
}

export function formatKurdishCurrency(amount: number, currency: 'IQD' | 'USD' = 'IQD'): string {
  const formatted = toKurdishNumber(amount.toLocaleString());
  return currency === 'USD' ? `$${formatted}` : `${formatted} د.ع`;
}

// Widget to show both formats
export function DualNumberDisplay({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className="text-lg font-bold text-slate-900">{value.toLocaleString()}</p>
      <p className="text-xs text-indigo-500 font-medium" dir="rtl">{toKurdishNumber(value.toLocaleString())}</p>
    </div>
  );
}
