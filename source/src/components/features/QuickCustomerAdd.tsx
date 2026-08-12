import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { toast } from '../ui/Toast';

export function QuickCustomerAddModal({ isOpen, onClose, onCreated }: { isOpen: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const { addCustomer, addAuditLog } = useDataStore();
  const { user } = useAuthStore();

  const handleAdd = () => {
    if (!user?.market_id || !user.branch_id) {
      toast.error('هەژماری فرۆشگا/لق دیاری نەکراوە');
      return;
    }
    if (!name.trim()) return;
    const customer = addCustomer({
      market_id: user.market_id, name: name.trim(), phone: phone.trim() || undefined,
      status: 'active', created_by: user.id,
    });
    if (user) {
      addAuditLog({ market_id: user.market_id, user_id: user.id, action: 'customers.create', module: 'customers', table_name: 'customers', record_id: customer.id, new_value: { name: customer.name } as any });
    }
    toast.success(`${customer.name} زیادکرا`);
    onCreated(customer.id);
    setName('');
    setPhone('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="زیادکردنی کڕیاری خێرا" size="sm">
      <div className="space-y-4">
        <div className="p-4 bg-indigo-50 rounded-xl text-center">
          <UserPlus className="w-10 h-10 text-indigo-600 mx-auto mb-2" />
          <p className="text-sm text-slate-600">بە خێرایی کڕیارێکی نوێ زیاد بکە</p>
        </div>
        <Input label="ناو *" value={name} onChange={e => setName(e.target.value)} placeholder="ناوی کڕیار" autoFocus />
        <Input label="ژمارەی مۆبایل" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07501234567" />
        <Button onClick={handleAdd} disabled={!name.trim()} className="w-full" leftIcon={<UserPlus className="w-4 h-4" />}>
          زیادکردن و هەڵبژاردن
        </Button>
      </div>
    </Modal>
  );
}
