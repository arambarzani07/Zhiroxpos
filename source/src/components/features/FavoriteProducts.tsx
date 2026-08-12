import { useState } from 'react';
import { Star } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { cn } from '../../utils/cn';
import type { Product } from '../../types';

function fmt(n: number) { return `${n.toLocaleString()} د.ع`; }

function getFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem('zhirox-favorites') || '[]'); } catch { return []; }
}
function saveFavorites(f: string[]) { localStorage.setItem('zhirox-favorites', JSON.stringify(f)); }

export function useFavoriteProducts() {
  const [favIds, setFavIds] = useState<string[]>(getFavorites());
  const { getProductById } = useDataStore();

  const toggle = (productId: string) => {
    const updated = favIds.includes(productId) ? favIds.filter(id => id !== productId) : [...favIds, productId];
    setFavIds(updated);
    saveFavorites(updated);
  };

  const isFavorite = (productId: string) => favIds.includes(productId);
  const favorites = favIds.map(id => getProductById(id)).filter(Boolean) as Product[];

  return { favorites, toggle, isFavorite, favIds };
}

export function FavoriteButton({ productId }: { productId: string }) {
  const { isFavorite, toggle } = useFavoriteProducts();
  const fav = isFavorite(productId);

  return (
    <button onClick={(e) => { e.stopPropagation(); toggle(productId); }}
      className={cn('p-1 rounded-lg transition-colors', fav ? 'text-amber-500 hover:text-amber-600' : 'text-slate-300 hover:text-amber-400')}
      title={fav ? 'لابردنی دڵخواز' : 'زیادکردن بە دڵخواز'}>
      <Star className={cn('w-4 h-4', fav && 'fill-current')} />
    </button>
  );
}

export function FavoriteProductsBar({ onSelect }: { onSelect: (product: Product) => void }) {
  const { favorites } = useFavoriteProducts();

  if (favorites.length === 0) return null;

  return (
    <div className="mb-3 flex-shrink-0">
      <div className="flex items-center gap-2 mb-2">
        <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
        <span className="text-xs font-medium text-slate-500">دڵخوازەکان</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {favorites.map(product => (
          <button key={product.id} onClick={() => onSelect(product)}
            disabled={product.is_trackable && product.stock_quantity <= 0}
            className="flex-shrink-0 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-sm hover:bg-amber-100 transition-colors disabled:opacity-50 flex items-center gap-2">
            <span className="font-medium text-slate-900 whitespace-nowrap">{product.name}</span>
            <span className="text-xs text-amber-700 font-bold">{fmt(product.sale_price)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
