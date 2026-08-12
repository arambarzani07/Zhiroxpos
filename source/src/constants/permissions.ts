// ==============================================
// ZHIROX HyperMarket Autopilot OS - Permissions
// Version: Final v12 - Phase 1
// ==============================================

export const PERMISSIONS = {
  // Dashboard
  DASHBOARD_VIEW: 'dashboard.view',

  // Products
  PRODUCTS_VIEW: 'products.view',
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_EDIT: 'products.edit',
  PRODUCTS_DELETE: 'products.delete',
  PRODUCTS_CHANGE_PRICE: 'products.change_price',

  // Categories
  CATEGORIES_VIEW: 'categories.view',
  CATEGORIES_CREATE: 'categories.create',
  CATEGORIES_EDIT: 'categories.edit',
  CATEGORIES_DELETE: 'categories.delete',

  // Customers
  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_CREATE: 'customers.create',
  CUSTOMERS_EDIT: 'customers.edit',
  CUSTOMERS_DELETE: 'customers.delete',
  CUSTOMERS_BLOCK: 'customers.block',

  // Sales/POS
  SALES_VIEW: 'sales.view',
  SALES_CREATE: 'sales.create',
  SALES_CANCEL: 'sales.cancel',
  SALES_DISCOUNT: 'sales.discount',

  // Debt
  DEBT_VIEW: 'debt.view',
  DEBT_CREATE: 'debt.create',
  DEBT_PAYMENT: 'debt.payment',
  DEBT_ADJUST: 'debt.adjust',

  // Inventory
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_OPENING: 'inventory.opening',

  // Reports
  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',

  // Settings
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE: 'settings.manage',

  // Users
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_EDIT: 'users.edit',
  USERS_DELETE: 'users.delete',

  // Roles
  ROLES_VIEW: 'roles.view',
  ROLES_MANAGE: 'roles.manage',

  // Audit
  AUDIT_VIEW: 'audit.view',

  // Feature Flags
  FEATURES_MANAGE: 'features.manage',

  // Future permissions (Phase 2+)
  AI_VIEW: 'ai.view',
  AI_APPROVE: 'ai.approve',
  SYNC_MANAGE: 'sync.manage',
  SAAS_MANAGE: 'saas.manage',
  BILLING_MANAGE: 'billing.manage',
  HARDWARE_MANAGE: 'hardware.manage',
  LOYALTY_MANAGE: 'loyalty.manage',
  CAMPAIGNS_MANAGE: 'campaigns.manage',
  ENTERPRISE_MANAGE: 'enterprise.manage',
  ACCOUNTING_VIEW: 'accounting.view',
  ACCOUNTING_MANAGE: 'accounting.manage',
  API_MANAGE: 'api.manage',
  SUPPORT_MANAGE: 'support.manage',
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Role-based default permissions
export const ROLE_PERMISSIONS: Record<string, PermissionCode[]> = {
  owner: [
    // Full access
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PRODUCTS_CREATE,
    PERMISSIONS.PRODUCTS_EDIT,
    PERMISSIONS.PRODUCTS_DELETE,
    PERMISSIONS.PRODUCTS_CHANGE_PRICE,
    PERMISSIONS.CATEGORIES_VIEW,
    PERMISSIONS.CATEGORIES_CREATE,
    PERMISSIONS.CATEGORIES_EDIT,
    PERMISSIONS.CATEGORIES_DELETE,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.CUSTOMERS_EDIT,
    PERMISSIONS.CUSTOMERS_DELETE,
    PERMISSIONS.CUSTOMERS_BLOCK,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_CREATE,
    PERMISSIONS.SALES_CANCEL,
    PERMISSIONS.SALES_DISCOUNT,
    PERMISSIONS.DEBT_VIEW,
    PERMISSIONS.DEBT_CREATE,
    PERMISSIONS.DEBT_PAYMENT,
    PERMISSIONS.DEBT_ADJUST,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.INVENTORY_OPENING,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.SETTINGS_VIEW,
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_EDIT,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.ROLES_VIEW,
    PERMISSIONS.ROLES_MANAGE,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.FEATURES_MANAGE,
  ],

  admin: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PRODUCTS_CREATE,
    PERMISSIONS.PRODUCTS_EDIT,
    PERMISSIONS.CATEGORIES_VIEW,
    PERMISSIONS.CATEGORIES_CREATE,
    PERMISSIONS.CATEGORIES_EDIT,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.CUSTOMERS_EDIT,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_CREATE,
    PERMISSIONS.SALES_CANCEL,
    PERMISSIONS.SALES_DISCOUNT,
    PERMISSIONS.DEBT_VIEW,
    PERMISSIONS.DEBT_CREATE,
    PERMISSIONS.DEBT_PAYMENT,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.INVENTORY_OPENING,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.SETTINGS_VIEW,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],

  cashier: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_CREATE,
    PERMISSIONS.DEBT_VIEW,
    PERMISSIONS.DEBT_CREATE,
  ],

  stock_staff: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.CATEGORIES_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.INVENTORY_OPENING,
  ],

  accountant: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.DEBT_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.AUDIT_VIEW,
  ],

  customer: [
    // Future: customer portal permissions
  ],

  super_admin: [
    // All permissions + SaaS management (Phase 5)
  ],

  support_agent: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.DEBT_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],

  partner: [
    // Limited access (Phase 11)
  ],
};

