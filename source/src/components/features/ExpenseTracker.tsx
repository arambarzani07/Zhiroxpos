import { useState, useMemo } from 'react';
import { Receipt, Plus, Trash2, DollarSign, TrendingDown } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Card } from '../ui/Card';
import { toast } from '../ui/Toast';
import { format } from 'date-fns';

function fmt(n: number) { return `${n.toLocaleString()} د.ع`; }

interface Expense { id: string; category: string; amount: number; description: string; date: string; }

const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'کرێ' },
  { value: 'electricity', label: 'کارەبا' },
  { value: 'water', label: 'ئاو' },
  { value: 'internet', label: 'ئینتەرنێت' },
  { value: 'salary', label: 'مووچە' },
  { value: 'transport', label: 'گواستنەوە' },
  { value: 'cleaning', label: 'پاککردنەوە' },
  { value: 'maintenance', label: 'چاککردنەوە' },
  { value: 'food', label: 'خواردن' },
  { value: 'other', label: 'تر' },
];

function getExpenses(): Expense[] {
  try { return JSON.parse(localStorage.getItem('zhirox-expenses') || '[]'); } catch { return []; }
}
function saveExpenses(e: Expense[]) { localStorage.setItem('zhirox-expenses', JSON.stringify(e)); }

export function ExpenseTrackerWidget() {
  const [expenses, setExpenses] = useState<Expense[]>(getExpenses());
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ category: 'other', amount: 0, description: '' });

  const todayExpenses = useMemo(() => {
    const today = new Date().toDateString();
    return expenses.filter(e => new Date(e.date).toDateString() === today);
  }, [expenses]);

  const monthExpenses = useMemo(() => {
    const now = new Date();
    return expenses.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }, [expenses]);

  const todayTotal = todayExpenses.reduce((s, e) => s + e.amount, 0);
  const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);

  const handleAdd = () => {
    if (form.amount <= 0) return;
    const expense: Expense = { id: Date.now().toString(), ...form, date: new Date().toISOString() };
    const updated = [expense, ...expenses];
    setExpenses(updated);
    saveExpenses(updated);
    setForm({ category: 'other', amount: 0, description: '' });
    setShowAdd(false);
    toast.success('خەرجی تۆمارکرا');
  };

  const handleDelete = (id: string) => {
    const updated = expenses.filter(e => e.id !== id);
    setExpenses(updated);
    saveExpenses(updated);
  };

  const getCategoryLabel = (v: string) => EXPENSE_CATEGORIES.find(c => c.value === v)?.label || v;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-red-500" />
          خەرجیەکان
        </h3>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)} leftIcon={showAdd ? <Trash2 className="w-3 h-3" /> : <Plus className="w-3 h-3" />}>
          {showAdd ? 'داخستن' : 'زیادکردن'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 bg-red-50 rounded-xl text-center">
          <p className="text-lg font-bold text-red-600">{fmt(todayTotal)}</p>
          <p className="text-[10px] text-slate-500">ئەمڕۆ</p>
        </div>
        <div className="p-3 bg-amber-50 rounded-xl text-center">
          <p className="text-lg font-bold text-amber-600">{fmt(monthTotal)}</p>
          <p className="text-[10px] text-slate-500">ئەم مانگە</p>
        </div>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="p-3 bg-slate-50 rounded-xl space-y-3 mb-4 animate-slideUp">
          <Select label="جۆر" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={EXPENSE_CATEGORIES} />
          <Input label="بڕ (د.ع)" type="number" value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} />
          <Input label="وەسف" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="تێبینی..." />
          <Button onClick={handleAdd} disabled={form.amount <= 0} className="w-full">تۆمارکردن</Button>
        </div>
      )}

      {/* Recent Expenses */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {todayExpenses.length === 0 ? (
          <div className="text-center py-4 text-slate-400"><Receipt className="w-8 h-8 mx-auto mb-1" /><p className="text-xs">هیچ خەرجییەک ئەمڕۆ نییە</p></div>
        ) : (
          todayExpenses.map(expense => (
            <div key={expense.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center"><DollarSign className="w-4 h-4 text-red-500" /></div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{getCategoryLabel(expense.category)}</p>
                  {expense.description && <p className="text-xs text-slate-500">{expense.description}</p>}
                  <p className="text-[10px] text-slate-400">{format(new Date(expense.date), 'HH:mm')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-red-600 text-sm">{fmt(expense.amount)}</span>
                <button onClick={() => handleDelete(expense.id)} className="p-1 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
