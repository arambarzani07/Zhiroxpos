// ==============================================
// ZHIROX HyperMarket Autopilot OS - Types
// Version: Final v12 - Phase 1
// ==============================================

// Base Types
export type ID = string;
export type Currency = 'IQD' | 'USD';
export type Status = 'active' | 'inactive' | 'blocked' | 'completed' | 'cancelled' | 'returned' | 'archived';
export type PaymentType = 'cash' | 'debt' | 'mixed';

// ===== Market & Branch =====
export interface Market {
  id: ID;
  name: string;
  name_en?: string;
  phone: string;
  address: string;
  currency: Currency;
  logo_url?: string;
  status: Status;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: ID;
  market_id: ID;
  name: string;
  phone?: string;
  address?: string;
  is_main: boolean;
  status: Status;
  created_at: string;
  updated_at: string;
}

// ===== Users & Auth =====
export type RoleType = 'owner' | 'admin' | 'cashier' | 'stock_staff' | 'accountant' | 'customer' | 'super_admin' | 'support_agent' | 'partner';

export interface Role {
  id: ID;
  market_id: ID;
  name: string;
  type: RoleType;
  description?: string;
  is_system: boolean;
  created_at: string;
}

export interface Permission {
  id: ID;
  code: string;
  name: string;
  module: string;
  description?: string;
}

export interface RolePermission {
  id: ID;
  role_id: ID;
  permission_id: ID;
}

export interface User {
  id: ID;
  market_id: ID;
  branch_id?: ID;
  username: string;
  full_name: string;
  phone?: string;
  email?: string;
  pin?: string;
  avatar_url?: string;
  role_id: ID;
  role?: Role;
  permissions?: string[];
  status: Status;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: ID;
  user_id: ID;
  role_id: ID;
}

// ===== Products & Categories =====
export interface Category {
  id: ID;
  market_id: ID;
  name: string;
  name_en?: string;
  description?: string;
  parent_id?: ID;
  sort_order: number;
  status: Status;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: ID;
  market_id: ID;
  branch_id?: ID;
  category_id?: ID;
  category?: Category;
  barcode: string;
  barcodes: string[];
  name: string;
  name_en?: string;
  description?: string;
  unit: string;
  cost_price: number;
  sale_price: number;
  currency: Currency;
  stock_quantity: number;
  low_stock_limit: number;
  image_url?: string;
  is_trackable: boolean;
  status: Status;
  created_by: ID;
  created_at: string;
  updated_at: string;
}

// ===== Customers =====
export interface Customer {
  id: ID;
  market_id: ID;
  code: string;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  debt_limit?: number;
  status: Status;
  created_by: ID;
  created_at: string;
  updated_at: string;
}

export interface CustomerBalance {
  id: ID;
  market_id: ID;
  customer_id: ID;
  customer?: Customer;
  balance_iqd: number;
  balance_usd: number;
  last_transaction_at?: string;
  updated_at: string;
}

// ===== Sales =====
export interface Sale {
  id: ID;
  market_id: ID;
  branch_id: ID;
  receipt_number: string;
  customer_id?: ID;
  customer?: Customer;
  cashier_id: ID;
  cashier?: User;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  debt_amount: number;
  payment_type: PaymentType;
  currency: Currency;
  notes?: string;
  status: Status;
  cash_session_id?: ID;
  created_at: string;
  updated_at: string;
}

export interface SaleItem {
  id: ID;
  sale_id: ID;
  product_id: ID;
  product?: Product;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  total_price: number;
  cost_price: number;
  created_at: string;
}

// ===== Payments =====
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';
export type PaymentFor = 'sale' | 'debt_payment' | 'supplier_payment' | 'expense' | 'other';

export interface Payment {
  id: ID;
  market_id: ID;
  branch_id: ID;
  payment_for: PaymentFor;
  reference_id?: ID;
  customer_id?: ID;
  customer?: Customer;
  amount: number;
  currency: Currency;
  payment_method: PaymentMethod;
  notes?: string;
  received_by: ID;
  cash_session_id?: ID;
  created_at: string;
}

// ===== Debt =====
export type DebtTransactionType = 'debt_added' | 'debt_payment' | 'debt_adjustment';

export interface DebtTransaction {
  id: ID;
  market_id: ID;
  branch_id: ID;
  customer_id: ID;
  customer?: Customer;
  type: DebtTransactionType;
  amount: number;
  currency: Currency;
  balance_before: number;
  balance_after: number;
  reference_type?: 'sale' | 'payment' | 'adjustment';
  reference_id?: ID;
  notes?: string;
  created_by: ID;
  created_at: string;
}

