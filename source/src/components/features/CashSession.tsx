import { useState, useMemo } from 'react';
import { Landmark, DoorOpen, DoorClosed } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

import { Badge } from '../ui/Badge';
import { toast } from '../ui/Toast';
import { cn } from '../../utils/cn';
import { format } from 'date-fns';
import type { CashSession } from '../../types';

function fmt(n: number) { return `${n.toLocaleString()} د.ع`; }

function getSessions(): CashSession[] {
  try { return JSON.parse(localStorage.getItem('zhirox-sessions') || '[]'); } catch { return []; }
}
function saveSessions(s: CashSession[]) { localStorage.setItem('zhirox-sessions', JSON.stringify(s)); }

export function useCashSession() {
  const { user } = useAuthStore();
  const sessions = getSessions();
  const active = sessions.find(s => s.status === 'open' && s.cashier_id === user?.id);
  return { activeSession: active, sessions };
}

export function CashSessionBar() {
  const { user } = useAuthStore();
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const { activeSession } = useCashSession();

  if (!user) return null;

  return (
    <>
      <div className={cn('flex items-center gap-2 px-3 py-2 rounded-xl text-sm', activeSession ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
        {activeSession ? (
          <>
            <DoorOpen className="w-4 h-4" />
            <span className="font-medium hidden sm:inline">صندوق کراوەیە</span>
            <span className="text-xs hidden md:inline">• {fmt(activeSession.opening_amount)}</span>
            <button onClick={() => setShowClose(true)} className="mr-2 px-2 py-0.5 bg-red-100 text-red-600 rounded-lg text-xs font-medium hover:bg-red-200">داخستن</button>
          </>
        ) : (
          <>
            <DoorClosed className="w-4 h-4" />
            <span className="font-medium hidden sm:inline">صندوق داخراوە</span>
            <button onClick={() => setShowOpen(true)} className="mr-2 px-2 py-0.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700">کردنەوە</button>
          </>
        )}
      </div>

      <OpenSessionModal isOpen={showOpen} onClose={() => setShowOpen(false)} />
      <CloseSessionModal isOpen={showClose} onClose={() => setShowClose(false)} session={activeSession || null} />
    </>
  );
}

function OpenSessionModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuthStore();
  const { addAuditLog } = useDataStore();
  const [amount, setAmount] = useState(0);

  const handleOpen = () => {
    if (!user?.market_id || !user.branch_id) {
      toast.error('هەژماری فرۆشگا/لق دیاری نەکراوە');
      return;
    }
    const session: CashSession = {
      id: `cs-${Date.now()}`, market_id: user.market_id, branch_id: user.branch_id,
      cashier_id: user.id, opening_amount: amount, currency: 'IQD',
      status: 'open', opened_at: new Date().toISOString(),
    };
    const sessions = getSessions();
    sessions.push(session);
    saveSessions(sessions);
    addAuditLog({ market_id: user.market_id, branch_id: user.branch_id, user_id: user.id, action: 'settings.changed', module: 'cash_session', table_name: 'cash_sessions', record_id: session.id, new_value: { opening_amount: amount } as any });
    toast.success('صندوق کرایەوە');
    setAmount(0);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="کردنەوەی صندوق" size="sm">
      <div className="space-y-4">
        <div className="p-4 bg-emerald-50 rounded-xl text-center">
          <Landmark className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm text-emerald-700">بڕی پارەی ناو صندوق لە سەرەتای ڕۆژ بنووسە</p>
        </div>
        <Input label="بڕی سەرەتایی (د.ع)" type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} />
        <div className="grid grid-cols-3 gap-2">
          {[0, 50000, 100000].map(a => (
            <button key={a} onClick={() => setAmount(a)} className="py-2 bg-slate-100 rounded-lg text-sm hover:bg-slate-200">{fmt(a)}</button>
          ))}
        </div>
        <Button onClick={handleOpen} className="w-full" leftIcon={<DoorOpen className="w-4 h-4" />}>کردنەوەی صندوق</Button>
      </div>
    </Modal>
  );
}

