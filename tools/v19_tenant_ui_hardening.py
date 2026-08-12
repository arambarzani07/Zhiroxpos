from pathlib import Path
import re
import runpy

SRC = Path('source/src')

def patch(path: str, transform):
    target = Path(path)
    before = target.read_text(encoding='utf-8')
    after = transform(before)
    if before == after:
        raise SystemExit(f'Expected patch made no changes: {path}')
    target.write_text(after, encoding='utf-8')


def guard_user(text: str, signature: str, user_name: str = 'user') -> str:
    needle = signature + "\n"
    if needle not in text:
        raise SystemExit(f'Handler signature not found: {signature}')
    guard = (
        needle
        + f"    if (!{user_name}?.market_id || !{user_name}.branch_id) {{\n"
        + "      toast.error('هەژماری فرۆشگا/لق دیاری نەکراوە');\n"
        + "      return;\n"
        + "    }\n"
    )
    return text.replace(needle, guard, 1)


def customers(text: str) -> str:
    text = guard_user(text, "  const handleSaveCustomer = (customerData: Partial<Customer>) => {")
    text = text.replace("market_id: 'market-1'", "market_id: user.market_id")
    text = text.replace("branch_id: 'branch-1'", "branch_id: user.branch_id")
    text = text.replace("created_by: user?.id || ''", "created_by: user.id")
    return text


def products(text: str) -> str:
    text = guard_user(text, "  const handleSaveProduct = (productData: Partial<Product>) => {")
    text = text.replace("market_id: 'market-1'", "market_id: user.market_id")
    text = text.replace("branch_id: 'branch-1'", "branch_id: user.branch_id")
    text = text.replace("created_by: user?.id || ''", "created_by: user.id")
    return text


def categories(text: str) -> str:
    text = guard_user(text, "  const handleAdd = () => {")
    text = guard_user(text, "  const handleEdit = (id: string) => {")
    text = text.replace("market_id: 'market-1'", "market_id: user.market_id")
    return text


def quick_customer(text: str) -> str:
    text = guard_user(text, "  const handleAdd = () => {")
    text = text.replace("market_id: 'market-1'", "market_id: user.market_id")
    text = text.replace("created_by: user?.id || ''", "created_by: user.id")
    return text


def sale_history(text: str) -> str:
    old = "  const handleCancelSale = () => {\n    if (!selectedSale || !user) return;"
    new = (
        "  const handleCancelSale = () => {\n"
        "    if (!selectedSale || !user?.market_id || !user.branch_id) {\n"
        "      toast.error('هەژماری فرۆشگا/لق دیاری نەکراوە');\n"
        "      return;\n"
        "    }"
    )
    if old not in text:
        raise SystemExit('SaleHistory cancel handler pattern not found')
    text = text.replace(old, new, 1)
    text = text.replace("market_id: 'market-1'", "market_id: user.market_id")
    text = text.replace("branch_id: 'branch-1'", "branch_id: user.branch_id")
    return text


def sale_return(text: str) -> str:
    old = "  const handleReturn = () => {\n    if (!user || !foundSale) return;"
    new = (
        "  const handleReturn = () => {\n"
        "    if (!user?.market_id || !user.branch_id || !foundSale) {\n"
        "      toast.error('هەژماری فرۆشگا/لق دیاری نەکراوە');\n"
        "      return;\n"
        "    }"
    )
    if old not in text:
        raise SystemExit('SaleReturn handler pattern not found')
    text = text.replace(old, new, 1)
    text = text.replace("market_id: 'market-1'", "market_id: user.market_id")
    text = text.replace("branch_id: 'branch-1'", "branch_id: user.branch_id")
    return text


def cash_session(text: str) -> str:
    text = text.replace(
        "  const handleOpen = () => {\n    if (!user) return;",
        "  const handleOpen = () => {\n    if (!user?.market_id || !user.branch_id) {\n      toast.error('هەژماری فرۆشگا/لق دیاری نەکراوە');\n      return;\n    }",
        1,
    )
    text = text.replace(
        "  const handleClose = () => {\n    if (!session || !user || !stats) return;",
        "  const handleClose = () => {\n    if (!session || !user?.market_id || !user.branch_id || !stats) {\n      toast.error('هەژماری فرۆشگا/لق دیاری نەکراوە');\n      return;\n    }",
        1,
    )
    text = text.replace("market_id: 'market-1'", "market_id: user.market_id")
    text = text.replace("branch_id: 'branch-1'", "branch_id: user.branch_id")
    return text


