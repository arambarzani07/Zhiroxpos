import { useEffect, useState } from 'react';
import { KeyRound, LogOut, Plus, RefreshCw, Save } from 'lucide-react';
import { ApiError, serverApi, type ManagedServerUser, type ServerRole } from '../../services/serverApi';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { toast } from '../ui/Toast';

const roles:Array<{value:ServerRole;label:string}>=[{value:'owner',label:'خاوەن'},{value:'admin',label:'بەڕێوەبەر'},{value:'cashier',label:'کاشێر'},{value:'stock_staff',label:'بەرپرسی کۆگا'},{value:'accountant',label:'ژمێریار'}];
const empty={username:'',full_name:'',role_type:'cashier' as ServerRole,status:'active' as const,password:''};
const errorText=(error:unknown)=>{const code=error instanceof ApiError?error.code:'UNKNOWN_ERROR';const map:Record<string,string>={USERNAME_DUPLICATE:'ناوی بەکارهێنەر دووبارەیە',PASSWORD_POLICY:'وشەی نهێنی لانیکەم ١٠ پیت بێت و پیت و ژمارەی تێدا بێت',VERSION_CONFLICT:'هەژمارەکە لە شوێنێکی تر گۆڕاوە؛ نوێی بکەرەوە',CANNOT_DEMOTE_OR_BLOCK_SELF:'ناتوانیت هەژماری خۆت لە owner/active بگۆڕیت',LAST_OWNER_REQUIRED:'لانیکەم یەک owner ـی چالاک پێویستە',PERMISSION_DENIED:'تەنها owner دەتوانێت بەکارهێنەر بەڕێوەببات'};return map[code]||code;};

export function ServerUserManager(){
 const current=useAuthStore(s=>s.user);const branch=useAuthStore(s=>s.branch);const [users,setUsers]=useState<ManagedServerUser[]>([]);const [editing,setEditing]=useState<ManagedServerUser|null>(null);const [form,setForm]=useState(empty);const [busy,setBusy]=useState(false);
 const load=async()=>{setBusy(true);try{const result=await serverApi.loadUsers();setUsers(result.items);}catch(e){toast.error(errorText(e));}finally{setBusy(false);}};
 useEffect(()=>{void load();},[]);
 const edit=(user:ManagedServerUser)=>{setEditing(user);setForm({username:user.username,full_name:user.full_name,role_type:user.role_type,status:user.status as 'active',password:''});};
 const resetForm=()=>{setEditing(null);setForm(empty);};
 const save=async()=>{if(!branch){toast.error('لق دیاری نەکراوە');return;}setBusy(true);try{await serverApi.saveUser({id:editing?.id,version:editing?.version,branch_id:editing?.branch_id||branch.id,username:form.username,full_name:form.full_name,role_type:form.role_type,status:form.status,password:editing?undefined:form.password});toast.success(editing?'هەژمار نوێکرایەوە':'بەکارهێنەر دروست کرا');resetForm();await load();}catch(e){toast.error(errorText(e));}finally{setBusy(false);}};
 const resetPassword=async(user:ManagedServerUser)=>{const password=window.prompt(`وشەی نهێنی نوێ بۆ ${user.full_name} (لانیکەم ١٠ پیت + ژمارە):`);if(!password)return;try{await serverApi.resetUserPassword(user.id,password);toast.success('وشەی نهێنی گۆڕدرا و session ـە کۆنەکان داخرا');}catch(e){toast.error(errorText(e));}};
 const revoke=async(user:ManagedServerUser)=>{if(!window.confirm(`هەموو session ـەکانی ${user.full_name} دابخرێن؟`))return;try{const result=await serverApi.revokeUserSessions(user.id);toast.success(`${result.revoked} session داخرا`);}catch(e){toast.error(errorText(e));}};
 if(current?.role?.type!=='owner')return <div className="p-4 rounded-xl bg-amber-50 text-amber-800 text-sm">تەنها خاوەن دەتوانێت بەکارهێنەر بەڕێوەببات.</div>;
 return <div className="space-y-5">
   <div className="flex items-center justify-between gap-2"><div><p className="font-bold text-slate-900">بەکارهێنەرانی سێرڤەر</p><p className="text-xs text-slate-500">وشەی نهێنی لە browser ناپارێزرێت؛ هەر گۆڕینی ڕۆڵ/دۆخ session ـە کۆنەکان دەخاتەوە.</p></div><Button variant="secondary" onClick={()=>void load()} leftIcon={<RefreshCw className="w-4 h-4"/>}>نوێکردنەوە</Button></div>
   <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50">
     <input className="px-3 py-2.5 rounded-xl border" placeholder="ناوی تەواو" value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/>
     <input className="px-3 py-2.5 rounded-xl border" placeholder="ناوی بەکارهێنەر" value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/>
     <select className="px-3 py-2.5 rounded-xl border" value={form.role_type} onChange={e=>setForm({...form,role_type:e.target.value as ServerRole})}>{roles.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select>
     <select className="px-3 py-2.5 rounded-xl border" value={form.status} onChange={e=>setForm({...form,status:e.target.value as any})}><option value="active">چالاک</option><option value="inactive">ناچالاک</option><option value="blocked">بلۆک</option></select>
     {!editing&&<input type="password" className="px-3 py-2.5 rounded-xl border md:col-span-2" placeholder="وشەی نهێنی سەرەتایی" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/>} 
     <div className="md:col-span-2 flex gap-2"><Button onClick={()=>void save()} isLoading={busy} leftIcon={editing?<Save className="w-4 h-4"/>:<Plus className="w-4 h-4"/>}>{editing?'پاشەکەوتکردن':'زیادکردنی بەکارهێنەر'}</Button>{editing&&<Button variant="secondary" onClick={resetForm}>پاشگەزبوونەوە</Button>}</div>
   </div>
   <div className="space-y-2">{users.map(user=><div key={user.id} className="p-3 rounded-xl border border-slate-200 flex flex-wrap items-center gap-3 justify-between"><div><p className="font-semibold">{user.full_name} {user.id===current.id&&<Badge variant="info" size="sm">تۆ</Badge>}</p><p className="text-xs text-slate-500">{user.username} • {roles.find(r=>r.value===user.role_type)?.label||user.role_type} • v{user.version}</p></div><div className="flex gap-2 flex-wrap"><Badge variant={user.status==='active'?'success':'warning'}>{user.status}</Badge><button className="text-xs px-2 py-1.5 rounded-lg bg-slate-100" onClick={()=>edit(user)}>دەستکاری</button><button className="text-xs px-2 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 flex items-center gap-1" onClick={()=>void resetPassword(user)}><KeyRound className="w-3 h-3"/>Password</button><button className="text-xs px-2 py-1.5 rounded-lg bg-red-50 text-red-700 flex items-center gap-1" onClick={()=>void revoke(user)}><LogOut className="w-3 h-3"/>Session</button></div></div>)}</div>
 </div>;
}
