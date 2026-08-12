// ==============================================
// ZHIROX - Quick Notes
// تایبەتمەندی: تێبینی خێرا بۆ خاوەن و ستاف
// ==============================================

import { useState, useEffect } from 'react';
import { StickyNote, Plus, X, Check, Trash2, Pin } from 'lucide-react';
import { cn } from '../../utils/cn';

interface Note {
  id: string;
  text: string;
  color: string;
  pinned: boolean;
  done: boolean;
  createdAt: Date;
}

const NOTE_COLORS = [
  { id: 'yellow', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900' },
  { id: 'blue', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900' },
  { id: 'green', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900' },
  { id: 'pink', bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-900' },
  { id: 'purple', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900' },
];

export function QuickNotesWidget() {
  const [notes, setNotes] = useState<Note[]>(() => {
    try {
      const saved = localStorage.getItem('zhirox-notes');
      if (saved) {
        return JSON.parse(saved).map((n: any) => ({
          ...n,
          createdAt: new Date(n.createdAt),
        }));
      }
    } catch {}
    return [];
  });
  const [isAdding, setIsAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const [selectedColor, setSelectedColor] = useState('yellow');

  useEffect(() => {
    localStorage.setItem('zhirox-notes', JSON.stringify(notes));
  }, [notes]);

  const addNote = () => {
    if (!newText.trim()) return;
    const note: Note = {
      id: Date.now().toString(),
      text: newText.trim(),
      color: selectedColor,
      pinned: false,
      done: false,
      createdAt: new Date(),
    };
    setNotes(prev => [note, ...prev]);
    setNewText('');
    setIsAdding(false);
  };

  const toggleDone = (id: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, done: !n.done } : n));
  };

  const togglePin = (id: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n));
  };

  const deleteNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  const sortedNotes = [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.done !== b.done) return a.done ? 1 : -1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const getColorStyle = (colorId: string) => NOTE_COLORS.find(c => c.id === colorId) || NOTE_COLORS[0];

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <StickyNote className="w-5 h-5 text-amber-500" />
          تێبینیەکان
          {notes.length > 0 && (
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
              {notes.filter(n => !n.done).length}
            </span>
          )}
        </h3>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
        >
          {isAdding ? <X className="w-4 h-4 text-slate-500" /> : <Plus className="w-4 h-4 text-slate-500" />}
        </button>
      </div>

      {/* Add Note Form */}
      {isAdding && (
        <div className="mb-4 animate-slideUp">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="تێبینی بنووسە..."
            className="w-full p-3 border border-slate-200 rounded-xl resize-none text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={2}
            autoFocus
          />
          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-1.5">
              {NOTE_COLORS.map(color => (
                <button
                  key={color.id}
                  onClick={() => setSelectedColor(color.id)}
                  className={cn(
                    'w-6 h-6 rounded-full border-2 transition-transform',
                    color.bg,
                    selectedColor === color.id ? 'scale-110 border-slate-400' : 'border-transparent'
                  )}
                />
              ))}
            </div>
            <button
              onClick={addNote}
              disabled={!newText.trim()}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-indigo-700 transition-colors"
            >
              زیادکردن
            </button>
          </div>
        </div>
      )}

      {/* Notes List */}
      {sortedNotes.length === 0 ? (
        <div className="text-center py-6 text-slate-400">
          <StickyNote className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">هیچ تێبینییەک نییە</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {sortedNotes.map(note => {
            const colorStyle = getColorStyle(note.color);
            return (
              <div
                key={note.id}
                className={cn(
                  'p-3 rounded-xl border transition-all',
                  colorStyle.bg,
                  colorStyle.border,
                  note.done && 'opacity-50'
                )}
              >
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => toggleDone(note.id)}
                    className={cn(
                      'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors',
                      note.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'
                    )}
                  >
                    {note.done && <Check className="w-3 h-3" />}
                  </button>
                  <p className={cn(
                    'flex-1 text-sm leading-relaxed',
                    colorStyle.text,
                    note.done && 'line-through'
                  )}>
                    {note.text}
                  </p>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => togglePin(note.id)}
                      className={cn(
                        'p-1 rounded hover:bg-black/5 transition-colors',
                        note.pinned ? 'text-amber-600' : 'text-slate-400'
                      )}
                    >
                      <Pin className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
