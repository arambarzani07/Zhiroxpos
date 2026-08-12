from pathlib import Path

path = Path('source/src/stores/dataStore.ts')
content = path.read_text(encoding='utf-8')

if "type TenantContext =" not in content:
    content = content.replace(
        "// ===== Production starts empty: no demo data =====\n\ninterface DataState {",
        "// ===== Production starts empty: no demo data =====\n\ntype TenantContext = { marketId: string; branchId: string };\n\nconst requireTenantContext = (context: TenantContext | null): TenantContext => {\n  if (!context?.marketId || !context?.branchId) throw new Error('TENANT_CONTEXT_REQUIRED');\n  return context;\n};\n\ninterface DataState {",
        1,
    )

if "tenantContext: TenantContext | null;" not in content:
    content = content.replace(
        "  // Counters\n  receiptCounter: number;",
        "  // Tenant authority (set only after authenticated session)\n  tenantContext: TenantContext | null;\n  setTenantContext: (marketId: string, branchId: string) => void;\n  clearTenantContext: () => void;\n\n  // Counters\n  receiptCounter: number;",
        1,
    )

if "tenantContext: null," not in content:
    content = content.replace(
        "      cart: emptyCart,\n      receiptCounter: 1000,",
        "      cart: emptyCart,\n      tenantContext: null,\n      setTenantContext: (marketId, branchId) => {\n        if (!marketId || !branchId) throw new Error('TENANT_CONTEXT_REQUIRED');\n        set({ tenantContext: { marketId, branchId } });\n      },\n      clearTenantContext: () => set({ tenantContext: null }),\n      receiptCounter: 1000,",
        1,
    )

# Force creation actions to the authenticated market/branch instead of trusting form payloads.
content = content.replace(
    "      addCategory: (category) => {\n        const newCategory: Category = {\n          ...category,",
    "      addCategory: (category) => {\n        const tenant = requireTenantContext(get().tenantContext);\n        const newCategory: Category = {\n          ...category,\n          market_id: tenant.marketId,",
    1,
)
content = content.replace(
    "      addProduct: (product) => {\n        const newProduct: Product = {\n          ...product,",
    "      addProduct: (product) => {\n        const tenant = requireTenantContext(get().tenantContext);\n        const newProduct: Product = {\n          ...product,\n          market_id: tenant.marketId,\n          branch_id: tenant.branchId,",
    1,
)
content = content.replace(
    "      addCustomer: (customer) => {\n        const customers = get().customers;",
    "      addCustomer: (customer) => {\n        const tenant = requireTenantContext(get().tenantContext);\n        const customers = get().customers;",
    1,
)
content = content.replace(
    "        const newCustomer: Customer = {\n          ...customer,",
    "        const newCustomer: Customer = {\n          ...customer,\n          market_id: tenant.marketId,",
    1,
)
content = content.replace("          market_id: customer.market_id,", "          market_id: tenant.marketId,", 1)

# These transaction actions previously embedded fake tenant IDs.
content = content.replace(
    "      completeSale: (userId) => {\n        const { cart, generateReceiptNumber, updateProductStock, updateCustomerBalance, addAuditLog } = get();",
    "      completeSale: (userId) => {\n        const tenant = requireTenantContext(get().tenantContext);\n        const { cart, generateReceiptNumber, updateProductStock, updateCustomerBalance, addAuditLog } = get();",
    1,
)
content = content.replace(
    "      addDebtPayment: (customerId, amount, currency, userId, notes) => {\n        const now = new Date().toISOString();",
    "      addDebtPayment: (customerId, amount, currency, userId, notes) => {\n        const tenant = requireTenantContext(get().tenantContext);\n        const now = new Date().toISOString();",
    1,
)
content = content.replace(
    "      adjustStock: (productId, quantity, type, userId, notes) => {\n        const product = get().getProductById(productId);",
    "      adjustStock: (productId, quantity, type, userId, notes) => {\n        const tenant = requireTenantContext(get().tenantContext);\n        const product = get().getProductById(productId);",
    1,
)

content = content.replace("'market-1'", "tenant.marketId")
content = content.replace("'branch-1'", "tenant.branchId")

# Persisted data must not carry an authenticated tenant context across login boundaries.
old_partial = "partialize: (state) => state,"
if old_partial in content:
    content = content.replace(old_partial, "partialize: ({ tenantContext: _tenantContext, ...state }) => state,", 1)

path.write_text(content, encoding='utf-8')

# Production blocker scan across the application source.
violations = []
for candidate in Path('source/src').rglob('*'):
    if candidate.suffix not in {'.ts', '.tsx', '.js', '.jsx'}:
        continue
    text = candidate.read_text(encoding='utf-8')
    for token in ("'market-1'", '"market-1"', "'branch-1'", '"branch-1"'):
        if token in text:
            violations.append(f'{candidate}:{token}')
if violations:
    raise SystemExit('Hardcoded tenant IDs remain: ' + ', '.join(violations))

print('Tenant context hardened; no hardcoded market-1/branch-1 remain in application source.')
