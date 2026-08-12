import { useState } from 'react';
import { Search, Barcode, Tag, Package } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { Product } from '../../types';

function fmt(n: number) { return `${n.toLocaleString()} د.ع`; }

export function PriceCheckerModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { getProducts, getProductByBarcode, getCategories } = useDataStore();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Product | null>(null);
  const categories = getCategories();

  const handleSearch = () => {
    const q = query.trim();
    if (!q) return;
    const byBarcode = getProductByBarcode(q);
    if (byBarcode) { setResult(byBarcode); return; }
    const byName = getProducts().find((p) => p.status === 'active' && (p.name.includes(q) || p.name_en?.toLowerCase().includes(q.toLowerCase())));
    setResult(byName || null);
  };

  const categoryName = result ? categories.find((c) => c.id === result.category_id)?.name : '';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="پشکنینی نرخ" size="md">
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Barcode className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="بارکۆد یان ناوی کاڵا..."
              className="w-full pr-10 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </div>
          <Button onClick={handleSearch}><Search className="w-4 h-4" /></Button>
        </div>

        {result ? (
          <div className="animate-slideUp space-y-4">
            <div className="p-5 bg-gradient-to-br from-emerald-50 to-indigo-50 rounded-2xl text-center">
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm">
                <Package className="w-7 h-7 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">{result.name}</h3>
              {result.name_en && <p className="text-sm text-slate-500">{result.name_en}</p>}
              {categoryName && <p className="text-xs text-indigo-600 mt-1">{categoryName}</p>}
            </div>

            <div className="p-5 bg-emerald-50 rounded-2xl text-center">
              <p className="text-sm text-emerald-600">نرخی فرۆشتن</p>
              <p className="text-4xl font-black text-emerald-700 mt-1">{fmt(result.sale_price)}</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl text-center">
                <p className="text-lg font-bold text-slate-900">{result.stock_quantity}</p>
                <p className="text-[10px] text-slate-500">کۆگا</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl text-center">
                <p className="text-lg font-bold text-slate-900">{fmt(result.cost_price)}</p>
                <p className="text-[10px] text-slate-500">کڕین</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl text-center">
                <p className="text-lg font-bold text-purple-600">{result.cost_price > 0 ? (((result.sale_price - result.cost_price) / result.cost_price) * 100).toFixed(0) : 0}%</p>
                <p className="text-[10px] text-slate-500">قازانج</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-center">
              {(result.barcodes?.length ? result.barcodes : [result.barcode]).map((bc, i) => (
                <span key={i} className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-mono text-xs">{bc}</span>
              ))}
            </div>

            <Button variant="secondary" className="w-full" onClick={() => { setResult(null); setQuery(''); }}>گەڕان بۆ کاڵای تر</Button>
          </div>
        ) : query ? (
          <div className="text-center py-8 text-slate-400">
            <Tag className="w-10 h-10 mx-auto mb-2" />
            <p className="text-sm">هیچ کاڵایەک نەدۆزرایەوە</p>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            <Tag className="w-10 h-10 mx-auto mb-2" />
            <p className="text-sm">بارکۆد سکان بکە یان ناوی کاڵا بنووسە</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
