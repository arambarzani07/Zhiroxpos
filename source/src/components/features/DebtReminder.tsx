import { useState } from 'react';
import { MessageCircle, Phone, Copy, Check, Send } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { toast } from '../ui/Toast';

function fmt(n: number) { return `${n.toLocaleString()} د.ع`; }

export function DebtReminderModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { getCustomersWithDebt } = useDataStore();
  const debtCustomers = getCustomersWithDebt();
  const [copied, setCopied] = useState<string | null>(null);

  const generateMessage = (name: string, debt: number) => {
    return `سڵاو ${name}،\n\nئەمە یادەوەرییەکە لە سوپەرمارکێتی ZHIROX.\n\nقەرزی ئێستات: ${fmt(debt)}\n\nتکایە هەرچی زووتر پارەکە بدەرەوە.\n\nسوپاس 🙏`;
  };

  const handleCopy = async (customerId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(customerId);
      setTimeout(() => setCopied(null), 2000);
      toast.success('پەیام کۆپی کرا');
    } catch { toast.error('کۆپی سەرنەکەوت'); }
  };

  const handleWhatsApp = (phone: string, text: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const fullPhone = cleanPhone.startsWith('0') ? '964' + cleanPhone.slice(1) : cleanPhone;
    window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="یادەوەری قەرز" size="lg">
      <div className="space-y-4">
        <div className="p-3 bg-indigo-50 rounded-xl text-sm text-indigo-700">
          <MessageCircle className="w-4 h-4 inline ml-1" />
          بۆ هەر کڕیارێک دەتوانیت پەیامی یادەوەری بنێریت بە واتساپ یان کۆپی بکەیت.
        </div>

        {debtCustomers.length === 0 ? (
          <div className="text-center py-8 text-slate-400"><p className="text-sm">هیچ کڕیاری قەرزدار نییە</p></div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {debtCustomers.map(customer => {
              const debt = customer.balance?.balance_iqd || 0;
              const message = generateMessage(customer.name, debt);
              const isCopied = copied === customer.id;

              return (
                <div key={customer.id} className="p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-slate-900">{customer.name}</p>
                      {customer.phone && <p className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</p>}
                    </div>
                    <p className="font-bold text-red-600">{fmt(debt)}</p>
                  </div>

                  {/* Message Preview */}
                  <div className="p-3 bg-white rounded-lg text-sm text-slate-700 mb-3 whitespace-pre-line border border-slate-200">
                    {message}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="outline" className="flex-1"
                      onClick={() => handleCopy(customer.id, message)}
                      leftIcon={isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    >
                      {isCopied ? 'کۆپیکرا!' : 'کۆپی'}
                    </Button>
                    {customer.phone && (
                      <Button
                        size="sm" className="flex-1"
                        onClick={() => handleWhatsApp(customer.phone!, message)}
                        leftIcon={<Send className="w-3 h-3" />}
                        style={{ backgroundColor: '#25D366' }}
                      >
                        واتساپ
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
