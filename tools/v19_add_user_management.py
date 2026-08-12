from pathlib import Path

server=Path('source/server'); src=Path('source/src')

(server/'db/006_user_management.sql').write_text(r'''BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS security_audit (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_audit_market_created_idx ON security_audit(market_id,created_at DESC);
COMMIT;
''',encoding='utf-8')

app_path=server/'src/app.mjs'; app=app_path.read_text(encoding='utf-8')
helper_marker="async function lockIdempotency(client, marketId, scope, key) {"
idx=app.find(helper_marker)
if idx<0: raise SystemExit('idempotency helper marker missing')
end=app.find("}\n",idx)+2
helper=r'''

const MANAGED_ROLES=new Set(['owner','admin','cashier','stock_staff','accountant']);
async function writeSecurityAudit(client,user,action,targetType,targetId,metadata={}){
  await client.query(`INSERT INTO security_audit (id,market_id,actor_user_id,action,target_type,target_id,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,[createId('sec-audit'),user.market_id,user.id,action,targetType,targetId||null,JSON.stringify(metadata)]);
}
async function activeOwnerCount(client,marketId){const result=await client.query(`SELECT count(*)::int AS count FROM users WHERE market_id=$1 AND role_type='owner' AND status='active'`,[marketId]);return result.rows[0].count;}
'''
app=app[:end]+helper+app[end:]