def settings(text: str) -> str:
    # Remove insecure browser-local user/password database entirely. User management
    # is intentionally disabled until the authoritative server user API is wired.
    text, count = re.subn(
        r"// User management store \(local\).*?// Receipt settings store",
        "// User management is server-authoritative in v19; no local password/user database.\n\n// Receipt settings store",
        text,
        count=1,
        flags=re.S,
    )
    if count != 1:
        raise SystemExit('Settings local-user store block not found')

    text = text.replace(
        "    name: market?.name || 'سوپەرمارکێتی ژیرۆکس',\n    phone: market?.phone || '07501234567',\n    address: market?.address || 'سلێمانی، شەقامی سالم',",
        "    name: market?.name || '',\n    phone: market?.phone || '',\n    address: market?.address || '',",
        1,
    )

    text, count = re.subn(
        r"\n  // User management\n.*?\n  // Receipt settings",
        "\n  // Receipt settings",
        text,
        count=1,
        flags=re.S,
    )
    if count != 1:
        raise SystemExit('Settings local-user React state block not found')

    text = text.replace(
        "    shopName: 'ZHIROX',\n    shopSubtitle: 'سوپەرمارکێت',\n    shopAddress: 'سلێمانی، شەقامی سالم',\n    shopPhone: '07501234567',",
        "    shopName: market?.name || 'ZHIROX',\n    shopSubtitle: '',\n    shopAddress: market?.address || '',\n    shopPhone: market?.phone || '',",
        1,
    )

    text = text.replace(
        "  const handleSaveSettings = () => {\n    if (currentUser) addAuditLog({ market_id: 'market-1', user_id: currentUser.id, action: 'settings.changed', module: 'settings', table_name: 'settings', new_value: marketSettings as any });",
        "  const handleSaveSettings = () => {\n    if (!currentUser?.market_id || !currentUser.branch_id) { toast.error('هەژماری فرۆشگا/لق دیاری نەکراوە'); return; }\n    addAuditLog({ market_id: currentUser.market_id, branch_id: currentUser.branch_id, user_id: currentUser.id, action: 'settings.changed', module: 'settings', table_name: 'settings', new_value: marketSettings as any });",
        1,
    )

    text, count = re.subn(
        r"\n  const handleSaveUser = \(\) => \{.*?\n  const handleSaveReceiptSettings = \(\) => \{",
        "\n  const handleSaveReceiptSettings = () => {",
        text,
        count=1,
        flags=re.S,
    )
    if count != 1:
        raise SystemExit('Settings local-user handler block not found')

    user_case = r'''      case 'users':
        return (
          <Card>
            <CardHeader title={translations.settings.users} subtitle="بەڕێوەبردنی بەکارهێنەر لە سێرڤەری Production" icon={<Users className="w-5 h-5" />} />
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50">
                <p className="font-medium text-indigo-900">هەژماری چالاک</p>
                <p className="text-sm text-indigo-700 mt-1">{currentUser?.full_name || '-'} • {currentUser?.username || '-'}</p>
              </div>
              <p className="text-sm text-slate-600 leading-7">
                لە وەشانی Production هیچ وشەی نهێنی یان لیستی بەکارهێنەر لە localStorage ناپارێزرێت. زیادکردن، گۆڕینی ڕۆڵ و بلۆککردنی بەکارهێنەر تەنها لە API ـی پارێزراوی سێرڤەر جێبەجێ دەکرێت.
              </p>
              <Badge variant="warning">Server-authoritative only</Badge>
            </div>
          </Card>
        );

      case 'roles':'''
    text, count = re.subn(
        r"      case 'users':.*?      case 'roles':",
        user_case,
        text,
        count=1,
        flags=re.S,
    )
    if count != 1:
        raise SystemExit('Settings users case not found')

    return text


patch('source/src/pages/Customers.tsx', customers)
patch('source/src/pages/Products.tsx', products)
patch('source/src/pages/Settings.tsx', settings)
patch('source/src/components/features/CategoryManager.tsx', categories)
patch('source/src/components/features/QuickCustomerAdd.tsx', quick_customer)
patch('source/src/components/features/SaleHistory.tsx', sale_history)
patch('source/src/components/features/SaleReturn.tsx', sale_return)
patch('source/src/components/features/CashSession.tsx', cash_session)

# Now patch the central store and run its full hardcoded tenant scan.
runpy.run_path('tools/v19_tenant_context.py', run_name='__main__')

# Expanded production scan across all application source.
forbidden = ('market-1', 'branch-1', 'MOCK_USERS', 'defaultUsers', "password: '123456'", 'password: "123456"')
violations = []
for candidate in SRC.rglob('*'):
    if candidate.suffix not in {'.ts', '.tsx', '.js', '.jsx'}:
        continue
    body = candidate.read_text(encoding='utf-8')
    for token in forbidden:
        if token in body:
            violations.append(f'{candidate}:{token}')
if violations:
    raise SystemExit('Production source blockers remain: ' + ', '.join(violations))

print('Tenant/UI hardening complete: no fake tenant IDs or local demo credentials remain in src.')
