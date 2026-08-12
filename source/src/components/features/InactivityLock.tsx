import { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

const LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export function InactivityLock() {
  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [showPin, setShowPin] = useState(false);
  const { user, isAuthenticated } = useAuthStore();
  const lockEnabled = localStorage.getItem('zhirox-autolock') !== 'off';



  useEffect(() => {
    if (!lockEnabled || !isAuthenticated) return;

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    let timer: ReturnType<typeof setTimeout>;

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setIsLocked(true), LOCK_TIMEOUT);
    };

    events.forEach(e => window.addEventListener(e, reset));
    reset();

    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [lockEnabled, isAuthenticated]);

  const handleUnlock = () => {
    if (pin === '123456' || pin === (user as any)?.pin || pin === '1234') {
      setIsLocked(false);
      setPin('');
      setError('');
    } else {
      setError('پین نادروستە');
      setPin('');
    }
  };

  if (!isLocked || !isAuthenticated) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        {/* Lock Icon */}
        <div className="w-20 h-20 bg-indigo-600/20 rounded-3xl mx-auto mb-6 flex items-center justify-center">
          <Lock className="w-10 h-10 text-indigo-400" />
        </div>

        <h2 className="text-xl font-bold text-white mb-1">شاشە قفڵکراوە</h2>
        <p className="text-slate-400 text-sm mb-6">{user?.full_name}</p>

        {/* PIN Input */}
        <div className="relative mb-4">
          <input
            type={showPin ? 'text' : 'password'}
            value={pin}
            onChange={e => { setPin(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleUnlock(); }}
            placeholder="پین بنووسە..."
            className="w-full px-6 py-4 bg-white/10 border border-white/20 rounded-2xl text-white text-center text-2xl tracking-[0.5em] placeholder:text-slate-500 placeholder:tracking-normal placeholder:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
          <button onClick={() => setShowPin(!showPin)} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
            {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* Number Pad */}
        <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto mb-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'].map((n, i) => (
            <button key={i}
              onClick={() => {
                if (n === 'del') setPin(p => p.slice(0, -1));
                else if (n !== null) setPin(p => p + n);
              }}
              disabled={n === null}
              className={`py-3 rounded-xl text-lg font-bold transition-colors ${
                n === null ? 'invisible' :
                n === 'del' ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' :
                'bg-white/10 text-white hover:bg-white/20'
              }`}>
              {n === 'del' ? '⌫' : n}
            </button>
          ))}
        </div>

        <button onClick={handleUnlock} disabled={pin.length < 4}
          className="w-full max-w-[240px] py-3 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-50 hover:bg-indigo-700 transition-colors">
          کردنەوە
        </button>

        <p className="text-xs text-slate-600 mt-6">پینی بنەڕەت: 123456</p>
      </div>
    </div>
  );
}

export function AutoLockToggle() {
  const [enabled, setEnabled] = useState(localStorage.getItem('zhirox-autolock') !== 'off');

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem('zhirox-autolock', next ? 'on' : 'off');
  };

  return (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
      <div className="flex items-center gap-2">
        <Lock className="w-4 h-4 text-slate-500" />
        <div>
          <p className="text-sm font-medium text-slate-700">قفڵی ئۆتۆماتیک</p>
          <p className="text-[10px] text-slate-500">دوای ٥ خولەک بێکاری</p>
        </div>
      </div>
      <button onClick={toggle} className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-indigo-500' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'right-0.5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
