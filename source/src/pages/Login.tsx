import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, User, Lock, Eye, EyeOff, Store } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { translations } from '../constants/translations';
import { Button } from '../components/ui/Button';
import { toast } from '../components/ui/Toast';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [marketName, setMarketName] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const { login, bootstrapOwner, credentials } = useAuthStore();
  const needsBootstrap = credentials.length === 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (needsBootstrap && password !== confirmPassword) {
      setError('وشە نهێنییەکان یەکسان نین');
      return;
    }
    setIsLoading(true);
    try {
      const result = needsBootstrap
        ? await bootstrapOwner({ marketName, fullName, username, password })
        : await login(username, password);
      if (result.success) {
        toast.success(needsBootstrap ? 'هەژماری خاوەن دروست کرا' : translations.success.login);
        navigate('/dashboard');
      } else {
        setError(result.message || translations.errors.UNKNOWN_ERROR);
      }
    } catch {
      setError(translations.errors.UNKNOWN_ERROR);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
      </div>
      <div className="relative w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/30 mb-4">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">ZHIROX</h1>
          <p className="text-indigo-200 mt-1">{needsBootstrap ? 'ڕێکخستنی یەکەم جاری سیستەم' : translations.app_subtitle}</p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-white/10">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white">{needsBootstrap ? 'دروستکردنی هەژماری خاوەن' : translations.auth.welcome_back}</h2>
            <p className="text-slate-300 mt-1 text-sm">{needsBootstrap ? 'هیچ هەژماری demo نییە؛ ئەم زانیارییانە تەنها بۆ یەکەم خاوەنن.' : translations.auth.enter_credentials}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {needsBootstrap && (
              <>
                <Field icon={<Store className="w-5 h-5" />} label="ناوی فرۆشگا" value={marketName} onChange={setMarketName} autoComplete="organization" />
                <Field icon={<User className="w-5 h-5" />} label="ناوی تەواوی خاوەن" value={fullName} onChange={setFullName} autoComplete="name" />
              </>
            )}
            <Field icon={<User className="w-5 h-5" />} label={translations.auth.username} value={username} onChange={setUsername} autoComplete="username" />

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1.5">{translations.auth.password}</label>
              <div className="relative">
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><Lock className="w-5 h-5" /></div>
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} minLength={8} className="w-full pr-10 pl-12 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" required autoComplete={needsBootstrap ? 'new-password' : 'current-password'} />
                <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
              </div>
              {needsBootstrap && <p className="text-xs text-slate-400 mt-1">لانیکەم ٨ پیت/ژمارە؛ وشەی نهێنی لە کۆددا هاردکۆد ناکرێت.</p>}
            </div>

            {needsBootstrap && (
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">دووبارەکردنەوەی وشەی نهێنی</label>
                <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={8} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" required autoComplete="new-password" />
              </div>
            )}

            {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3"><p className="text-red-300 text-sm">{error}</p></div>}

            <Button type="submit" className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600" isLoading={isLoading}>
              {needsBootstrap ? 'دروستکردنی هەژماری خاوەن' : translations.auth.login_button}
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/10 text-xs text-slate-400 leading-6">
            {needsBootstrap ? 'Production Gate: هیچ user، customer، product یان password ـی نموونەیی خۆکارانە دروست ناکرێت.' : 'پاراستن: session دوای نوێکردنەوەی پەڕە بە خۆکار ناچالاک دەبێت و پێویستە دووبارە بچیتە ژوورەوە.'}
          </div>
        </div>
        <p className="text-center text-slate-500 text-xs mt-5">ZHIROX • v19 Production Readiness</p>
      </div>
    </div>
  );
}

function Field({ icon, label, value, onChange, autoComplete }: { icon: React.ReactNode; label: string; value: string; onChange: (value: string) => void; autoComplete?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-200 mb-1.5">{label}</label>
      <div className="relative">
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div>
        <input type="text" value={value} onChange={event => onChange(event.target.value)} className="w-full pr-10 pl-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" required autoComplete={autoComplete} />
      </div>
    </div>
  );
}