// ===== Stock =====
export type StockMovementType = 'opening_stock' | 'sale' | 'purchase' | 'adjustment' | 'return' | 'damage' | 'lost' | 'transfer';

export interface StockMovement {
  id: ID;
  market_id: ID;
  branch_id: ID;
  product_id: ID;
  product?: Product;
  type: StockMovementType;
  quantity: number;
  stock_before: number;
  stock_after: number;
  reference_type?: string;
  reference_id?: ID;
  notes?: string;
  created_by: ID;
  created_at: string;
}

// ===== Cash Sessions =====
export interface CashSession {
  id: ID;
  market_id: ID;
  branch_id: ID;
  cashier_id: ID;
  cashier?: User;
  opening_amount: number;
  closing_amount?: number;
  expected_amount?: number;
  difference?: number;
  currency: Currency;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at?: string;
  notes?: string;
}

// ===== Reports =====
export interface DailyReport {
  id: ID;
  market_id: ID;
  branch_id: ID;
  report_date: string;
  total_sales: number;
  total_profit: number;
  total_cash: number;
  total_debt_added: number;
  total_debt_payments: number;
  total_transactions: number;
  currency: Currency;
  generated_by: ID;
  created_at: string;
}

// ===== Audit =====
export type AuditAction = 
  | 'auth.login' | 'auth.logout' | 'auth.failed_login'
  | 'products.create' | 'products.update' | 'products.price_change' | 'products.status_change'
  | 'customers.create' | 'customers.update' | 'customers.status_change'
  | 'sales.completed' | 'sales.cancelled'
  | 'payments.created'
  | 'debt.added' | 'debt.payment'
  | 'stock.adjusted' | 'stock.sale_reduced'
  | 'settings.changed'
  | 'permissions.changed'
  | 'feature_flags.changed'
  | 'receipt.generated';

export interface AuditLog {
  id: ID;
  market_id: ID;
  branch_id?: ID;
  user_id: ID;
  user?: User;
  action: AuditAction;
  module: string;
  table_name?: string;
  record_id?: ID;
  old_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  ip_address?: string;
  device_info?: string;
  created_at: string;
}

// ===== Settings =====
export interface Setting {
  id: ID;
  market_id: ID;
  branch_id?: ID;
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  updated_by: ID;
  updated_at: string;
}

// ===== Feature Flags =====
export interface FeatureFlag {
  id: ID;
  market_id: ID;
  key: string;
  enabled: boolean;
  updated_by?: ID;
  updated_at: string;
}

// ===== Cart (POS) =====
export interface CartItem {
  id: ID;
  product: Product;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  total_price: number;
}

export interface Cart {
  items: CartItem[];
  customer_id?: ID;
  customer?: Customer;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  payment_type: PaymentType;
  paid_amount: number;
  debt_amount: number;
  currency: Currency;
  notes?: string;
}

// ===== Dashboard =====
export interface DashboardSummary {
  today_sales: number;
  today_profit: number;
  today_cash: number;
  today_debt_added: number;
  today_debt_payments: number;
  total_customer_debt: number;
  receipt_count: number;
  low_stock_count: number;
  active_customers: number;
  active_products: number;
}

// ===== API Response =====
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error_code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

// ===== Error Codes =====
export const ERROR_CODES = {
  AUTH_INVALID_LOGIN: 'AUTH_INVALID_LOGIN',
  USER_BLOCKED: 'USER_BLOCKED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  PRODUCT_INACTIVE: 'PRODUCT_INACTIVE',
  BARCODE_DUPLICATE: 'BARCODE_DUPLICATE',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  CUSTOMER_REQUIRED_FOR_DEBT: 'CUSTOMER_REQUIRED_FOR_DEBT',
  CUSTOMER_BLOCKED: 'CUSTOMER_BLOCKED',
  INVALID_PAYMENT_AMOUNT: 'INVALID_PAYMENT_AMOUNT',
  SALE_CART_EMPTY: 'SALE_CART_EMPTY',
  DEBT_BALANCE_INVALID: 'DEBT_BALANCE_INVALID',
  STOCK_MOVEMENT_FAILED: 'STOCK_MOVEMENT_FAILED',
  AUDIT_LOG_FAILED: 'AUDIT_LOG_FAILED',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
