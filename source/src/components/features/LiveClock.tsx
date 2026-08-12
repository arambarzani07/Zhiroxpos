// ==============================================
// ZHIROX - Live Clock & Date
// تایبەتمەندی: کاتژمێر و بەرواری زیندوو
// ==============================================

import { useState, useEffect } from 'react';
import { Clock, Calendar } from 'lucide-react';

const kurdishDays = ['یەکشەممە', 'دووشەممە', 'سێشەممە', 'چوارشەممە', 'پێنجشەممە', 'هەینی', 'شەممە'];
const kurdishMonths = ['کانوونی دووەم', 'شوبات', 'ئازار', 'نیسان', 'ئایار', 'حوزەیران', 'تەممووز', 'ئاب', 'ئەیلوول', 'تشرینی یەکەم', 'تشرینی دووەم', 'کانوونی یەکەم'];

export function LiveClock({ showDate = true }: { showDate?: boolean }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');

  const day = kurdishDays[time.getDay()];
  const month = kurdishMonths[time.getMonth()];
  const date = time.getDate();

  return (
    <div className="flex items-center gap-4">
      {/* Time */}
      <div className="flex items-center gap-2 text-slate-600">
        <Clock className="w-4 h-4" />
        <span className="font-mono text-lg font-semibold" dir="ltr">
          {hours}:{minutes}
          <span className="text-slate-400">:{seconds}</span>
        </span>
      </div>

      {/* Date */}
      {showDate && (
        <div className="hidden sm:flex items-center gap-2 text-slate-500 text-sm">
          <Calendar className="w-4 h-4" />
          <span>{day}، {date} {month}</span>
        </div>
      )}
    </div>
  );
}

// Compact version for mobile
export function LiveClockMini() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');

  return (
    <span className="font-mono text-sm font-medium text-slate-600" dir="ltr">
      {hours}:{minutes}
    </span>
  );
}