route_marker="      if (req.method === 'POST' && url.pathname === '/api/v1/devices/register') {"
if route_marker not in app: raise SystemExit('user management route marker missing')
routes=r'''      if (req.method === 'GET' && url.pathname === '/api/v1/users') {
        const user=await authenticate(pool,req); if(!user)return json(res,401,{error:'AUTH_REQUIRED'}); if(user.role_type!=='owner')return json(res,403,{error:'PERMISSION_DENIED'});
        const result=await pool.query(`SELECT id,market_id,branch_id,username,full_name,role_type,status,last_login_at,version,created_at,updated_at FROM users WHERE market_id=$1 ORDER BY created_at,id`,[user.market_id]);
        return json(res,200,{items:result.rows.map(row=>({...row,version:Number(row.version)}))});
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/users/save') {
        const user=await authenticate(pool,req); if(!user)return json(res,401,{error:'AUTH_REQUIRED'}); if(user.role_type!=='owner')return json(res,403,{error:'PERMISSION_DENIED'});
        const body=await readJson(req); const id=body.id?String(body.id):null; const username=normalizeUsername(body.username); const fullName=String(body.full_name||'').trim(); const role=String(body.role_type||''); const status=body.status==='blocked'?'blocked':body.status==='inactive'?'inactive':'active'; const branchId=String(body.branch_id||user.branch_id||''); const version=id?Number(body.version):null;
        if((id&&(!validEntityId(id)||!Number.isSafeInteger(version)||version<1))||username.length<3||username.length>100||!fullName||fullName.length>300||!MANAGED_ROLES.has(role)||!validEntityId(branchId))return json(res,422,{error:'INVALID_USER'});
        if(!id&&!validatePasswordPolicy(String(body.password||'')))return json(res,422,{error:'PASSWORD_POLICY'});
        const result=await withTransaction(pool,async client=>{
          await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([user.market_id,'users.manage'])]);
          const branch=await client.query(`SELECT id FROM branches WHERE id=$1 AND market_id=$2 AND status='active'`,[branchId,user.market_id]); if(!branch.rows[0])return {status:409,body:{error:'BRANCH_UNAVAILABLE'}};
          const duplicate=await client.query(`SELECT id FROM users WHERE market_id=$1 AND lower(username)=$2 AND ($3::text IS NULL OR id<>$3) LIMIT 1`,[user.market_id,username,id]); if(duplicate.rows[0])return {status:409,body:{error:'USERNAME_DUPLICATE'}};
          if(!id){
            const password=await derivePassword(String(body.password)); const newId=createId('user');
            const saved=await client.query(`INSERT INTO users (id,market_id,branch_id,username,full_name,role_type,password_salt,password_hash,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,market_id,branch_id,username,full_name,role_type,status,last_login_at,version,created_at,updated_at`,[newId,user.market_id,branchId,username,fullName,role,password.saltHex,password.hashHex,status]);
            await writeSecurityAudit(client,user,'user.created','user',newId,{username,role_type:role,status,branch_id:branchId}); return {status:201,body:{user:{...saved.rows[0],version:Number(saved.rows[0].version)}}};
          }
          const currentResult=await client.query(`SELECT id,role_type,status,version FROM users WHERE id=$1 AND market_id=$2 FOR UPDATE`,[id,user.market_id]); const current=currentResult.rows[0]; if(!current)return {status:404,body:{error:'USER_NOT_FOUND'}};
          if(id===user.id&&(role!=='owner'||status!=='active'))return {status:409,body:{error:'CANNOT_DEMOTE_OR_BLOCK_SELF'}};
          if(current.role_type==='owner'&&(role!=='owner'||status!=='active')&&(await activeOwnerCount(client,user.market_id))<=1)return {status:409,body:{error:'LAST_OWNER_REQUIRED'}};
          const saved=await client.query(`UPDATE users SET branch_id=$1,username=$2,full_name=$3,role_type=$4,status=$5,version=version+1,updated_at=now() WHERE id=$6 AND market_id=$7 AND version=$8 RETURNING id,market_id,branch_id,username,full_name,role_type,status,last_login_at,version,created_at,updated_at`,[branchId,username,fullName,role,status,id,user.market_id,version]);
          if(!saved.rows[0])return {status:409,body:{error:'VERSION_CONFLICT',current_version:Number(current.version)}};
          if(current.role_type!==role||current.status!==status)await client.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',[id]);
          await writeSecurityAudit(client,user,'user.updated','user',id,{role_type:role,status,branch_id:branchId}); return {status:200,body:{user:{...saved.rows[0],version:Number(saved.rows[0].version)}}};
        }); return json(res,result.status,result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/users/reset-password') {
        const user=await authenticate(pool,req); if(!user)return json(res,401,{error:'AUTH_REQUIRED'}); if(user.role_type!=='owner')return json(res,403,{error:'PERMISSION_DENIED'});
        const body=await readJson(req); const targetId=String(body.user_id||''); const password=String(body.new_password||''); if(!validEntityId(targetId)||!validatePasswordPolicy(password))return json(res,422,{error:'PASSWORD_POLICY'});
        const result=await withTransaction(pool,async client=>{const target=await client.query('SELECT id FROM users WHERE id=$1 AND market_id=$2 FOR UPDATE',[targetId,user.market_id]);if(!target.rows[0])return {status:404,body:{error:'USER_NOT_FOUND'}};const derived=await derivePassword(password);await client.query('UPDATE users SET password_salt=$1,password_hash=$2,version=version+1,updated_at=now() WHERE id=$3',[derived.saltHex,derived.hashHex,targetId]);await client.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',[targetId]);await writeSecurityAudit(client,user,'user.password_reset','user',targetId,{});return {status:200,body:{ok:true}};});return json(res,result.status,result.body);
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/users/revoke-sessions') {
        const user=await authenticate(pool,req); if(!user)return json(res,401,{error:'AUTH_REQUIRED'}); if(user.role_type!=='owner')return json(res,403,{error:'PERMISSION_DENIED'});
        const body=await readJson(req); const targetId=String(body.user_id||''); if(!validEntityId(targetId))return json(res,422,{error:'INVALID_USER'});
        const result=await withTransaction(pool,async client=>{const target=await client.query('SELECT id FROM users WHERE id=$1 AND market_id=$2',[targetId,user.market_id]);if(!target.rows[0])return {status:404,body:{error:'USER_NOT_FOUND'}};const revoked=await client.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1 AND revoked_at IS NULL RETURNING id',[targetId]);await writeSecurityAudit(client,user,'user.sessions_revoked','user',targetId,{sessions:revoked.rowCount||0});return {status:200,body:{ok:true,revoked:revoked.rowCount||0}};});return json(res,result.status,result.body);
      }

''' + route_marker
app=app.replace(route_marker,routes,1)
app_path.write_text(app,encoding='utf-8')

