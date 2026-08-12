import { useMemo, useState } from 'react';
import { Target, Save, Edit3, Trophy } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import { cn } from '../../utils/cn';

interface GoalsState {
  sales: number;
  receipts: number;
  profit: number;
}

function getGoals(): GoalsState {
  try {
    const parsed = JSON.parse(localStorage.getItem('zhirox-daily-goals') || '{}');
    return {
      sales: parsed.sales ?? 500000,
      receipts: parsed.receipts ?? 30,
      profit: parsed.profit ?? 100000,
    };
  } catch {
    return { sales: 500000, receipts: 30, profit: 100000 };
  }
}

function saveGoals(goals: GoalsState) {
  localStorage.setItem('zhirox-daily-goals', JSON.stringify(goals));
}

function fmt(n: number) {
  return `${n.toLocaleString()} د.ع`;
}

export function DailyGoalSetterWidget() {
  const { getDashboardSummary } = useDataStore();
  const summary = getDashboardSummary();
  const [editing, setEditing] = useState(false);
  const [goals, setGoals] = useState<GoalsState>(() => getGoals());
  const [draft, setDraft] = useState<GoalsState>(() => getGoals());

  const items = useMemo(
    () => [
      { key: 'sales' as const, label: 'فرۆشتن', current: summary.today_sales, target: goals.sales, format: fmt },
      { key: 'receipts' as const, label: 'وەسڵ', current: summary.receipt_count, target: goals.receipts, format: (n: number) => `${n}` },
      { key: 'profit' as const, label: 'قازانج', current: summary.today_profit, target: goals.profit, format: fmt },
    ],
    [summary, goals]
  );

  const overall = Math.round(
    items.reduce((acc, item) => acc + Math.min(100, (item.current / Math.max(item.target, 1)) * 100), 0) / items.length
  );

  const save = () => {
    setGoals(draft);
    saveGoals(draft);
    setEditing(false);
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-600" />
          ئامانجی ڕۆژانە
        </h3>
        {editing ? (
          <Button size="sm" onClick={save} leftIcon={<Save className="w-4 h-4" />}>پاشەکەوت</Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => { setDraft(goals); setEditing(true); }} leftIcon={<Edit3 className="w-4 h-4" />}>دەستکاری</Button>
        )}
      </div>

      <div className="p-4 bg-indigo-50 rounded-2xl text-center mb-4">
        <div className="text-3xl font-black text-indigo-700">{overall}%</div>
        <div className="text-xs text-slate-500">تەواوکراوی ئامانجەکان</div>
        {overall >= 100 && (
          <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
            <Trophy className="w-3 h-3" /> تەواوبوو
          </div>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const pct = Math.min(100, (item.current / Math.max(item.target, 1)) * 100);
          return (
            <div key={item.key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{item.label}</span>
                <span className="font-medium text-slate-900">
                  {item.format(item.current)} / {item.format(item.target)}
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-indigo-500' : 'bg-amber-500')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {editing && (
                <Input
                  type="number"
                  value={draft[item.key]}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [item.key]: Number(e.target.value) }))}
                />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
