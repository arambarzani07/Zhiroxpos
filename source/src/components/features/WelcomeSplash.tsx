// ==============================================
// ZHIROX - Welcome Splash Screen
// تایبەتمەندی: شاشەی بەخێرهاتن کاتی سەرەتا
// ==============================================

import { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';

export function WelcomeSplash() {
  const [show, setShow] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer1 = setTimeout(() => setFadeOut(true), 1800);
    const timer2 = setTimeout(() => setShow(false), 2300);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[200] bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="text-center">
        {/* Animated Logo */}
        <div className="relative inline-block mb-6">
          {/* Pulse rings */}
          <div className="absolute inset-0 w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-indigo-500/20 animate-ping" />
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/40">
            <Zap className="w-12 h-12 sm:w-14 sm:h-14 text-white" />
          </div>
        </div>

        {/* Brand Name */}
        <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-2">
          ZHIROX
        </h1>
        <p className="text-indigo-300 text-sm sm:text-base mb-1">
          HyperMarket Autopilot OS
        </p>
        <p className="text-indigo-400/60 text-xs">
          سیستەمی بەڕێوەبردنی سوپەرمارکێت
        </p>

        {/* Loading Bar */}
        <div className="w-48 h-1 bg-slate-800 rounded-full mx-auto mt-8 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
            style={{
              animation: 'loadBar 1.5s ease-out forwards',
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes loadBar {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}