# ---------- Frontend API ----------
api_path=src/'services/serverApi.ts';api=api_path.read_text(encoding='utf-8')
marker="export interface ServerMarket {"
user_type=r'''export interface ManagedServerUser {id:string;market_id:string;branch_id?:string;username:string;full_name:string;role_type:ServerRole;status:'active'|'inactive'|'blocked';last_login_at?:string|null;version:number;created_at:string;updated_at:string;}
'''+marker
if marker not in api: raise SystemExit('server market type marker missing')
api=api.replace(marker,user_type,1)
method_marker="  registerDevice: () =>"
methods=r'''  loadUsers: () => apiFetch<{items:ManagedServerUser[]}>('/api/v1/users'),
  saveUser: (input:Partial<ManagedServerUser>&{username:string;full_name:string;role_type:ServerRole;branch_id:string;password?:string}) => apiFetch<{user:ManagedServerUser}>('/api/v1/users/save',{method:'POST',body:JSON.stringify(input)}),
  resetUserPassword: (userId:string,newPassword:string) => apiFetch<{ok:true}>('/api/v1/users/reset-password',{method:'POST',body:JSON.stringify({user_id:userId,new_password:newPassword})}),
  revokeUserSessions: (userId:string) => apiFetch<{ok:true;revoked:number}>('/api/v1/users/revoke-sessions',{method:'POST',body:JSON.stringify({user_id:userId})}),
'''+method_marker
if method_marker not in api: raise SystemExit('serverApi device marker missing')
api=api.replace(method_marker,methods,1)
api_path.write_text(api,encoding='utf-8')

# ---------- ServerUserManager component ----------
(src/'components/features/ServerUserManager.tsx').write_text(r'''import { useEffect, useState } from 'react';
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
''',encoding='utf-8')

# Wire Settings users tab.
settings_path=src/'pages/Settings.tsx';settings=settings_path.read_text(encoding='utf-8')
settings=settings.replace("import { Database } from 'lucide-react';","import { Database } from 'lucide-react';\nimport { ServerUserManager } from '../components/features/ServerUserManager';",1)
old_case=r'''      case 'users':
        return (
          <Card>
            <CardHeader title={translations.settings.users} subtitle="بەڕێوەبردنی بەکارهێنەر لە سێرڤەری Production" icon={<Users className="w-5 h-5" />} />
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50">
                <p className="font-medium text-indigo-900">هەژماری چالاک</p>
                <p className="text-sm text-indigo-700 mt-1">{currentUser?.full_name || '-'} • {currentUser?.username || '-'}</p>
              </div>
              <p className="text-sm text-slate-600 leading-7">
                لە وەشانی Production هیچ وشەی نهێنی یان لیستی بەکارهێنەر لە localStorage ناپارێزرێت. زیادکردن، گۆڕینی ڕۆڵ و بلۆککردنی بەکارهێنەر تەنها لە API ـی پارێزراوی سێرڤەر جێبەجێ دەکرێت.
              </p>
              <Badge variant="warning">Server-authoritative only</Badge>
            </div>
          </Card>
        );'''
new_case=r'''      case 'users':
        return (
          <Card>
            <CardHeader title={translations.settings.users} subtitle="بەڕێوەبردنی پارێزراوی بەکارهێنەر و session" icon={<Users className="w-5 h-5" />} />
            <ServerUserManager />
          </Card>
        );'''
if old_case not in settings: raise SystemExit('Settings users placeholder block not found')
settings_path.write_text(settings.replace(old_case,new_case,1),encoding='utf-8')

# ---------- tests ----------
test_path=server/'test/server.test.mjs';test=test_path.read_text(encoding='utf-8')
old="""  const offlineLeases = await fs.readFile(new URL('../db/005_offline_leases.sql', import.meta.url), 'utf8');
  await pool.query(migration);"""
new="""  const offlineLeases = await fs.readFile(new URL('../db/005_offline_leases.sql', import.meta.url), 'utf8');
  const userManagement = await fs.readFile(new URL('../db/006_user_management.sql', import.meta.url), 'utf8');
  await pool.query(migration);"""
