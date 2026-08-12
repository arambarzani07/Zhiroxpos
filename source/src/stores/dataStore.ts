// ==============================================
// ZHIROX HyperMarket Autopilot OS - Data Store
// Version: Final v12 - Phase 1
// ==============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type {
  Product,
  Category,
  Customer,
  CustomerBalance,
  Sale,
  SaleItem,
  Payment,
  DebtTransaction,
  StockMovement,
  AuditLog,
  DashboardSummary,
  CartItem,
  Cart,
  PaymentType,
  Currency,
} from '../types';

// ===== Production starts empty: no demo data =====

type TenantContext = { marketId: string; branchId: string };

const requireTenantContext = (context: TenantContext | null): TenantContext => {
  if (!context?.marketId || !context?.branchId) throw new Error('TENANT_CONTEXT_REQUIRED');
  return context;
};

interface DataState {
  // Data
  categories: Category[];
  products: Product[];
  customers: Customer[];
  customerBalances: CustomerBalance[];
  sales: Sale[];
  saleItems: SaleItem[];
  payments: Payment[];
  debtTransactions: DebtTransaction[];
  stockMovements: StockMovement[];
  auditLogs: AuditLog[];

  // Cart
  cart: Cart;

  // Tenant authority (set only after authenticated session)
  tenantContext: TenantContext | null;
  setTenantContext: (marketId: string, branchId: string) => void;
  clearTenantContext: () => void;

  // Counters
  receiptCounter: number;

  // Category Actions
  getCategories: () => Category[];
  getCategoryById: (id: string) => Category | undefined;
  addCategory: (category: Omit<Category, 'id' | 'created_at' | 'updated_at'>) => Category;
  updateCategory: (id: string, updates: Partial<Category>) => void;

  // Product Actions
  getProducts: () => Product[];
  getProductById: (id: string) => Product | undefined;
  getProductByBarcode: (barcode: string) => Product | undefined;
  getLowStockProducts: () => Product[];
  addProduct: (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => Product;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  updateProductStock: (id: string, quantity: number) => void;

  // Customer Actions
  getCustomers: () => Customer[];
  getCustomerById: (id: string) => Customer | undefined;
  getCustomerBalance: (customerId: string) => CustomerBalance | undefined;
  getCustomersWithDebt: () => (Customer & { balance: CustomerBalance })[];
  addCustomer: (customer: Omit<Customer, 'id' | 'code' | 'created_at' | 'updated_at'>) => Customer;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  updateCustomerBalance: (customerId: string, amount: number, currency: Currency) => void;

  // Cart Actions
  addToCart: (product: Product, quantity?: number) => void;
  updateCartItemQuantity: (itemId: string, quantity: number) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  setCartCustomer: (customerId: string | undefined) => void;
  setCartPaymentType: (type: PaymentType) => void;
  setCartPaidAmount: (amount: number) => void;
  setCartDiscount: (amount: number) => void;

  // Sale Actions
  getSales: () => Sale[];
  getSaleById: (id: string) => Sale | undefined;
  getRecentSales: (limit?: number) => Sale[];
  completeSale: (userId: string) => { success: boolean; sale?: Sale; error?: string };
  generateReceiptNumber: () => string;

  // Payment Actions
  getPayments: () => Payment[];
  addDebtPayment: (customerId: string, amount: number, currency: Currency, userId: string, notes?: string) => Payment;

  // Debt Actions
  getDebtTransactions: () => DebtTransaction[];
  getCustomerDebtTransactions: (customerId: string) => DebtTransaction[];

  // Stock Actions
  getStockMovements: () => StockMovement[];
  addStockMovement: (movement: Omit<StockMovement, 'id' | 'created_at'>) => StockMovement;
  adjustStock: (productId: string, quantity: number, type: 'adjustment' | 'opening_stock' | 'damage' | 'lost', userId: string, notes?: string) => StockMovement;

  // Audit Actions
  getAuditLogs: () => AuditLog[];
  addAuditLog: (log: Omit<AuditLog, 'id' | 'created_at'>) => void;

  // Dashboard
  getDashboardSummary: () => DashboardSummary;

  // Reset
  resetData: () => void;
}

const emptyCart: Cart = {
  items: [],
  subtotal: 0,
  discount_amount: 0,
  total_amount: 0,
  payment_type: 'cash',
  paid_amount: 0,
  debt_amount: 0,
  currency: 'IQD',
};

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      // Initial Data
      categories: [],
      products: [],
      customers: [],
      customerBalances: [],
      sales: [],
      saleItems: [],
      payments: [],
      debtTransactions: [],
      stockMovements: [],
      auditLogs: [],
      cart: emptyCart,
      tenantContext: null,
      setTenantContext: (marketId, branchId) => {
        if (!marketId || !branchId) throw new Error('TENANT_CONTEXT_REQUIRED');
        set({ tenantContext: { marketId, branchId } });
      },
      clearTenantContext: () => set({ tenantContext: null }),
      receiptCounter: 1000,

