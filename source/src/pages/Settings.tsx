import { useState } from 'react';
import { Store, Users, Shield, Receipt, DollarSign, Zap, Save, ChevronLeft } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { translations } from '../constants/translations';
import { PERMISSIONS, PERMISSION_MODULES, ROLE_PERMISSIONS } from '../constants/permissions';
import { FEATURE_FLAGS, FEATURE_FLAG_NAMES, DEFAULT_FEATURE_FLAGS } from '../constants/featureFlags';
import { PageHeader, PageContent } from '../components/layout/Layout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { toast } from '../components/ui/Toast';
import { cn } from '../utils/cn';
import type { Currency } from '../types';
import { CategoryManager } from '../components/features/CategoryManager';
import { CashSessionHistory } from '../components/features/CashSession';
import { BackupRestoreWidget } from '../components/features/BackupRestore';
import { AutoLockToggle } from '../components/features/InactivityLock';
import { Database } from 'lucide-react';

type SettingsTab = 'general' | 'categories' | 'users' | 'roles' | 'receipt' | 'currency' | 'cashsession' | 'features' | 'backup';

// User management is server-authoritative in v19; no local password/user database.

// Receipt settings store
function getReceiptSettings() {
  try { return JSON.parse(localStorage.getItem('zhirox-receipt') || '{}'); } catch { return {}; }
}
function saveReceiptSettings(s: any) { localStorage.setItem('zhirox-receipt', JSON.stringify(s)); }

