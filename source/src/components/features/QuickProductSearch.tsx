// ==============================================
// ZHIROX - Quick Product Search with Preview
// تایبەتمەندی: گەڕانی خێرا بە پێشبینی
// ==============================================

import { useState, useEffect, useRef } from 'react';
import { Search, Package, Barcode, X, Plus } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { cn } from '../../utils/cn';
import type { Product } from '../../types';

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} د.ع`;
}

interface QuickProductSearchProps {
  onSelect: (product: Product) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function QuickProductSearch({ 
  onSelect, 
  placeholder = 'گەڕان بۆ کاڵا...', 
  autoFocus = false 
}: QuickProductSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { getProducts, getCategories } = useDataStore();
  const products = getProducts().filter(p => p.status === 'active');
  const categories = getCategories();

  const filteredProducts = query.length > 0
    ? products.filter(p =>
        p.name.includes(query) ||
        p.barcode.includes(query) ||
        (p.barcodes && p.barcodes.some(b => b.includes(query))) ||
        p.name_en?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : [];

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredProducts.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredProducts[selectedIndex]) {
          handleSelect(filteredProducts[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setQuery('');
        break;
    }
  };

  const handleSelect = (product: Product) => {
    onSelect(product);
    setQuery('');
    setIsOpen(false);
    setSelectedIndex(0);
    inputRef.current?.focus();
  };

  const getCategoryName = (categoryId?: string) => {
    if (!categoryId) return '';
    return categories.find(c => c.id === categoryId)?.name || '';
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(0);
          }}
          onFocus={() => query.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pr-10 pl-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          autoComplete="off"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && filteredProducts.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 animate-slideUp">
          {filteredProducts.map((product, index) => (
            <button
              key={product.id}
              onClick={() => handleSelect(product)}
              className={cn(
                'w-full flex items-center gap-3 p-3 text-right transition-colors',
                index === selectedIndex ? 'bg-indigo-50' : 'hover:bg-slate-50'
              )}
            >
              <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Package className="w-6 h-6 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate">{product.name}</p>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Barcode className="w-3 h-3" />
                    {product.barcode}
                  </span>
                  {getCategoryName(product.category_id) && (
                    <span className="px-1.5 py-0.5 bg-slate-100 rounded">
                      {getCategoryName(product.category_id)}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-left flex-shrink-0">
                <p className="font-semibold text-indigo-600">{formatCurrency(product.sale_price)}</p>
                <p className={cn(
                  'text-xs',
                  product.stock_quantity <= product.low_stock_limit ? 'text-red-500' : 'text-slate-500'
                )}>
                  {product.stock_quantity} {product.unit}
                </p>
              </div>
              <Plus className="w-5 h-5 text-slate-400" />
            </button>
          ))}
        </div>
      )}

      {/* No Results */}
      {isOpen && query.length > 0 && filteredProducts.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 p-6 text-center z-50">
          <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">هیچ کاڵایەک نەدۆزرایەوە</p>
        </div>
      )}
    </div>
  );
}
