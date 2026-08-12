// ==============================================
// ZHIROX HyperMarket Autopilot OS - Feature Flags
// Version: Final v12 - Phase 1
// ==============================================

export const FEATURE_FLAGS = {
  // Phase 1 - Core (Enabled)
  POS_ENABLED: 'pos_enabled',
  DEBT_ENABLED: 'debt_enabled',
  INVENTORY_ENABLED: 'inventory_enabled',
  REPORTS_ENABLED: 'reports_enabled',

  // Phase 2 - Strong Market System (Disabled)
  SUPPLIERS_ENABLED: 'suppliers_enabled',
  PURCHASES_ENABLED: 'purchases_enabled',
  EXPIRY_TRACKING_ENABLED: 'expiry_tracking_enabled',
  CUSTOMER_PORTAL_ENABLED: 'customer_portal_enabled',

  // Phase 3 - AI Intelligence (Disabled)
  AI_ENABLED: 'ai_enabled',
  AI_SUGGESTIONS_ENABLED: 'ai_suggestions_enabled',
  AI_SCORING_ENABLED: 'ai_scoring_enabled',

  // Phase 4 - Connected Market (Disabled)
  OFFLINE_SYNC_ENABLED: 'offline_sync_enabled',
  MULTI_BRANCH_ENABLED: 'multi_branch_enabled',
  MOBILE_APP_ENABLED: 'mobile_app_enabled',
  NOTIFICATIONS_ENABLED: 'notifications_enabled',

  // Phase 5 - SaaS (Disabled)
  SAAS_ENABLED: 'saas_enabled',
  BILLING_ENABLED: 'billing_enabled',
  SUBSCRIPTIONS_ENABLED: 'subscriptions_enabled',

  // Phase 6 - AI Autopilot (Disabled)
  AUTOPILOT_ENABLED: 'autopilot_enabled',
  SMART_PRICING_ENABLED: 'smart_pricing_enabled',
  FORECASTING_ENABLED: 'forecasting_enabled',

  // Phase 7 - Customer Growth (Disabled)
  LOYALTY_ENABLED: 'loyalty_enabled',
  COUPONS_ENABLED: 'coupons_enabled',
  CAMPAIGNS_ENABLED: 'campaigns_enabled',

  // Phase 8 - Enterprise (Disabled)
  ENTERPRISE_ENABLED: 'enterprise_enabled',
  ACCOUNTING_ENABLED: 'accounting_enabled',
  API_ENABLED: 'api_enabled',
  WEBHOOKS_ENABLED: 'webhooks_enabled',

  // Phase 9 - Hardware (Disabled)
  HARDWARE_ENABLED: 'hardware_enabled',
  BARCODE_SCANNER_ENABLED: 'barcode_scanner_enabled',
  RECEIPT_PRINTER_ENABLED: 'receipt_printer_enabled',
  CASH_DRAWER_ENABLED: 'cash_drawer_enabled',
  CCTV_ENABLED: 'cctv_enabled',
  IOT_ENABLED: 'iot_enabled',
  SELF_CHECKOUT_ENABLED: 'self_checkout_enabled',
} as const;

export type FeatureFlagKey = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS];

// Default feature flag values for Phase 1
export const DEFAULT_FEATURE_FLAGS: Record<FeatureFlagKey, boolean> = {
  // Phase 1 - Enabled
  [FEATURE_FLAGS.POS_ENABLED]: true,
  [FEATURE_FLAGS.DEBT_ENABLED]: true,
  [FEATURE_FLAGS.INVENTORY_ENABLED]: true,
  [FEATURE_FLAGS.REPORTS_ENABLED]: true,

  // Phase 2+ - Disabled
  [FEATURE_FLAGS.SUPPLIERS_ENABLED]: false,
  [FEATURE_FLAGS.PURCHASES_ENABLED]: false,
  [FEATURE_FLAGS.EXPIRY_TRACKING_ENABLED]: false,
  [FEATURE_FLAGS.CUSTOMER_PORTAL_ENABLED]: false,
  [FEATURE_FLAGS.AI_ENABLED]: false,
  [FEATURE_FLAGS.AI_SUGGESTIONS_ENABLED]: false,
  [FEATURE_FLAGS.AI_SCORING_ENABLED]: false,
  [FEATURE_FLAGS.OFFLINE_SYNC_ENABLED]: false,
  [FEATURE_FLAGS.MULTI_BRANCH_ENABLED]: false,
  [FEATURE_FLAGS.MOBILE_APP_ENABLED]: false,
  [FEATURE_FLAGS.NOTIFICATIONS_ENABLED]: false,
  [FEATURE_FLAGS.SAAS_ENABLED]: false,
  [FEATURE_FLAGS.BILLING_ENABLED]: false,
  [FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED]: false,
  [FEATURE_FLAGS.AUTOPILOT_ENABLED]: false,
  [FEATURE_FLAGS.SMART_PRICING_ENABLED]: false,
  [FEATURE_FLAGS.FORECASTING_ENABLED]: false,
  [FEATURE_FLAGS.LOYALTY_ENABLED]: false,
  [FEATURE_FLAGS.COUPONS_ENABLED]: false,
  [FEATURE_FLAGS.CAMPAIGNS_ENABLED]: false,
  [FEATURE_FLAGS.ENTERPRISE_ENABLED]: false,
  [FEATURE_FLAGS.ACCOUNTING_ENABLED]: false,
  [FEATURE_FLAGS.API_ENABLED]: false,
  [FEATURE_FLAGS.WEBHOOKS_ENABLED]: false,
  [FEATURE_FLAGS.HARDWARE_ENABLED]: false,
  [FEATURE_FLAGS.BARCODE_SCANNER_ENABLED]: false,
  [FEATURE_FLAGS.RECEIPT_PRINTER_ENABLED]: false,
  [FEATURE_FLAGS.CASH_DRAWER_ENABLED]: false,
  [FEATURE_FLAGS.CCTV_ENABLED]: false,
  [FEATURE_FLAGS.IOT_ENABLED]: false,
  [FEATURE_FLAGS.SELF_CHECKOUT_ENABLED]: false,
};

