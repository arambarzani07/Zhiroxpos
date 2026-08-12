import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

export function useStockAlertSound() {
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('zhirox-sound') !== 'off');

  const playAlert = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.value = 0.1;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  };

  const playSaleSound = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1200;
      osc.type = 'sine';
      gain.gain.value = 0.08;
      osc.start();
      setTimeout(() => { osc.frequency.value = 1500; }, 100);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
  };

  const toggle = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('zhirox-sound', next ? 'on' : 'off');
  };

  return { soundEnabled, toggle, playAlert, playSaleSound };
}

export function SoundToggle() {
  const { soundEnabled, toggle } = useStockAlertSound();
  return (
    <button onClick={toggle} className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors" title={soundEnabled ? 'دەنگ کراوەیە' : 'دەنگ داخراوە'}>
      {soundEnabled ? <Volume2 className="w-5 h-5 text-slate-600" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
    </button>
  );
}
