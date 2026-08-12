import { useState, useEffect, useRef } from 'react';
import {
  Search,
  Barcode,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  User,
  CreditCard,
  Banknote,
  Percent,
  CheckCircle,
  X,
  Printer,
  ChevronUp,
  ChevronDown,
  Pause,
  Play,
  Tag,
  RotateCcw,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { translations } from '../constants/translations';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { toast } from '../components/ui/Toast';
import { PaymentTypeBadge } from '../components/ui/Badge';
import { cn } from '../utils/cn';
import type { Product, PaymentType, Sale, CartItem } from '../types';
import { format } from 'date-fns';
import { POSCalculatorButton } from '../components/features/POSCalculator';
import { CustomerDebtWarning } from '../components/features/CustomerDebtAlert';
import { VoiceSearch } from '../components/features/VoiceSearch';
import { CashSessionBar } from '../components/features/CashSession';
import { SaleReturnModal } from '../components/features/SaleReturn';
import { usePOSKeyboard } from '../components/features/POSKeyboard';
import { FavoriteProductsBar, FavoriteButton } from '../components/features/FavoriteProducts';
import { useStockAlertSound } from '../components/features/StockAlertSound';
import { PriceCheckerModal } from '../components/features/PriceChecker';
import { QuickCustomerAddModal } from '../components/features/QuickCustomerAdd';
import { LastSaleReprintButton } from '../components/features/LastSalesWidget';
import { ProductQuickView } from '../components/features/ProductQuickView';
import { ApiError, serverApi } from '../services/serverApi';

function formatCurrency(amount: number, currency: 'IQD' | 'USD' = 'IQD'): string {
  if (currency === 'USD') return `$${amount.toLocaleString()}`;
  return `${amount.toLocaleString()} د.ع`;
}

// Held carts stored in localStorage
function getHeldCarts(): { id: string; items: CartItem[]; customer?: string; total: number; time: string }[] {
  try {
    return JSON.parse(localStorage.getItem('zhirox-held-carts') || '[]');
  } catch { return []; }
}
function saveHeldCarts(carts: any[]) {
  localStorage.setItem('zhirox-held-carts', JSON.stringify(carts));
}

export function POSPage() {
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [completedItems, setCompletedItems] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [showHeldCarts, setShowHeldCarts] = useState(false);
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [discountValue, setDiscountValue] = useState(0);
  const [showReturn, setShowReturn] = useState(false);
  const [showPriceChecker, setShowPriceChecker] = useState(false);
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const pendingOperationRef = useRef<{key:string;operationId:string}|null>(null);

  const { user } = useAuthStore();
  const {
    cart,
    getProducts,
    getCategories,
    getCustomers,
    getProductByBarcode,
    addToCart,
    updateCartItemQuantity,
    removeFromCart,
    clearCart,
    setCartCustomer,
    setCartPaymentType,
    setCartPaidAmount,
    setCartDiscount,
    applyAuthoritativeSale,
    getCustomerBalance,
  } = useDataStore();

  const products = getProducts().filter(p => p.status === 'active');
  const categories = getCategories();
  const customers = getCustomers().filter(c => c.status === 'active');
  const { playSaleSound } = useStockAlertSound();

  // POS Keyboard Shortcuts
  usePOSKeyboard({
    onNewSale: () => clearCart(),
    onCompleteSale: () => handleCompleteSale(),
    onHoldCart: () => handleHoldCart(),
    onClearCart: () => clearCart(),
    onFocusSearch: () => barcodeInputRef.current?.focus(),
    onToggleCustomer: () => setShowCustomerModal(true),
  });

  useEffect(() => {
    if (window.innerWidth >= 1024) barcodeInputRef.current?.focus();
  }, []);

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const barcode = searchQuery.trim();
    if (!barcode) return;
    const product = getProductByBarcode(barcode);
    if (product) {
      handleAddToCart(product);
      setSearchQuery('');
      toast.success(translations.pos.product_added);
    } else {
      toast.error(translations.errors.PRODUCT_NOT_FOUND);
    }
    barcodeInputRef.current?.focus();
  };

  const handleAddToCart = (product: Product) => {
    if (product.is_trackable && product.stock_quantity <= 0) {
      toast.error(translations.errors.INSUFFICIENT_STOCK);
      return;
    }
    addToCart(product);
  };

  const handleCompleteSale = async () => {
    if (!user || isCompleting || cart.items.length===0) return;
    const savedItems=[...cart.items]; const cartSnapshot={...cart,items:[...cart.items]};
    const pending=pendingOperationRef.current||{key:serverApi.createOperationId('sale-key'),operationId:serverApi.createOperationId('sale-op')};
    pendingOperationRef.current=pending; setIsCompleting(true);
    try {
      const response=await serverApi.commitSale({client_operation_id:pending.operationId,customer_id:cart.customer_id,payment_method:cart.payment_type,paid_method:'cash',paid_iqd:cart.paid_amount,discount_iqd:cart.discount_amount,items:cart.items.map(item=>({product_id:item.product.id,quantity:item.quantity}))},pending.key);
      const sale=applyAuthoritativeSale(response,user.id,cartSnapshot);
      setCompletedSale(sale);
      setCompletedItems(response.items.map(line=>{const original=savedItems.find(item=>item.product.id===line.product_id);return original?{...original,quantity:line.quantity,unit_price:line.unit_price_iqd,total_price:line.line_total_iqd}:{id:`receipt-${line.product_id}`,product_id:line.product_id,product:{id:line.product_id,name:line.product_name,barcode:line.barcode} as Product,quantity:line.quantity,unit_price:line.unit_price_iqd,discount_amount:0,total_price:line.line_total_iqd};}) as CartItem[]);
      pendingOperationRef.current=null; setShowReceiptModal(true); setShowMobileCart(false); setDiscountValue(0); playSaleSound(); toast.success(translations.pos.sale_completed);
    } catch(error) {
      const code=error instanceof ApiError?error.code:'UNKNOWN_ERROR';
      const messages:Record<string,string>={NETWORK_UNAVAILABLE:'پەیوەندی بە سێرڤەر نییە؛ مامەڵە تۆمار نەکرا',STOCK_INSUFFICIENT:'کۆگا بەس نییە',PRODUCT_UNAVAILABLE:'کالا لە سێرڤەر بەردەست نییە',CREDIT_LIMIT_EXCEEDED:'سنووری قەرزی کڕیار تێدەپەڕێت',CUSTOMER_REQUIRED_FOR_DEBT:'بۆ قەرز کڕیار دیاری بکە',DISCOUNT_REQUIRES_APPROVAL:'داشکاندن پێویستی بە پەسەندی بەڕێوەبەر هەیە',VERSION_CONFLICT:'داتا لە ئامێرێکی تر گۆڕاوە'};
      toast.error(messages[code]||code);
    } finally { setIsCompleting(false); }
  };

  const handleSelectCustomer = (customerId: string | undefined) => {
    setCartCustomer(customerId);
    setShowCustomerModal(false);
  };

  const handlePaymentTypeChange = (type: PaymentType) => {
    if (type === 'debt' || type === 'mixed') {
      if (!cart.customer_id) {
        toast.error(translations.errors.CUSTOMER_REQUIRED_FOR_DEBT);
        setShowCustomerModal(true);
        return;
      }
      const customer = customers.find(c => c.id === cart.customer_id);
      if (customer?.status === 'blocked') {
        toast.error(translations.errors.CUSTOMER_BLOCKED);
        return;
      }
    }
    setCartPaymentType(type);
  };

  const handleApplyDiscount = () => {
    setCartDiscount(discountValue);
    setShowDiscountInput(false);
    toast.success(`داشکاندنی ${formatCurrency(discountValue)} زیادکرا`);
  };

  // Hold cart
  const handleHoldCart = () => {
    if (cart.items.length === 0) return;
    const held = getHeldCarts();
    held.push({
      id: Date.now().toString(),
      items: cart.items,
      customer: cart.customer?.name,
      total: cart.total_amount,
      time: new Date().toISOString(),
    });
    saveHeldCarts(held);
    clearCart();
    toast.info('سەبەتە هەڵگیرا');
  };

  // Resume held cart
  const handleResumeCart = (heldId: string) => {
    const held = getHeldCarts();
    const found = held.find(h => h.id === heldId);
    if (found) {
      clearCart();
      found.items.forEach(item => addToCart(item.product, item.quantity));
      saveHeldCarts(held.filter(h => h.id !== heldId));
      setShowHeldCarts(false);
      toast.success('سەبەتە گەڕایەوە');
    }
  };

  const filteredProducts = products.filter(p => {
    const q = searchQuery;
    const matchesSearch = q === '' || p.name.includes(q) || p.barcode.includes(q) || (p.barcodes && p.barcodes.some(b => b.includes(q)));
    const matchesCategory = selectedCategory === 'all' || p.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const selectedCustomer = cart.customer_id ? customers.find(c => c.id === cart.customer_id) : null;
  const customerBalance = cart.customer_id ? getCustomerBalance(cart.customer_id) : null;
  const heldCarts = getHeldCarts();

  // ========================= CART CONTENT =========================
  const CartContent = () => (
    <>
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">{translations.pos.cart}</h2>
            {cart.items.length > 0 && (
              <span className="bg-indigo-100 text-indigo-600 text-xs font-medium px-2 py-0.5 rounded-full">{cart.items.length}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Hold Cart */}
            {cart.items.length > 0 && (
              <button onClick={handleHoldCart} className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg" title="هەڵگرتنی سەبەتە">
                <Pause className="w-4 h-4" />
              </button>
            )}
            {/* Resume */}
            {heldCarts.length > 0 && (
              <button onClick={() => setShowHeldCarts(true)} className="relative p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg" title="گەڕانەوەی سەبەتە">
                <Play className="w-4 h-4" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{heldCarts.length}</span>
              </button>
            )}
            {/* Discount */}
            {cart.items.length > 0 && (
              <button onClick={() => setShowDiscountInput(!showDiscountInput)} className="p-1.5 text-purple-500 hover:bg-purple-50 rounded-lg" title="داشکاندن">
                <Tag className="w-4 h-4" />
              </button>
            )}
            {cart.items.length > 0 && (
              <button onClick={clearCart} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Discount Input */}
        {showDiscountInput && (
          <div className="mt-3 p-3 bg-purple-50 rounded-xl flex items-center gap-2 animate-slideUp">
            <input type="number" value={discountValue} onChange={e => setDiscountValue(Number(e.target.value))} max={cart.subtotal} className="flex-1 px-3 py-2 border border-purple-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" placeholder="بڕی داشکاندن" />
            <Button size="sm" onClick={handleApplyDiscount}>تەواو</Button>
          </div>
        )}

        {/* Customer Selection */}
        <button onClick={() => setShowCustomerModal(true)} className="w-full mt-3 p-3 bg-slate-50 rounded-xl flex items-center gap-3 hover:bg-slate-100 transition-colors">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <User className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="flex-1 text-right">
            {selectedCustomer ? (
              <>
                <p className="font-medium text-slate-900">{selectedCustomer.name}</p>
                {customerBalance && customerBalance.balance_iqd > 0 && (
                  <p className="text-xs text-red-500">قەرز: {formatCurrency(customerBalance.balance_iqd)}</p>
                )}
              </>
            ) : (
              <p className="text-slate-500">{translations.pos.select_customer}</p>
            )}
          </div>
        </button>
        {cart.customer_id && <CustomerDebtWarning customerId={cart.customer_id} />}
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto p-4">
        {cart.items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <ShoppingCart className="w-12 h-12 mb-4" />
            <p>{translations.pos.empty_cart}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cart.items.map(item => (
              <div key={item.id} className="p-3 bg-slate-50 rounded-xl">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 line-clamp-1 text-sm">{item.product.name}</p>
                    <p className="text-sm text-indigo-600">{formatCurrency(item.unit_price)}</p>
                  </div>
                  <button onClick={() => removeFromCart(item.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateCartItemQuantity(item.id, item.quantity - 1)} className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-100">
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-8 text-center font-medium">{item.quantity}</span>
                    <button onClick={() => updateCartItemQuantity(item.id, item.quantity + 1)} disabled={item.product.is_trackable && item.quantity >= item.product.stock_quantity} className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-100 disabled:opacity-50">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="font-semibold text-slate-900">{formatCurrency(item.total_price)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment Section */}
      <div className="p-4 border-t border-slate-100 bg-slate-50">
        <div className="flex gap-2 mb-4">
          {(['cash', 'debt', 'mixed'] as PaymentType[]).map(type => (
            <button key={type} onClick={() => handlePaymentTypeChange(type)} className={cn(
              'flex-1 py-2 rounded-xl font-medium flex items-center justify-center gap-1.5 transition-colors text-sm',
              cart.payment_type === type
                ? type === 'cash' ? 'bg-emerald-600 text-white' : type === 'debt' ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
            )}>
              {type === 'cash' ? <Banknote className="w-4 h-4" /> : type === 'debt' ? <CreditCard className="w-4 h-4" /> : <Percent className="w-4 h-4" />}
              {type === 'cash' ? translations.pos.cash : type === 'debt' ? translations.pos.debt : translations.pos.mixed}
            </button>
          ))}
        </div>

        {cart.payment_type === 'mixed' && (
          <div className="mb-4 p-3 bg-white rounded-xl">
            <label className="text-sm text-slate-600 mb-1 block">{translations.pos.paid_amount}</label>
            <input type="number" value={cart.paid_amount} onChange={(e) => setCartPaidAmount(Number(e.target.value))} max={cart.total_amount} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <p className="text-sm text-red-500 mt-1">{translations.pos.debt_amount}: {formatCurrency(cart.debt_amount)}</p>
          </div>
        )}

        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-slate-600 text-sm">
            <span>{translations.pos.subtotal}</span>
            <span>{formatCurrency(cart.subtotal)}</span>
          </div>
          {cart.discount_amount > 0 && (
            <div className="flex justify-between text-emerald-600 text-sm">
              <span>{translations.pos.discount}</span>
              <span>-{formatCurrency(cart.discount_amount)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200">
            <span>{translations.pos.total}</span>
            <span>{formatCurrency(cart.total_amount)}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <POSCalculatorButton totalDue={cart.total_amount} onConfirm={(amount) => setCartPaidAmount(amount)} />
          <Button onClick={() => void handleCompleteSale()} disabled={cart.items.length === 0 || isCompleting} isLoading={isCompleting} className="flex-1 py-3.5 text-base" leftIcon={<CheckCircle className="w-5 h-5" />}>
            {translations.pos.complete_sale}
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="h-[calc(100vh-5rem)] lg:h-[calc(100vh-3rem)] flex flex-col lg:flex-row gap-4">
      {/* Products Section */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Cash Session + Tools */}
        <div className="flex items-center gap-2 mb-3 flex-shrink-0 flex-wrap">
          <CashSessionBar />
          <button onClick={() => setShowReturn(true)} className="px-3 py-2 bg-amber-100 text-amber-700 rounded-xl text-sm font-medium hover:bg-amber-200 transition-colors flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">گەڕانەوە</span>
          </button>
          <button onClick={() => setShowPriceChecker(true)} className="px-3 py-2 bg-purple-100 text-purple-700 rounded-xl text-sm font-medium hover:bg-purple-200 transition-colors flex items-center gap-1.5">
            🏷️
            <span className="hidden sm:inline">نرخ</span>
          </button>
          <LastSaleReprintButton />
        </div>

        <Card className="mb-4 flex-shrink-0" padding="sm">
          <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Barcode className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input ref={barcodeInputRef} type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={translations.pos.scan_barcode} className="w-full pr-10 pl-4 py-2.5 lg:py-3 bg-slate-50 border border-slate-200 rounded-xl text-base lg:text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" autoComplete="off" />
            </div>
            <Button type="submit" size="lg" className="px-4"><Search className="w-5 h-5" /></Button>
            <VoiceSearch onProductFound={(p) => handleAddToCart(p)} />
          </form>
        </Card>

        {/* Favorite Products */}
        <FavoriteProductsBar onSelect={(p) => handleAddToCart(p)} />

        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 flex-shrink-0">
          <button onClick={() => setSelectedCategory('all')} className={cn('px-3 py-2 rounded-xl font-medium whitespace-nowrap transition-colors text-sm', selectedCategory === 'all' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100')}>
            {translations.products.all_categories}
          </button>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={cn('px-3 py-2 rounded-xl font-medium whitespace-nowrap transition-colors text-sm', selectedCategory === cat.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100')}>
              {cat.name}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-3">
            {filteredProducts.map(product => (
              <button key={product.id} onClick={() => handleAddToCart(product)} onContextMenu={(e) => { e.preventDefault(); setQuickViewProduct(product); }} disabled={product.is_trackable && product.stock_quantity <= 0} className={cn('p-3 lg:p-4 bg-white rounded-xl border-2 text-right transition-all hover:border-indigo-300 hover:shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed', product.is_trackable && product.stock_quantity <= product.low_stock_limit ? 'border-amber-200' : 'border-slate-100')}>
                <p className="font-semibold text-slate-900 mb-1 line-clamp-2 text-sm lg:text-base">{product.name}</p>
                <p className="text-xs text-slate-500 mb-2 hidden sm:block">{product.barcode}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm lg:text-lg font-bold text-indigo-600">{formatCurrency(product.sale_price, product.currency)}</span>
                  <div className="flex items-center gap-1">
                    {product.is_trackable && (
                      <span className={cn('text-xs font-medium', product.stock_quantity <= product.low_stock_limit ? 'text-amber-600' : 'text-slate-500')}>{product.stock_quantity}</span>
                    )}
                    <FavoriteButton productId={product.id} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop Cart */}
      <div className="hidden lg:flex w-96 flex-col">
        <Card className="flex-1 flex flex-col" padding="none"><CartContent /></Card>
      </div>

      {/* Mobile Cart Toggle */}
      <div className="lg:hidden fixed bottom-4 left-4 right-4 z-30">
        <button onClick={() => setShowMobileCart(!showMobileCart)} className="w-full bg-indigo-600 text-white py-4 rounded-2xl shadow-lg flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-6 h-6" />
            <span className="font-semibold">{cart.items.length} کاڵا</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-bold text-lg">{formatCurrency(cart.total_amount)}</span>
            {showMobileCart ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </div>
        </button>
      </div>

      {/* Mobile Cart Modal */}
      {showMobileCart && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileCart(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl max-h-[85vh] flex flex-col animate-slideUp">
            <div className="flex justify-center py-2"><div className="w-12 h-1 bg-slate-300 rounded-full" /></div>
            <CartContent />
          </div>
        </div>
      )}

      {/* Customer Modal */}
      <Modal isOpen={showCustomerModal} onClose={() => setShowCustomerModal(false)} title={translations.pos.select_customer} size="lg">
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          <button onClick={() => { setShowCustomerModal(false); setShowQuickCustomer(true); }} className="w-full p-3 text-right bg-indigo-50 hover:bg-indigo-100 rounded-xl border-2 border-dashed border-indigo-300 flex items-center justify-center gap-2 text-indigo-600 font-medium">
            + کڕیاری نوێ زیاد بکە
          </button>
          <button onClick={() => handleSelectCustomer(undefined)} className="w-full p-3 text-right bg-slate-50 hover:bg-slate-100 rounded-xl">
            <p className="font-medium text-slate-500">{translations.pos.no_customer}</p>
          </button>
          {customers.map(customer => {
            const balance = getCustomerBalance(customer.id);
            return (
              <button key={customer.id} onClick={() => handleSelectCustomer(customer.id)} className={cn('w-full p-3 text-right rounded-xl', cart.customer_id === customer.id ? 'bg-indigo-50 border-2 border-indigo-300' : 'bg-slate-50 hover:bg-slate-100')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{customer.name}</p>
                    <p className="text-sm text-slate-500">{customer.phone}</p>
                  </div>
                  {balance && balance.balance_iqd > 0 && <span className="text-red-500 font-medium">{formatCurrency(balance.balance_iqd)}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </Modal>

      {/* Held Carts Modal */}
      <Modal isOpen={showHeldCarts} onClose={() => setShowHeldCarts(false)} title="سەبەتەکانی هەڵگیراو" size="md">
        {heldCarts.length === 0 ? (
          <div className="text-center py-8 text-slate-500"><Pause className="w-10 h-10 mx-auto mb-2 text-slate-300" /><p className="text-sm">هیچ سەبەتەیەکی هەڵگیراو نییە</p></div>
        ) : (
          <div className="space-y-3">
            {heldCarts.map(held => (
              <button key={held.id} onClick={() => handleResumeCart(held.id)} className="w-full p-4 bg-slate-50 hover:bg-indigo-50 rounded-xl text-right transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-500">{format(new Date(held.time), 'HH:mm')}</span>
                  <span className="font-bold text-indigo-600">{formatCurrency(held.total)}</span>
                </div>
                <p className="text-sm text-slate-700">{held.items.length} کاڵا {held.customer ? `• ${held.customer}` : ''}</p>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* Receipt Modal with Item Details */}
      <Modal isOpen={showReceiptModal} onClose={() => { setShowReceiptModal(false); setCompletedSale(null); setCompletedItems([]); }} title={translations.pos.receipt} size="md">
        {completedSale && (
          <div className="print-area" id="receipt-content">
            <div className="text-center border-b border-dashed border-slate-300 pb-4 mb-4">
              <h2 className="text-2xl font-black">ZHIROX</h2>
              <p className="text-sm text-slate-500">سوپەرمارکێت</p>
              <p className="text-xs text-slate-400">سلێمانی • 07501234567</p>
            </div>

            <div className="space-y-1.5 text-sm mb-4">
              <div className="flex justify-between"><span className="text-slate-500">وەسڵ:</span><span className="font-bold">{completedSale.receipt_number}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">بەروار:</span><span>{format(new Date(completedSale.created_at), 'yyyy/MM/dd HH:mm')}</span></div>
              {completedSale.customer && <div className="flex justify-between"><span className="text-slate-500">کڕیار:</span><span>{completedSale.customer.name}</span></div>}
            </div>

            <div className="border-t border-dashed border-slate-300 pt-3 mb-3">
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs font-bold text-slate-500 mb-2 px-1">
                <span>کاڵا</span><span>بڕ</span><span>نرخ</span>
              </div>
              {completedItems.map(item => (
                <div key={item.id} className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm py-1.5 border-b border-slate-100 px-1">
                  <span className="truncate">{item.product.name}</span>
                  <span className="text-slate-500">{item.quantity}</span>
                  <span className="font-medium">{formatCurrency(item.total_price)}</span>
                </div>
              ))}
            </div>

            <div className="border-t-2 border-dashed border-slate-300 pt-3 space-y-1.5">
              {completedSale.discount_amount > 0 && (
                <><div className="flex justify-between text-sm"><span>کۆی ناو:</span><span>{formatCurrency(completedSale.subtotal)}</span></div>
                <div className="flex justify-between text-sm text-emerald-600"><span>داشکاندن:</span><span>-{formatCurrency(completedSale.discount_amount)}</span></div></>
              )}
              <div className="flex justify-between text-xl font-black pt-1"><span>کۆی گشتی:</span><span>{formatCurrency(completedSale.total_amount)}</span></div>
              {completedSale.paid_amount > 0 && <div className="flex justify-between text-sm text-emerald-600"><span>پارەی دراو:</span><span>{formatCurrency(completedSale.paid_amount)}</span></div>}
              {completedSale.debt_amount > 0 && <div className="flex justify-between text-sm text-red-600"><span>قەرز:</span><span>{formatCurrency(completedSale.debt_amount)}</span></div>}
            </div>

            <div className="mt-4 text-center">
              <PaymentTypeBadge type={completedSale.payment_type} />
            </div>

            <div className="mt-6 pt-4 border-t border-dashed border-slate-300 text-center">
              <p className="text-base font-bold">سوپاس بۆ کڕینت! 🙏</p>
              <p className="text-xs text-slate-400 mt-1">ZHIROX HyperMarket Autopilot OS</p>
            </div>

            <div className="flex gap-3 mt-6 no-print">
              <Button variant="secondary" className="flex-1" onClick={() => { setShowReceiptModal(false); setCompletedSale(null); setCompletedItems([]); }}>
                {translations.pos.new_transaction}
              </Button>
              <Button className="flex-1" leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
                {translations.pos.print_receipt}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Return Modal */}
      <SaleReturnModal isOpen={showReturn} onClose={() => setShowReturn(false)} />

      {/* Price Checker */}
      <PriceCheckerModal isOpen={showPriceChecker} onClose={() => setShowPriceChecker(false)} />

      {/* Quick Customer Add */}
      <QuickCustomerAddModal isOpen={showQuickCustomer} onClose={() => setShowQuickCustomer(false)} onCreated={(id) => { setCartCustomer(id); }} />

      {/* Product Quick View */}
      {quickViewProduct && (
        <ProductQuickView product={quickViewProduct} onClose={() => setQuickViewProduct(null)} onAddToCart={(p) => handleAddToCart(p)} />
      )}
    </div>
  );
}