function CloseSessionModal({ isOpen, onClose, session }: { isOpen: boolean; onClose: () => void; session: CashSession | null }) {
  const { user } = useAuthStore();
  const { getSales, addAuditLog } = useDataStore();
  const [closingAmount, setClosingAmount] = useState(0);

  const stats = useMemo(() => {
    if (!session) return null;
    const sales = getSales().filter(s => s.status === 'completed' && new Date(s.created_at) >= new Date(session.opened_at));
    const totalCash = sales.reduce((s, sale) => s + sale.paid_amount, 0);
    const totalDebt = sales.reduce((s, sale) => s + sale.debt_amount, 0);
    const expected = session.opening_amount + totalCash;
    return { sales: sales.length, totalCash, totalDebt, totalSales: sales.reduce((s, sale) => s + sale.total_amount, 0), expected };
  }, [session, getSales]);

  const handleClose = () => {
    if (!session || !user?.market_id || !user.branch_id || !stats) {
      toast.error('هەژماری فرۆشگا/لق دیاری نەکراوە');
      return;
    }
    const sessions = getSessions().map(s => s.id === session.id ? {
      ...s, status: 'closed' as const, closing_amount: closingAmount,
      expected_amount: stats.expected, difference: closingAmount - stats.expected,
      closed_at: new Date().toISOString(),
    } : s);
    saveSessions(sessions);
    addAuditLog({ market_id: user.market_id, branch_id: user.branch_id, user_id: user.id, action: 'settings.changed', module: 'cash_session', table_name: 'cash_sessions', record_id: session.id, new_value: { closing_amount: closingAmount, expected: stats.expected, difference: closingAmount - stats.expected } as any });
    toast.success('صندوق داخرا');
    onClose();
  };

  if (!session || !stats) return null;
  const diff = closingAmount - stats.expected;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="داخستنی صندوق" size="md">
      <div className="space-y-4">
        {/* Session Info */}
        <div className="p-4 bg-slate-50 rounded-xl space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">کرایەوە لە:</span><span>{format(new Date(session.opened_at), 'HH:mm')}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">پارەی سەرەتا:</span><span className="font-semibold">{fmt(session.opening_amount)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">ژمارەی فرۆشتن:</span><span>{stats.sales}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">پارەی نەقد:</span><span className="text-emerald-600 font-semibold">{fmt(stats.totalCash)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">قەرز:</span><span className="text-red-600">{fmt(stats.totalDebt)}</span></div>
          <div className="flex justify-between border-t pt-2 font-bold"><span>پارەی چاوەڕوانکراو:</span><span className="text-indigo-600">{fmt(stats.expected)}</span></div>
        </div>

        <Input label="پارەی ناو صندوق (ئێستا)" type="number" value={closingAmount} onChange={e => setClosingAmount(Number(e.target.value))} />

        {closingAmount > 0 && (
          <div className={cn('p-3 rounded-xl text-center', Math.abs(diff) < 1 ? 'bg-emerald-50' : diff > 0 ? 'bg-blue-50' : 'bg-red-50')}>
            <p className="text-sm text-slate-600">جیاوازی</p>
            <p className={cn('text-2xl font-bold', Math.abs(diff) < 1 ? 'text-emerald-600' : diff > 0 ? 'text-blue-600' : 'text-red-600')}>
              {diff > 0 ? '+' : ''}{fmt(diff)}
            </p>
            {Math.abs(diff) < 1 && <p className="text-xs text-emerald-600 mt-1">✓ تەواو دروستە</p>}
            {diff > 0 && <p className="text-xs text-blue-600 mt-1">پارە زیادە</p>}
            {diff < 0 && <p className="text-xs text-red-600 mt-1">⚠ کەمە!</p>}
          </div>
        )}

        <Button onClick={handleClose} variant="danger" className="w-full" leftIcon={<DoorClosed className="w-4 h-4" />}>داخستنی صندوق</Button>
      </div>
    </Modal>
  );
}

// Session History
export function CashSessionHistory() {
  const sessions = getSessions().sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());

  return (
    <div className="space-y-3">
      {sessions.length === 0 ? (
        <div className="text-center py-8 text-slate-400"><Landmark className="w-10 h-10 mx-auto mb-2" /><p className="text-sm">هیچ سێشنێک نییە</p></div>
      ) : (
        sessions.slice(0, 10).map(s => (
          <div key={s.id} className={cn('p-3 rounded-xl border', s.status === 'open' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200')}>
            <div className="flex justify-between mb-1">
              <Badge variant={s.status === 'open' ? 'success' : 'default'} size="sm">{s.status === 'open' ? 'کراوە' : 'داخراوە'}</Badge>
              <span className="text-xs text-slate-500">{format(new Date(s.opened_at), 'MM/dd HH:mm')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>سەرەتا: {fmt(s.opening_amount)}</span>
              {s.closing_amount !== undefined && <span>کۆتایی: {fmt(s.closing_amount)}</span>}
            </div>
            {s.difference !== undefined && (
              <p className={cn('text-xs mt-1', s.difference === 0 ? 'text-emerald-600' : s.difference > 0 ? 'text-blue-600' : 'text-red-600')}>
                جیاوازی: {s.difference > 0 ? '+' : ''}{fmt(s.difference)}
              </p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