export const PERMISSION_MODULES = {
  dashboard: {
    name: 'داشبۆرد',
    permissions: [PERMISSIONS.DASHBOARD_VIEW],
  },
  products: {
    name: 'کاڵاکان',
    permissions: [
      PERMISSIONS.PRODUCTS_VIEW,
      PERMISSIONS.PRODUCTS_CREATE,
      PERMISSIONS.PRODUCTS_EDIT,
      PERMISSIONS.PRODUCTS_DELETE,
      PERMISSIONS.PRODUCTS_CHANGE_PRICE,
    ],
  },
  categories: {
    name: 'پۆلەکان',
    permissions: [
      PERMISSIONS.CATEGORIES_VIEW,
      PERMISSIONS.CATEGORIES_CREATE,
      PERMISSIONS.CATEGORIES_EDIT,
      PERMISSIONS.CATEGORIES_DELETE,
    ],
  },
  customers: {
    name: 'کڕیاران',
    permissions: [
      PERMISSIONS.CUSTOMERS_VIEW,
      PERMISSIONS.CUSTOMERS_CREATE,
      PERMISSIONS.CUSTOMERS_EDIT,
      PERMISSIONS.CUSTOMERS_DELETE,
      PERMISSIONS.CUSTOMERS_BLOCK,
    ],
  },
  sales: {
    name: 'فرۆشتن',
    permissions: [
      PERMISSIONS.SALES_VIEW,
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.SALES_CANCEL,
      PERMISSIONS.SALES_DISCOUNT,
    ],
  },
  debt: {
    name: 'قەرز',
    permissions: [
      PERMISSIONS.DEBT_VIEW,
      PERMISSIONS.DEBT_CREATE,
      PERMISSIONS.DEBT_PAYMENT,
      PERMISSIONS.DEBT_ADJUST,
    ],
  },
  inventory: {
    name: 'کۆگا',
    permissions: [
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.INVENTORY_ADJUST,
      PERMISSIONS.INVENTORY_OPENING,
    ],
  },
  reports: {
    name: 'ڕاپۆرتەکان',
    permissions: [
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.REPORTS_EXPORT,
    ],
  },
  settings: {
    name: 'ڕێکخستنەکان',
    permissions: [
      PERMISSIONS.SETTINGS_VIEW,
      PERMISSIONS.SETTINGS_MANAGE,
    ],
  },
  users: {
    name: 'بەکارهێنەران',
    permissions: [
      PERMISSIONS.USERS_VIEW,
      PERMISSIONS.USERS_CREATE,
      PERMISSIONS.USERS_EDIT,
      PERMISSIONS.USERS_DELETE,
    ],
  },
  roles: {
    name: 'ڕۆڵەکان',
    permissions: [
      PERMISSIONS.ROLES_VIEW,
      PERMISSIONS.ROLES_MANAGE,
    ],
  },
  audit: {
    name: 'مێژووی کردارەکان',
    permissions: [PERMISSIONS.AUDIT_VIEW],
  },
};