      // Category Actions
      getCategories: () => get().categories.filter(c => c.status === 'active'),
      
      getCategoryById: (id: string) => get().categories.find(c => c.id === id),
      
      addCategory: (category) => {
        const tenant = requireTenantContext(get().tenantContext);
        const newCategory: Category = {
          ...category,
          market_id: tenant.marketId,
          id: `cat-${uuidv4()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        set(state => ({ categories: [...state.categories, newCategory] }));
        return newCategory;
      },
      
      updateCategory: (id, updates) => {
        set(state => ({
          categories: state.categories.map(c =>
            c.id === id ? { ...c, ...updates, updated_at: new Date().toISOString() } : c
          ),
        }));
      },

      // Product Actions
      getProducts: () => get().products,
      
      getProductById: (id: string) => get().products.find(p => p.id === id),
      
      getProductByBarcode: (barcode: string) => get().products.find(p => p.status === 'active' && (p.barcode === barcode || (p.barcodes && p.barcodes.includes(barcode)))),
      
      getLowStockProducts: () => get().products.filter(p => p.stock_quantity <= p.low_stock_limit && p.status === 'active'),
      
      addProduct: (product) => {
        const tenant = requireTenantContext(get().tenantContext);
        const newProduct: Product = {
          ...product,
          market_id: tenant.marketId,
          branch_id: tenant.branchId,
          id: `prod-${uuidv4()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        set(state => ({ products: [...state.products, newProduct] }));
        return newProduct;
      },
      
      updateProduct: (id, updates) => {
        set(state => ({
          products: state.products.map(p =>
            p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p
          ),
        }));
      },

      updateProductStock: (id, quantity) => {
        set(state => ({
          products: state.products.map(p =>
            p.id === id ? { ...p, stock_quantity: quantity, updated_at: new Date().toISOString() } : p
          ),
        }));
      },

      // Customer Actions
      getCustomers: () => get().customers,
      
      getCustomerById: (id: string) => get().customers.find(c => c.id === id),
      
      getCustomerBalance: (customerId: string) => get().customerBalances.find(b => b.customer_id === customerId),
      
      getCustomersWithDebt: () => {
        const { customers, customerBalances } = get();
        return customers
          .map(customer => {
            const balance = customerBalances.find(b => b.customer_id === customer.id);
            return { ...customer, balance: balance! };
          })
          .filter(c => c.balance && (c.balance.balance_iqd > 0 || c.balance.balance_usd > 0));
      },
      
      addCustomer: (customer) => {
        const tenant = requireTenantContext(get().tenantContext);
        const customers = get().customers;
        const newCode = `C${String(customers.length + 1).padStart(3, '0')}`;
        const newCustomer: Customer = {
          ...customer,
          market_id: tenant.marketId,
          id: `cust-${uuidv4()}`,
          code: newCode,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        // Create initial balance
        const newBalance: CustomerBalance = {
          id: `bal-${uuidv4()}`,
          market_id: tenant.marketId,
          customer_id: newCustomer.id,
          balance_iqd: 0,
          balance_usd: 0,
          updated_at: new Date().toISOString(),
        };
        
        set(state => ({
          customers: [...state.customers, newCustomer],
          customerBalances: [...state.customerBalances, newBalance],
        }));
        
        return newCustomer;
      },
      
      updateCustomer: (id, updates) => {
        set(state => ({
          customers: state.customers.map(c =>
            c.id === id ? { ...c, ...updates, updated_at: new Date().toISOString() } : c
          ),
        }));
      },

      updateCustomerBalance: (customerId, amount, currency) => {
        set(state => ({
          customerBalances: state.customerBalances.map(b => {
            if (b.customer_id === customerId) {
              return {
                ...b,
                balance_iqd: currency === 'IQD' ? b.balance_iqd + amount : b.balance_iqd,
                balance_usd: currency === 'USD' ? b.balance_usd + amount : b.balance_usd,
                last_transaction_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
            }
            return b;
          }),
        }));
      },

      // Cart Actions
      addToCart: (product, quantity = 1) => {
        set(state => {
          const existingItem = state.cart.items.find(item => item.product.id === product.id);
          
          let newItems: CartItem[];
          if (existingItem) {
            newItems = state.cart.items.map(item =>
              item.id === existingItem.id
                ? {
                    ...item,
                    quantity: item.quantity + quantity,
                    total_price: (item.quantity + quantity) * item.unit_price - item.discount_amount,
                  }
                : item
            );
          } else {
            const newItem: CartItem = {
              id: uuidv4(),
              product,
              quantity,
              unit_price: product.sale_price,
              discount_amount: 0,
              total_price: quantity * product.sale_price,
            };
            newItems = [...state.cart.items, newItem];
          }

          const subtotal = newItems.reduce((sum, item) => sum + item.total_price, 0);
          const total = subtotal - state.cart.discount_amount;

          return {
            cart: {
              ...state.cart,
              items: newItems,
              subtotal,
              total_amount: total,
              paid_amount: state.cart.payment_type === 'cash' ? total : state.cart.paid_amount,
              debt_amount: state.cart.payment_type === 'debt' ? total : state.cart.debt_amount,
            },
          };
        });
      },

      updateCartItemQuantity: (itemId, quantity) => {
        if (quantity <= 0) {
          get().removeFromCart(itemId);
          return;
        }

        set(state => {
          const newItems = state.cart.items.map(item =>
            item.id === itemId
              ? {
                  ...item,
                  quantity,
                  total_price: quantity * item.unit_price - item.discount_amount,
                }
              : item
          );

          const subtotal = newItems.reduce((sum, item) => sum + item.total_price, 0);
          const total = subtotal - state.cart.discount_amount;

          return {
            cart: {
              ...state.cart,
              items: newItems,
              subtotal,
              total_amount: total,
            },
          };
        });
      },

      removeFromCart: (itemId) => {
        set(state => {
          const newItems = state.cart.items.filter(item => item.id !== itemId);
          const subtotal = newItems.reduce((sum, item) => sum + item.total_price, 0);
          const total = subtotal - state.cart.discount_amount;

          return {
            cart: {
              ...state.cart,
              items: newItems,
              subtotal,
              total_amount: total,
            },
          };
        });
      },

      clearCart: () => {
        set({ cart: emptyCart });
      },

      setCartCustomer: (customerId) => {
        const customer = customerId ? get().getCustomerById(customerId) : undefined;
        set(state => ({
          cart: {
            ...state.cart,
            customer_id: customerId,
            customer,
          },
        }));
      },

      setCartPaymentType: (type) => {
        set(state => {
          const total = state.cart.total_amount;
          return {
            cart: {
              ...state.cart,
              payment_type: type,
              paid_amount: type === 'cash' ? total : type === 'debt' ? 0 : state.cart.paid_amount,
              debt_amount: type === 'debt' ? total : type === 'cash' ? 0 : state.cart.debt_amount,
            },
          };
        });
      },

      setCartPaidAmount: (amount) => {
        set(state => ({
          cart: {
            ...state.cart,
            paid_amount: amount,
            debt_amount: state.cart.total_amount - amount,
          },
        }));
      },

      setCartDiscount: (amount) => {
        set(state => {
          const total = state.cart.subtotal - amount;
          return {
            cart: {
              ...state.cart,
              discount_amount: amount,
              total_amount: total,
              paid_amount: state.cart.payment_type === 'cash' ? total : state.cart.paid_amount,
              debt_amount: state.cart.payment_type === 'debt' ? total : state.cart.debt_amount,
            },
          };
        });
      },

      // Sale Actions
      getSales: () => get().sales,
      
      getSaleById: (id) => get().sales.find(s => s.id === id),
      
      getRecentSales: (limit = 10) => 
        get().sales
          .filter(s => s.status === 'completed')
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, limit),

      generateReceiptNumber: () => {
        const counter = get().receiptCounter + 1;
        set({ receiptCounter: counter });
        const date = new Date();
        return `R${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${counter}`;
      },

      completeSale: (userId) => {
        const tenant = requireTenantContext(get().tenantContext);
        const { cart, generateReceiptNumber, updateProductStock, updateCustomerBalance, addAuditLog } = get();

        // Validations
        if (cart.items.length === 0) {
          return { success: false, error: 'SALE_CART_EMPTY' };
        }

        // Check stock
        for (const item of cart.items) {
          if (item.product.is_trackable && item.quantity > item.product.stock_quantity) {
            return { success: false, error: 'INSUFFICIENT_STOCK' };
          }
        }

        // Check customer for debt
        if ((cart.payment_type === 'debt' || cart.payment_type === 'mixed') && !cart.customer_id) {
          return { success: false, error: 'CUSTOMER_REQUIRED_FOR_DEBT' };
        }

        // Check if customer is blocked
        if (cart.customer_id) {
          const customer = get().getCustomerById(cart.customer_id);
          if (customer?.status === 'blocked' && (cart.payment_type === 'debt' || cart.payment_type === 'mixed')) {
            return { success: false, error: 'CUSTOMER_BLOCKED' };
          }

          // Check debt limit
          if ((cart.payment_type === 'debt' || cart.payment_type === 'mixed') && customer?.debt_limit) {
            const balance = get().getCustomerBalance(cart.customer_id);
            const currentDebt = balance?.balance_iqd || 0;
            const newDebt = currentDebt + cart.debt_amount;
            if (newDebt > customer.debt_limit) {
              return { success: false, error: 'DEBT_BALANCE_INVALID' };
            }
          }
        }

        const now = new Date().toISOString();
        const saleId = `sale-${uuidv4()}`;
        const receiptNumber = generateReceiptNumber();

        // Create sale
        const sale: Sale = {
          id: saleId,
          market_id: tenant.marketId,
          branch_id: tenant.branchId,
          receipt_number: receiptNumber,
          customer_id: cart.customer_id,
          customer: cart.customer,
          cashier_id: userId,
          subtotal: cart.subtotal,
          discount_amount: cart.discount_amount,
          total_amount: cart.total_amount,
          paid_amount: cart.paid_amount,
          debt_amount: cart.debt_amount,
          payment_type: cart.payment_type,
          currency: cart.currency,
          status: 'completed',
          created_at: now,
          updated_at: now,
        };

        // Create sale items
        const saleItems: SaleItem[] = cart.items.map(item => ({
          id: `si-${uuidv4()}`,
          sale_id: saleId,
          product_id: item.product.id,
          product: item.product,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_amount: item.discount_amount,
          total_price: item.total_price,
          cost_price: item.product.cost_price,
          created_at: now,
        }));

        // Create payment if paid amount > 0
        const payments: Payment[] = [];
        if (cart.paid_amount > 0) {
          payments.push({
            id: `pay-${uuidv4()}`,
            market_id: tenant.marketId,
            branch_id: tenant.branchId,
            payment_for: 'sale',
            reference_id: saleId,
            customer_id: cart.customer_id,
            amount: cart.paid_amount,
            currency: cart.currency,
            payment_method: 'cash',
            received_by: userId,
            created_at: now,
          });
        }

        // Create debt transaction if debt amount > 0
        const debtTransactions: DebtTransaction[] = [];
        if (cart.debt_amount > 0 && cart.customer_id) {
          const currentBalance = get().getCustomerBalance(cart.customer_id);
          const balanceBefore = currentBalance?.balance_iqd || 0;
          
          debtTransactions.push({
            id: `dt-${uuidv4()}`,
            market_id: tenant.marketId,
            branch_id: tenant.branchId,
            customer_id: cart.customer_id,
            type: 'debt_added',
            amount: cart.debt_amount,
            currency: cart.currency,
            balance_before: balanceBefore,
            balance_after: balanceBefore + cart.debt_amount,
            reference_type: 'sale',
            reference_id: saleId,
            created_by: userId,
            created_at: now,
          });

          // Update customer balance
          updateCustomerBalance(cart.customer_id, cart.debt_amount, cart.currency);
        }

        // Create stock movements and update stock
        const stockMovements: StockMovement[] = [];
        for (const item of cart.items) {
          if (item.product.is_trackable) {
            const stockBefore = item.product.stock_quantity;
            const stockAfter = stockBefore - item.quantity;

            stockMovements.push({
              id: `sm-${uuidv4()}`,
              market_id: tenant.marketId,
              branch_id: tenant.branchId,
              product_id: item.product.id,
              type: 'sale',
              quantity: -item.quantity,
              stock_before: stockBefore,
              stock_after: stockAfter,
              reference_type: 'sale',
              reference_id: saleId,
              created_by: userId,
              created_at: now,
            });

            updateProductStock(item.product.id, stockAfter);
          }
        }

        // Update state
        set(state => ({
          sales: [...state.sales, sale],
          saleItems: [...state.saleItems, ...saleItems],
          payments: [...state.payments, ...payments],
          debtTransactions: [...state.debtTransactions, ...debtTransactions],
          stockMovements: [...state.stockMovements, ...stockMovements],
          cart: emptyCart,
        }));

        // Add audit log
        addAuditLog({
          market_id: tenant.marketId,
          branch_id: tenant.branchId,
          user_id: userId,
          action: 'sales.completed',
          module: 'sales',
          table_name: 'sales',
          record_id: saleId,
          new_value: { receipt_number: receiptNumber, total: cart.total_amount, payment_type: cart.payment_type },
        });

        return { success: true, sale };
      },

      // Payment Actions
      getPayments: () => get().payments,

      addDebtPayment: (customerId, amount, currency, userId, notes) => {
        const tenant = requireTenantContext(get().tenantContext);
        const now = new Date().toISOString();
        const currentBalance = get().getCustomerBalance(customerId);
        const balanceBefore = currency === 'IQD' ? (currentBalance?.balance_iqd || 0) : (currentBalance?.balance_usd || 0);

        // Create payment
        const payment: Payment = {
          id: `pay-${uuidv4()}`,
          market_id: tenant.marketId,
          branch_id: tenant.branchId,
          payment_for: 'debt_payment',
          customer_id: customerId,
          amount,
          currency,
          payment_method: 'cash',
          notes,
          received_by: userId,
          created_at: now,
        };

        // Create debt transaction
        const debtTransaction: DebtTransaction = {
          id: `dt-${uuidv4()}`,
          market_id: tenant.marketId,
          branch_id: tenant.branchId,
          customer_id: customerId,
          type: 'debt_payment',
          amount: -amount,
          currency,
          balance_before: balanceBefore,
          balance_after: balanceBefore - amount,
          reference_type: 'payment',
          reference_id: payment.id,
          notes,
          created_by: userId,
          created_at: now,
        };

        // Update balance
        get().updateCustomerBalance(customerId, -amount, currency);

        // Update state
        set(state => ({
          payments: [...state.payments, payment],
          debtTransactions: [...state.debtTransactions, debtTransaction],
        }));

        // Add audit log
        get().addAuditLog({
          market_id: tenant.marketId,
          branch_id: tenant.branchId,
          user_id: userId,
          action: 'debt.payment',
          module: 'debt',
          table_name: 'payments',
          record_id: payment.id,
          new_value: { customer_id: customerId, amount, currency },
        });

        return payment;
      },

      // Debt Actions
      getDebtTransactions: () => get().debtTransactions,
      
      getCustomerDebtTransactions: (customerId) => 
        get().debtTransactions.filter(dt => dt.customer_id === customerId)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),

      // Stock Actions
      getStockMovements: () => get().stockMovements,

      addStockMovement: (movement) => {
        const newMovement: StockMovement = {
          ...movement,
          id: `sm-${uuidv4()}`,
          created_at: new Date().toISOString(),
        };
        set(state => ({
          stockMovements: [...state.stockMovements, newMovement],
        }));
        return newMovement;
      },

      adjustStock: (productId, quantity, type, userId, notes) => {
        const tenant = requireTenantContext(get().tenantContext);
        const product = get().getProductById(productId);
        if (!product) throw new Error('Product not found');

        const stockBefore = product.stock_quantity;
        const stockAfter = stockBefore + quantity;

        const movement = get().addStockMovement({
          market_id: tenant.marketId,
          branch_id: tenant.branchId,
          product_id: productId,
          type,
          quantity,
          stock_before: stockBefore,
          stock_after: stockAfter,
          notes,
          created_by: userId,
        });

        get().updateProductStock(productId, stockAfter);

        get().addAuditLog({
          market_id: tenant.marketId,
          branch_id: tenant.branchId,
          user_id: userId,
          action: 'stock.adjusted',
          module: 'inventory',
          table_name: 'stock_movements',
          record_id: movement.id,
          old_value: { stock: stockBefore },
          new_value: { stock: stockAfter, type, quantity },
        });

        return movement;
      },

      // Audit Actions
      getAuditLogs: () => 
        get().auditLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),

      addAuditLog: (log) => {
        const newLog: AuditLog = {
          ...log,
          id: `audit-${uuidv4()}`,
          created_at: new Date().toISOString(),
        };
        set(state => ({
          auditLogs: [...state.auditLogs, newLog],
        }));
      },

      // Dashboard
      getDashboardSummary: (): DashboardSummary => {
        const { sales, debtTransactions, customerBalances, products, customers } = get();
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todaySales = sales.filter(s => {
          const saleDate = new Date(s.created_at);
          saleDate.setHours(0, 0, 0, 0);
          return saleDate.getTime() === today.getTime() && s.status === 'completed';
        });

        const todayDebtTxs = debtTransactions.filter(dt => {
          const txDate = new Date(dt.created_at);
          txDate.setHours(0, 0, 0, 0);
          return txDate.getTime() === today.getTime();
        });

        const totalSales = todaySales.reduce((sum, s) => sum + s.total_amount, 0);
        const totalCash = todaySales.reduce((sum, s) => sum + s.paid_amount, 0);
        const totalDebtAdded = todayDebtTxs
          .filter(dt => dt.type === 'debt_added')
          .reduce((sum, dt) => sum + Math.abs(dt.amount), 0);
        const totalDebtPayments = todayDebtTxs
          .filter(dt => dt.type === 'debt_payment')
          .reduce((sum, dt) => sum + Math.abs(dt.amount), 0);
        const totalCustomerDebt = customerBalances.reduce((sum, b) => sum + b.balance_iqd, 0);
        
        // Calculate profit from today's sales
        const todaySaleItems = get().saleItems.filter(si => 
          todaySales.some(s => s.id === si.sale_id)
        );
        const totalProfit = todaySaleItems.reduce((sum, si) => 
          sum + ((si.unit_price - si.cost_price) * si.quantity), 0
        );

        const lowStockCount = products.filter(p => 
          p.stock_quantity <= p.low_stock_limit && p.status === 'active'
        ).length;

        return {
          today_sales: totalSales,
          today_profit: totalProfit,
          today_cash: totalCash,
          today_debt_added: totalDebtAdded,
          today_debt_payments: totalDebtPayments,
          total_customer_debt: totalCustomerDebt,
          receipt_count: todaySales.length,
          low_stock_count: lowStockCount,
          active_customers: customers.filter(c => c.status === 'active').length,
          active_products: products.filter(p => p.status === 'active').length,
        };
      },

      // Reset
      resetData: () => {
        set({
          categories: [],
          products: [],
          customers: [],
          customerBalances: [],
          sales: [],
          saleItems: [],
          payments: [],
          debtTransactions: [],
          stockMovements: [],
          auditLogs: [],
          cart: emptyCart,
          receiptCounter: 1000,
        });
      },
    }),
    {
      name: 'zhirox-data',
    }
  )
);
