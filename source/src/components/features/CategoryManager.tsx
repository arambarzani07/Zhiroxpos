// ==============================================
// ZHIROX - Category Manager
// تایبەتمەندی: بەڕێوەبردنی پۆلەکان
// ==============================================

import { useState } from 'react';
import { Plus, Edit, Folder, Save, X } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { toast } from '../ui/Toast';


export function CategoryManager() {
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNameEn, setNewNameEn] = useState('');

  const { user } = useAuthStore();
  const { categories, getCategories, addCategory, updateCategory, addAuditLog } = useDataStore();
  const activeCategories = getCategories();

  const handleAdd = () => {
    if (!user?.market_id || !user.branch_id) {
      toast.error('هەژماری فرۆشگا/لق دیاری نەکراوە');
      return;
    }
    if (!newName.trim()) return;
    const cat = addCategory({
      market_id: user.market_id,
      name: newName.trim(),
      name_en: newNameEn.trim() || undefined,
      sort_order: categories.length + 1,
      status: 'active',
    });
    if (user) {
      addAuditLog({ market_id: user.market_id, user_id: user.id, action: 'products.create', module: 'categories', table_name: 'categories', record_id: cat.id, new_value: { name: cat.name } });
    }
    setNewName('');
    setNewNameEn('');
    setShowAdd(false);
    toast.success('پۆل زیادکرا');
  };

  const handleEdit = (id: string) => {
    if (!user?.market_id || !user.branch_id) {
      toast.error('هەژماری فرۆشگا/لق دیاری نەکراوە');
      return;
    }
    if (!editName.trim()) return;
    updateCategory(id, { name: editName.trim() });
    if (user) {
      addAuditLog({ market_id: user.market_id, user_id: user.id, action: 'products.update', module: 'categories', table_name: 'categories', record_id: id, new_value: { name: editName } });
    }
    setEditId(null);
    setEditName('');
    toast.success('پۆل نوێکرایەوە');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-slate-900 flex items-center gap-2">
          <Folder className="w-5 h-5 text-indigo-600" />
          بەڕێوەبردنی پۆلەکان
        </h4>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)} leftIcon={showAdd ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}>
          {showAdd ? 'هەڵوەشاندنەوە' : 'زیادکردن'}
        </Button>
      </div>

      {showAdd && (
        <div className="p-4 bg-indigo-50 rounded-xl space-y-3 animate-slideUp">
          <Input label="ناوی پۆل" value={newName} onChange={e => setNewName(e.target.value)} placeholder="بۆ نموونە: خواردنەوە" />
          <Input label="ناوی ئینگلیزی (بژارە)" value={newNameEn} onChange={e => setNewNameEn(e.target.value)} placeholder="e.g. Beverages" />
          <Button onClick={handleAdd} disabled={!newName.trim()} leftIcon={<Save className="w-4 h-4" />}>پاشەکەوتکردن</Button>
        </div>
      )}

      <div className="space-y-2">
        {activeCategories.map(cat => (
          <div key={cat.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
            {editId === cat.id ? (
              <div className="flex-1 flex items-center gap-2">
                <input value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 px-3 py-1.5 border border-indigo-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" autoFocus />
                <Button size="sm" onClick={() => handleEdit(cat.id)}><Save className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="w-4 h-4" /></Button>
              </div>
            ) : (
              <>
                <div>
                  <p className="font-medium text-slate-900 text-sm">{cat.name}</p>
                  {cat.name_en && <p className="text-xs text-slate-500">{cat.name_en}</p>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setEditId(cat.id); setEditName(cat.name); }}>
                  <Edit className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        ))}

        {activeCategories.length === 0 && (
          <div className="text-center py-6 text-slate-400">
            <Folder className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">هیچ پۆلێک نییە</p>
          </div>
        )}
      </div>
    </div>
  );
}
