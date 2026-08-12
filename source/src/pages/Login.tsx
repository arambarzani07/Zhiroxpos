import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, User, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { translations } from '../constants/translations';
import { Button } from '../components/ui/Button';
import { toast } from '../components/ui/Toast';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const { login } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(username, password);

      if (result.success) {
        toast.success(translations.success.login);
        navigate('/dashboard');
      } else {
        const errorMessage = result.error_code
          ? translations.errors[result.error_code as keyof typeof translations.errors]
          : translations.errors.UNKNOWN_ERROR;
        setError(errorMessage);
      }
    } catch (err) {
      setError(translations.errors.UNKNOWN_ERROR);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-60 sm:w-80 h-60 sm:h-80 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-60 sm:w-80 h-60 sm:h-80 bg-purple-500/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/30 mb-4">
            <Zap className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">ZHIROX</h1>
          <p className="text-indigo-200 mt-1 text-sm sm:text-base">{translations.app_subtitle}</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl border border-white/10">
          <div className="text-center mb-5 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-semibold text-white">{translations.auth.welcome_back}</h2>
            <p className="text-slate-300 mt-1 text-sm">{translations.auth.enter_credentials}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1.5">
                {translations.auth.username}
              </label>
              <div className="relative">
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pr-10 pl-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="owner"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1.5">
                {translations.auth.password}
              </label>
              <div className="relative">
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pr-10 pl-12 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="123456"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
              isLoading={isLoading}
            >
              {translations.auth.login_button}
            </Button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-5 sm:mt-6 pt-5 sm:pt-6 border-t border-white/10">
            <p className="text-slate-400 text-xs text-center mb-3">ناوی بەکارهێنەر و وشەی نهێنی بۆ تاقیکردنەوە:</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button
                type="button"
                onClick={() => { setUsername('owner'); setPassword('123456'); }}
                className="bg-white/5 hover:bg-white/10 rounded-lg p-2 text-center transition-colors"
              >
                <p className="text-indigo-300 font-medium">خاوەن</p>
                <p className="text-slate-400 text-[10px]">owner</p>
              </button>
              <button
                type="button"
                onClick={() => { setUsername('admin'); setPassword('123456'); }}
                className="bg-white/5 hover:bg-white/10 rounded-lg p-2 text-center transition-colors"
              >
                <p className="text-emerald-300 font-medium">بەڕێوەبەر</p>
                <p className="text-slate-400 text-[10px]">admin</p>
              </button>
              <button
                type="button"
                onClick={() => { setUsername('cashier'); setPassword('123456'); }}
                className="bg-white/5 hover:bg-white/10 rounded-lg p-2 text-center transition-colors"
              >
                <p className="text-amber-300 font-medium">کاشێر</p>
                <p className="text-slate-400 text-[10px]">cashier</p>
              </button>
            </div>
          </div>
        </div>

        {/* Version */}
        <p className="text-center text-slate-500 text-xs mt-4 sm:mt-6">
          ZHIROX HyperMarket Autopilot OS • {translations.version}
        </p>
      </div>
    </div>
  );
}