export const FEATURE_FLAG_NAMES: Record<FeatureFlagKey, string> = {
  [FEATURE_FLAGS.POS_ENABLED]: 'سیستەمی کاشێر',
  [FEATURE_FLAGS.DEBT_ENABLED]: 'سیستەمی قەرز',
  [FEATURE_FLAGS.INVENTORY_ENABLED]: 'سیستەمی کۆگا',
  [FEATURE_FLAGS.REPORTS_ENABLED]: 'سیستەمی ڕاپۆرت',
  [FEATURE_FLAGS.SUPPLIERS_ENABLED]: 'دابینکەران',
  [FEATURE_FLAGS.PURCHASES_ENABLED]: 'کڕینەکان',
  [FEATURE_FLAGS.EXPIRY_TRACKING_ENABLED]: 'بەدواداچوونی بەسەرچوون',
  [FEATURE_FLAGS.CUSTOMER_PORTAL_ENABLED]: 'پۆرتاڵی کڕیار',
  [FEATURE_FLAGS.AI_ENABLED]: 'زیرەکی دەستکرد',
  [FEATURE_FLAGS.AI_SUGGESTIONS_ENABLED]: 'پێشنیاری AI',
  [FEATURE_FLAGS.AI_SCORING_ENABLED]: 'خاڵبەندی AI',
  [FEATURE_FLAGS.OFFLINE_SYNC_ENABLED]: 'هاوکاتکردنی ئۆفلاین',
  [FEATURE_FLAGS.MULTI_BRANCH_ENABLED]: 'فرە لقی',
  [FEATURE_FLAGS.MOBILE_APP_ENABLED]: 'ئەپی مۆبایل',
  [FEATURE_FLAGS.NOTIFICATIONS_ENABLED]: 'ئاگادارکردنەوەکان',
  [FEATURE_FLAGS.SAAS_ENABLED]: 'SaaS',
  [FEATURE_FLAGS.BILLING_ENABLED]: 'پارەدان',
  [FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED]: 'بەشداربوون',
  [FEATURE_FLAGS.AUTOPILOT_ENABLED]: 'ئۆتۆپایلۆت',
  [FEATURE_FLAGS.SMART_PRICING_ENABLED]: 'نرخدانانی زیرەک',
  [FEATURE_FLAGS.FORECASTING_ENABLED]: 'پێشبینی',
  [FEATURE_FLAGS.LOYALTY_ENABLED]: 'خاڵی وەفاداری',
  [FEATURE_FLAGS.COUPONS_ENABLED]: 'کوپۆن',
  [FEATURE_FLAGS.CAMPAIGNS_ENABLED]: 'کەمپینەکان',
  [FEATURE_FLAGS.ENTERPRISE_ENABLED]: 'ئێنتەرپرایز',
  [FEATURE_FLAGS.ACCOUNTING_ENABLED]: 'ژمێریاری',
  [FEATURE_FLAGS.API_ENABLED]: 'API',
  [FEATURE_FLAGS.WEBHOOKS_ENABLED]: 'Webhooks',
  [FEATURE_FLAGS.HARDWARE_ENABLED]: 'هاردوێر',
  [FEATURE_FLAGS.BARCODE_SCANNER_ENABLED]: 'سکانەری بارکۆد',
  [FEATURE_FLAGS.RECEIPT_PRINTER_ENABLED]: 'چاپکەری وەسڵ',
  [FEATURE_FLAGS.CASH_DRAWER_ENABLED]: 'قوتووی پارە',
  [FEATURE_FLAGS.CCTV_ENABLED]: 'CCTV',
  [FEATURE_FLAGS.IOT_ENABLED]: 'IoT',
  [FEATURE_FLAGS.SELF_CHECKOUT_ENABLED]: 'خۆپارەدان',
};