if old not in test: raise SystemExit('user management migration declaration anchor missing')
test=test.replace(old,new,1)
test=test.replace("  await pool.query(offlineLeases);","  await pool.query(offlineLeases);\n  await pool.query(userManagement);",1)
test=test.replace("TRUNCATE receipt_blocks, offline_leases, devices,", "TRUNCATE security_audit, receipt_blocks, offline_leases, devices,",1)
if "owner can create and block a cashier" not in test:
    test += r'''

test('owner can create and block a cashier while server stores only a password hash', async () => {
  const context=await pool.query('SELECT branch_id FROM users WHERE username=$1',['owner']); const branchId=context.rows[0].branch_id;
  const created=await request('/api/v1/users/save',{method:'POST',body:{branch_id:branchId,username:'cashier19',full_name:'Cashier 19',role_type:'cashier',status:'active',password:'CashierPass19'}}); assert.equal(created.response.status,201); const cashier=created.json.user; assert.equal(cashier.version,1);
  const stored=await pool.query('SELECT password_hash,password_salt FROM users WHERE id=$1',[cashier.id]); assert.notEqual(stored.rows[0].password_hash,'CashierPass19'); assert.ok(stored.rows[0].password_salt);
  const ownerCookie=cookie; cookie=''; const cashierLogin=await request('/api/v1/login',{method:'POST',body:{username:'cashier19',password:'CashierPass19'}}); assert.equal(cashierLogin.response.status,200); const cashierCookie=cookie;
  const forbidden=await request('/api/v1/users'); assert.equal(forbidden.response.status,403);
  cookie=ownerCookie; const blocked=await request('/api/v1/users/save',{method:'POST',body:{id:cashier.id,version:1,branch_id:branchId,username:'cashier19',full_name:'Cashier 19',role_type:'cashier',status:'blocked'}}); assert.equal(blocked.response.status,200); assert.equal(blocked.json.user.version,2);
  cookie=cashierCookie; const staleSession=await request('/api/v1/session'); assert.equal(staleSession.response.status,401); const blockedLogin=await request('/api/v1/login',{method:'POST',body:{username:'cashier19',password:'CashierPass19'}}); assert.equal(blockedLogin.response.status,401); cookie=ownerCookie;
});

test('stale user version is rejected and sole owner cannot demote or block self', async () => {
  const owner=await pool.query("SELECT id,branch_id,username,full_name,version FROM users WHERE username='owner'"); const row=owner.rows[0];
  const stale=await request('/api/v1/users/save',{method:'POST',body:{id:row.id,version:999,branch_id:row.branch_id,username:row.username,full_name:row.full_name,role_type:'owner',status:'active'}}); assert.equal(stale.response.status,409); assert.equal(stale.json.error,'VERSION_CONFLICT');
  const selfBlock=await request('/api/v1/users/save',{method:'POST',body:{id:row.id,version:Number(row.version),branch_id:row.branch_id,username:row.username,full_name:row.full_name,role_type:'owner',status:'blocked'}}); assert.equal(selfBlock.response.status,409); assert.equal(selfBlock.json.error,'CANNOT_DEMOTE_OR_BLOCK_SELF');
});

test('password reset revokes active sessions and requires the new password', async () => {
  const cashier=await pool.query("SELECT id FROM users WHERE username='cashier19'"); const id=cashier.rows[0].id; await pool.query("UPDATE users SET status='active' WHERE id=$1",[id]);
  const ownerCookie=cookie; cookie=''; let login=await request('/api/v1/login',{method:'POST',body:{username:'cashier19',password:'CashierPass19'}}); assert.equal(login.response.status,200); const oldSession=cookie;
  cookie=ownerCookie; const reset=await request('/api/v1/users/reset-password',{method:'POST',body:{user_id:id,new_password:'NewCashierPass20'}}); assert.equal(reset.response.status,200);
  cookie=oldSession; const revoked=await request('/api/v1/session'); assert.equal(revoked.response.status,401);
  cookie=''; const oldPassword=await request('/api/v1/login',{method:'POST',body:{username:'cashier19',password:'CashierPass19'}}); assert.equal(oldPassword.response.status,401); const newPassword=await request('/api/v1/login',{method:'POST',body:{username:'cashier19',password:'NewCashierPass20'}}); assert.equal(newPassword.response.status,200); cookie=ownerCookie;
  const audit=await pool.query("SELECT action FROM security_audit WHERE target_id=$1 ORDER BY created_at",[id]); assert.ok(audit.rows.some(row=>row.action==='user.created')); assert.ok(audit.rows.some(row=>row.action==='user.password_reset'));
});
'''
test_path.write_text(test,encoding='utf-8')

print('Authoritative server user management, session revocation and security audit generated.')
