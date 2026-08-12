import { useState } from 'react';
import { Download, Upload, Trash2, AlertTriangle, Database } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { toast } from '../ui/Toast';
import { useDataStore } from '../../stores/dataStore';

export function BackupRestoreWidget() {
  const [showRestore, setShowRestore] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const { resetData } = useDataStore();

  const handleBackup = () => {
    const data: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('zhirox')) data[key] = localStorage.getItem(key);
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zhirox-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('باکئەپ تەواوبوو');
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        Object.entries(data).forEach(([key, value]) => {
          if (key.startsWith('zhirox') && typeof value === 'string') localStorage.setItem(key, value);
        });
        toast.success('داتا گەڕایەوە');
        setTimeout(() => window.location.reload(), 1500);
      } catch { toast.error('فایلەکە نادروستە'); }
    };
    reader.readAsText(file);
    setShowRestore(false);
  };

  const handleReset = () => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith('zhirox')) localStorage.removeItem(key);
    }
    resetData();
    setShowReset(false);
    toast.success('هەموو داتا سڕایەوە');
    setTimeout(() => window.location.reload(), 1500);
  };

  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-slate-900 flex items-center gap-2"><Database className="w-5 h-5 text-indigo-600" /> باکئەپ و گەڕانەوە</h4>
      <button onClick={handleBackup} className="w-full flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors text-right">
        <Download className="w-6 h-6 text-emerald-600" /><div><p className="font-medium text-emerald-900">باکئەپ کردن</p><p className="text-xs text-emerald-700">هەناردنی هەموو داتا بۆ JSON</p></div>
      </button>
      <button onClick={() => setShowRestore(true)} className="w-full flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors text-right">
        <Upload className="w-6 h-6 text-blue-600" /><div><p className="font-medium text-blue-900">گەڕانەوەی داتا</p><p className="text-xs text-blue-700">هاوردنی داتا لە JSON</p></div>
      </button>
      <button onClick={() => setShowReset(true)} className="w-full flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors text-right">
        <Trash2 className="w-6 h-6 text-red-600" /><div><p className="font-medium text-red-900">سڕینەوەی هەموو داتا</p><p className="text-xs text-red-700">هەموو شتێک دەگەڕێتەوە بۆ سەرەتا</p></div>
      </button>
      <Modal isOpen={showRestore} onClose={() => setShowRestore(false)} title="گەڕانەوەی داتا" size="sm">
        <div className="space-y-4 text-center">
          <Upload className="w-12 h-12 text-blue-500 mx-auto" />
          <p className="text-sm text-slate-600">فایلی باکئەپی JSON هەڵبژێرە</p>
          <input type="file" accept=".json" onChange={handleRestore} className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-indigo-600 file:text-white" />
        </div>
      </Modal>
      <Modal isOpen={showReset} onClose={() => setShowReset(false)} title="سڕینەوەی هەموو داتا" size="sm">
        <div className="space-y-4 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
          <p className="font-semibold text-red-700">دڵنیایت؟ ئەم کردارە ناگەڕێتەوە!</p>
          <div className="flex gap-3"><Button variant="secondary" className="flex-1" onClick={() => setShowReset(false)}>نەخێر</Button><Button variant="danger" className="flex-1" onClick={handleReset}>بەڵێ</Button></div>
        </div>
      </Modal>
    </div>
  );
}