// Exchange rate store
function getExchangeRate(): number {
  try { return Number(localStorage.getItem('zhirox-exchange-rate')) || 1500; } catch { return 1500; }
}
function saveExchangeRate(r: number) { localStorage.setItem('zhirox-exchange-rate', r.toString()); }

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab | null>(null);
  const { hasPermission, market, user: currentUser } = useAuthStore();
  const { addAuditLog } = useDataStore();

  const [marketSettings, setMarketSettings] = useState({
    name: market?.name || '',
    phone: market?.phone || '',
    address: market?.address || '',
    currency: market?.currency || 'IQD',
  });

  const [featureFlags, setFeatureFlags] = useState(DEFAULT_FEATURE_FLAGS);

  // Receipt settings
  const [receiptSettings, setReceiptSettings] = useState(() => ({
    shopName: market?.name || 'ZHIROX',
    shopSubtitle: '',
    shopAddress: market?.address || '',
    shopPhone: market?.phone || '',
    footerText: 'سوپاس بۆ کڕینت!',
    showLogo: true,
    showQR: true,
    ...getReceiptSettings(),
  }));

  // Exchange rate
  const [exchangeRate, setExchangeRate] = useState(getExchangeRate());

  // Role permissions editing
  const [editingRole, setEditingRole] = useState<string | null>(null);

  const handleSaveSettings = () => {
    if (!currentUser?.market_id || !currentUser.branch_id) { toast.error('هەژماری فرۆشگا/لق دیاری نەکراوە'); return; }
    addAuditLog({ market_id: currentUser.market_id, branch_id: currentUser.branch_id, user_id: currentUser.id, action: 'settings.changed', module: 'settings', table_name: 'settings', new_value: marketSettings as any });
    toast.success(translations.settings.settings_saved);
  };

  const handleSaveReceiptSettings = () => {
    saveReceiptSettings(receiptSettings);
    toast.success('ڕێکخستنەکانی وەسڵ پاشەکەوتکران');
  };

  const handleSaveExchangeRate = () => {
    saveExchangeRate(exchangeRate);
    toast.success('ڕێژەی گۆڕین پاشەکەوتکرا');
  };

  const tabs = [
    { id: 'general', label: translations.settings.general, icon: Store },
    { id: 'categories', label: 'پۆلەکان', icon: Store },
    { id: 'users', label: translations.settings.users, icon: Users },
    { id: 'roles', label: translations.settings.roles, icon: Shield },
    { id: 'receipt', label: translations.settings.receipt_settings, icon: Receipt },
    { id: 'currency', label: translations.settings.currency_settings, icon: DollarSign },
    { id: 'cashsession', label: 'مێژووی صندوق', icon: DollarSign },
    { id: 'features', label: translations.settings.feature_flags, icon: Zap },
    { id: 'backup', label: 'باکئەپ و داتا', icon: Database },
  ];


  const roleLabels: Record<string, string> = { owner: 'خاوەن', admin: 'بەڕێوەبەر', cashier: 'کاشێر', stock_staff: 'بەرپرسی کۆگا', accountant: 'ژمێریار' };

  const showMobileMenu = activeTab === null;

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <Card>
            <CardHeader title={translations.settings.market_settings} subtitle="ڕێکخستنەکانی گشتی مارکێت" icon={<Store className="w-5 h-5" />} />
            <div className="space-y-4">
              <Input label={translations.settings.market_name} value={marketSettings.name} onChange={(e) => setMarketSettings({ ...marketSettings, name: e.target.value })} />
              <Input label={translations.settings.market_phone} value={marketSettings.phone} onChange={(e) => setMarketSettings({ ...marketSettings, phone: e.target.value })} />
              <Input label={translations.settings.market_address} value={marketSettings.address} onChange={(e) => setMarketSettings({ ...marketSettings, address: e.target.value })} />
              <Select label={translations.settings.default_currency} value={marketSettings.currency} onChange={(e) => setMarketSettings({ ...marketSettings, currency: e.target.value as Currency })} options={[{ value: 'IQD', label: 'دینار (IQD)' }, { value: 'USD', label: 'دۆلار (USD)' }]} />
              {hasPermission(PERMISSIONS.SETTINGS_MANAGE) && (
                <div className="pt-4 border-t"><Button onClick={handleSaveSettings} leftIcon={<Save className="w-4 h-4" />}>{translations.settings.save_settings}</Button></div>
              )}
            </div>
          </Card>
        );

      case 'categories':
        return <Card><CategoryManager /></Card>;

      case 'users':
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

      case 'roles':
        return (
          <Card>
            <CardHeader title={translations.settings.roles} subtitle="بەڕێوەبردنی ڕۆڵ و ڕێگەپێدانەکان" icon={<Shield className="w-5 h-5" />} />
            <div className="space-y-4">
              {Object.entries(ROLE_PERMISSIONS).filter(([role]) => ['owner', 'admin', 'cashier', 'stock_staff', 'accountant'].includes(role)).map(([role, perms]) => (
                <div key={role} className="border border-slate-200 rounded-xl overflow-hidden">
                  <button onClick={() => setEditingRole(editingRole === role ? null : role)} className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold" style={{ backgroundColor: role === 'owner' ? '#6366f1' : role === 'admin' ? '#10b981' : role === 'cashier' ? '#f59e0b' : role === 'stock_staff' ? '#3b82f6' : '#a855f7' }}>
                        {(roleLabels[role] || role).charAt(0)}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900">{roleLabels[role] || role}</p>
                        <p className="text-xs text-slate-500">{perms.length} ڕێگەپێدان</p>
                      </div>
                    </div>
                    <Badge variant="info" size="sm">{perms.length}</Badge>
                  </button>
                  
                  {editingRole === role && (
                    <div className="p-4 bg-slate-50 border-t border-slate-200 animate-slideUp">
                      {Object.entries(PERMISSION_MODULES).map(([modKey, mod]) => (
                        <div key={modKey} className="mb-3">
                          <p className="text-xs font-bold text-slate-500 mb-1.5">{mod.name}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {mod.permissions.map(perm => {
                              const hasIt = perms.includes(perm as any);
                              return (
                                <span key={perm} className={cn("px-2 py-1 rounded-lg text-[10px] font-medium", hasIt ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500")}>
                                  {hasIt ? '✓' : '✗'} {perm.split('.')[1]}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        );

      case 'receipt':
        return (
          <Card>
            <CardHeader title={translations.settings.receipt_settings} subtitle="ڕێکخستنەکانی وەسڵ و چاپکردن" icon={<Receipt className="w-5 h-5" />} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Settings Form */}
              <div className="space-y-4">
                <Input label="ناوی دوکان" value={receiptSettings.shopName} onChange={e => setReceiptSettings({ ...receiptSettings, shopName: e.target.value })} />
                <Input label="ژێرناو" value={receiptSettings.shopSubtitle} onChange={e => setReceiptSettings({ ...receiptSettings, shopSubtitle: e.target.value })} />
                <Input label="ناونیشان" value={receiptSettings.shopAddress} onChange={e => setReceiptSettings({ ...receiptSettings, shopAddress: e.target.value })} />
                <Input label="ژمارەی تەلەفۆن" value={receiptSettings.shopPhone} onChange={e => setReceiptSettings({ ...receiptSettings, shopPhone: e.target.value })} />
                <Input label="دەقی خوارەوەی وەسڵ" value={receiptSettings.footerText} onChange={e => setReceiptSettings({ ...receiptSettings, footerText: e.target.value })} />
                
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <span className="text-sm">پیشاندانی QR</span>
                  <button onClick={() => setReceiptSettings({ ...receiptSettings, showQR: !receiptSettings.showQR })} className={cn("w-12 h-6 rounded-full transition-colors relative", receiptSettings.showQR ? 'bg-emerald-500' : 'bg-slate-300')}>
                    <span className={cn("absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform", receiptSettings.showQR ? 'right-0.5' : 'left-0.5')} />
                  </button>
                </div>

                <Button onClick={handleSaveReceiptSettings} leftIcon={<Save className="w-4 h-4" />}>پاشەکەوتکردن</Button>
              </div>

              {/* Receipt Preview */}
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500 mb-3 font-medium">پێشبینی وەسڵ:</p>
                <div className="bg-white p-5 rounded-lg font-mono text-sm text-center shadow-inner max-w-[250px] mx-auto">
                  <p className="font-black text-xl mb-0.5">{receiptSettings.shopName}</p>
                  <p className="text-xs text-slate-500 mb-1">{receiptSettings.shopSubtitle}</p>
                  <p className="text-[10px] text-slate-400">{receiptSettings.shopAddress}</p>
                  <p className="text-[10px] text-slate-400 mb-3">{receiptSettings.shopPhone}</p>
                  <div className="border-t border-dashed border-slate-300 my-2" />
                  <div className="text-right text-[10px] space-y-1 text-slate-600">
                    <div className="flex justify-between"><span>وەسڵ:</span><span className="font-bold">R20240115-1001</span></div>
                    <div className="flex justify-between"><span>بەروار:</span><span>2024/01/15 14:30</span></div>
                    <div className="flex justify-between"><span>کڕیار:</span><span>ئەحمەد محمد</span></div>
                  </div>
                  <div className="border-t border-dashed border-slate-300 my-2" />
                  <div className="text-right text-[10px] space-y-1">
                    <div className="flex justify-between"><span>ئاوی مەعدەنی</span><span>2 × 250</span><span className="font-bold">500</span></div>
                    <div className="flex justify-between"><span>پێپسی</span><span>1 × 500</span><span className="font-bold">500</span></div>
                  </div>
                  <div className="border-t-2 border-dashed border-slate-300 my-2" />
                  <div className="flex justify-between font-black text-sm"><span>کۆ:</span><span>1,000 د.ع</span></div>
                  <div className="border-t border-dashed border-slate-300 my-2" />
                  <p className="text-[10px] font-medium mt-2">{receiptSettings.footerText}</p>
                  {receiptSettings.showQR && <div className="w-16 h-16 bg-slate-100 rounded mx-auto mt-2 flex items-center justify-center text-[8px] text-slate-400">QR</div>}
                  <p className="text-[8px] text-slate-400 mt-2">ZHIROX HyperMarket OS</p>
                </div>
              </div>
            </div>
          </Card>
        );

      case 'currency':
        return (
          <Card>
            <CardHeader title={translations.settings.currency_settings} subtitle="ڕێکخستنەکانی دراو و ڕێژەی گۆڕین" icon={<DollarSign className="w-5 h-5" />} />
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-emerald-50 rounded-xl text-center">
                  <p className="text-3xl font-black text-emerald-700 mb-1">IQD</p>
                  <p className="text-sm text-emerald-600 font-medium">دیناری عێراقی</p>
                  <Badge variant="success" size="sm">دراوی سەرەکی</Badge>
                </div>
                <div className="p-4 bg-blue-50 rounded-xl text-center">
                  <p className="text-3xl font-black text-blue-700 mb-1">USD</p>
                  <p className="text-sm text-blue-600 font-medium">دۆلاری ئەمریکی</p>
                  <Badge variant="info" size="sm">دراوی دووەم</Badge>
                </div>
              </div>

              <div className="p-5 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl">
                <h4 className="font-semibold text-slate-900 mb-3">ڕێژەی گۆڕین</h4>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 p-3 bg-white rounded-xl text-center">
                    <p className="text-2xl font-black text-blue-600">$1</p>
                    <p className="text-xs text-slate-500">دۆلار</p>
                  </div>
                  <span className="text-2xl text-slate-400">=</span>
                  <div className="flex-1">
                    <input type="number" value={exchangeRate} onChange={e => setExchangeRate(Number(e.target.value))} className="w-full px-4 py-3 text-center text-2xl font-black text-emerald-600 border-2 border-emerald-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
                    <p className="text-xs text-slate-500 text-center mt-1">دینار</p>
                  </div>
                </div>
                <Button onClick={handleSaveExchangeRate} leftIcon={<Save className="w-4 h-4" />} className="w-full">پاشەکەوتکردنی ڕێژەی گۆڕین</Button>
              </div>

              <div className="p-4 bg-amber-50 rounded-xl">
                <p className="text-sm text-amber-700">
                  <strong>تێبینی:</strong> ئەم ڕێژەیە لە ژمێرەری گۆڕینی دراو و ڕاپۆرتەکاندا بەکاردێت.
                </p>
              </div>
            </div>
          </Card>
        );

      case 'cashsession':
        return (
          <Card>
            <CardHeader title="مێژووی صندوق" subtitle="کردنەوە و داخستنی صندوقەکان" icon={<DollarSign className="w-5 h-5" />} />
            <CashSessionHistory />
          </Card>
        );

      case 'features':
        return (
          <Card>
            <CardHeader title={translations.settings.feature_flags} subtitle="چالاککردن و ناچالاککردنی تایبەتمەندیەکان" icon={<Zap className="w-5 h-5" />} />
            <div className="space-y-2">
              {Object.entries(FEATURE_FLAGS).map(([key, flagKey]) => {
                const isEnabled = featureFlags[flagKey];
                const name = FEATURE_FLAG_NAMES[flagKey];
                const isCore = ['pos_enabled', 'debt_enabled', 'inventory_enabled', 'reports_enabled'].includes(flagKey);
                return (
                  <div key={key} className={cn('flex items-center justify-between p-3 rounded-xl', isEnabled ? 'bg-emerald-50' : 'bg-slate-50')}>
                    <div>
                      <p className={cn('font-medium text-sm', isEnabled ? 'text-emerald-900' : 'text-slate-700')}>{name}</p>
                      {isCore && <p className="text-xs text-slate-500">تایبەتمەندی سەرەکی</p>}
                    </div>
                    <button onClick={() => { if (!isCore) setFeatureFlags({ ...featureFlags, [flagKey]: !isEnabled }); }} disabled={isCore}
                      className={cn('relative w-12 h-6 rounded-full transition-colors', isEnabled ? 'bg-emerald-500' : 'bg-slate-300', isCore && 'cursor-not-allowed opacity-70')}>
                      <span className={cn('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', isEnabled ? 'right-0.5' : 'left-0.5')} />
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        );

      case 'backup':
        return (
          <Card>
            <CardHeader title="باکئەپ و پاراستن" subtitle="هەناردن، هاوردن و قفڵی ئۆتۆماتیک" icon={<Database className="w-5 h-5" />} />
            <BackupRestoreWidget />
            <div className="mt-6 pt-6 border-t">
              <AutoLockToggle />
            </div>
          </Card>
        );

      default: return null;
    }
  };

  return (
    <div>
      <PageHeader title={translations.settings.title}
        action={activeTab && <Button variant="ghost" size="sm" onClick={() => setActiveTab(null)} leftIcon={<ChevronLeft className="w-4 h-4" />} className="lg:hidden">گەڕانەوە</Button>}
      />
      <PageContent>
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          <div className={cn('lg:w-64 flex-shrink-0', !showMobileMenu && 'hidden lg:block')}>
            <Card padding="sm">
              <nav className="space-y-1">
                {tabs.map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id as SettingsTab)} className={cn('w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right transition-colors', activeTab === tab.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50')}>
                    <tab.icon className="w-5 h-5" /><span className="font-medium text-sm">{tab.label}</span>
                  </button>
                ))}
              </nav>
            </Card>
          </div>
          <div className={cn('flex-1', showMobileMenu && 'hidden lg:block')}>
            {activeTab ? renderContent() : <Card className="hidden lg:block"><div className="text-center py-12 text-slate-500"><Store className="w-12 h-12 mx-auto mb-4 text-slate-300" /><p>لە لیستی ڕاستەوە بەشێک هەڵبژێرە</p></div></Card>}
          </div>
        </div>
      </PageContent>
    </div>
  );
}
