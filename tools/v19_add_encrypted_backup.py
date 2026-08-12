from pathlib import Path

server=Path('source/server')
(server/'db/007_backup_ops.sql').write_text(r'''BEGIN;
CREATE TABLE IF NOT EXISTS backup_runs (
  id text PRIMARY KEY,
  business_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('running','success','failed')),
  file_name text,
  bytes bigint,
  table_counts jsonb,
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS backup_runs_date_idx ON backup_runs(business_date,started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS backup_runs_success_date_uidx ON backup_runs(business_date) WHERE status='success';
COMMIT;
''',encoding='utf-8')

(server/'src/backup.mjs').write_text(r'''import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';

const MAGIC=Buffer.from('ZHIROX-BACKUP-V1\n','utf8');
const FORMAT_VERSION=1;
const SCHEMA_VERSION=7;
const TABLES=['markets','branches','users','categories','products','customers','customer_balances','receipt_sequences','devices','sales','sale_items','payments','stock_movements','journal_batches','journal_lines','idempotency_keys','security_audit'];
const VOLATILE_TABLES=['sessions','auth_throttle','offline_leases','receipt_blocks'];
const SAFE_NAME=/^[a-z_][a-z0-9_]*$/;

export function backupKeyFromEnv(value=process.env.BACKUP_ENCRYPTION_KEY_B64){
  if(!value)throw new Error('BACKUP_ENCRYPTION_KEY_REQUIRED');
  const key=Buffer.from(value,'base64');if(key.length!==32)throw new Error('BACKUP_ENCRYPTION_KEY_MUST_BE_32_BYTES_BASE64');return key;
}
const quote=name=>{if(!SAFE_NAME.test(name))throw new Error('INVALID_SQL_IDENTIFIER');return `"${name}"`;};
const timestamp=()=>new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');

async function snapshotRows(pool){
  const client=await pool.connect();
  try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables={}; const counts={};
    for(const table of TABLES){const result=await client.query(`SELECT * FROM ${quote(table)}`);tables[table]=result.rows;counts[table]=result.rowCount||0;}
    await client.query('COMMIT');
    return {kind:'zhirox-pos-backup',format_version:FORMAT_VERSION,schema_version:SCHEMA_VERSION,created_at:new Date().toISOString(),tables,counts};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}

export async function createEncryptedBackup(pool,{directory=process.env.BACKUP_DIR||'./backups',key=backupKeyFromEnv(),retention=Number(process.env.BACKUP_RETENTION_FILES||30)}={}){
  const snapshot=await snapshotRows(pool); const plaintext=Buffer.from(JSON.stringify(snapshot)); const compressed=gzipSync(plaintext,{level:9}); const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',key,iv); const encrypted=Buffer.concat([cipher.update(compressed),cipher.final()]); const tag=cipher.getAuthTag(); const digest=createHash('sha256').update(plaintext).digest('hex');
  const header=Buffer.from(JSON.stringify({format_version:FORMAT_VERSION,schema_version:SCHEMA_VERSION,created_at:snapshot.created_at,sha256:digest})+'\n','utf8'); const headerLength=Buffer.alloc(4);headerLength.writeUInt32BE(header.length);const payload=Buffer.concat([MAGIC,headerLength,header,iv,tag,encrypted]);
  await mkdir(directory,{recursive:true}); const fileName=`zhirox-${timestamp()}-${randomBytes(4).toString('hex')}.zbx`; const finalPath=path.join(directory,fileName); const temporary=`${finalPath}.tmp`; await writeFile(temporary,payload,{mode:0o600}); await rename(temporary,finalPath); await enforceRetention(directory,retention); return {filePath:finalPath,fileName,bytes:payload.length,counts:snapshot.counts,sha256:digest};
}

async function enforceRetention(directory,retention){if(!Number.isInteger(retention)||retention<1)return;const entries=(await readdir(directory)).filter(name=>/^zhirox-.*\.zbx$/.test(name));const rows=await Promise.all(entries.map(async name=>({name,stats:await stat(path.join(directory,name))})));rows.sort((a,b)=>b.stats.mtimeMs-a.stats.mtimeMs);for(const row of rows.slice(retention))await unlink(path.join(directory,row.name));}

export async function decryptBackup(filePath,key=backupKeyFromEnv()){
  const payload=await readFile(filePath);if(payload.length<MAGIC.length+4+12+16||!payload.subarray(0,MAGIC.length).equals(MAGIC))throw new Error('BACKUP_FORMAT_INVALID');let offset=MAGIC.length;const headerLength=payload.readUInt32BE(offset);offset+=4;if(headerLength<2||headerLength>64*1024||offset+headerLength+28>payload.length)throw new Error('BACKUP_HEADER_INVALID');const header=JSON.parse(payload.subarray(offset,offset+headerLength).toString('utf8'));offset+=headerLength;const iv=payload.subarray(offset,offset+12);offset+=12;const tag=payload.subarray(offset,offset+16);offset+=16;const encrypted=payload.subarray(offset);const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);let compressed;try{compressed=Buffer.concat([decipher.update(encrypted),decipher.final()]);}catch{throw new Error('BACKUP_AUTHENTICATION_FAILED');}let plaintext;try{plaintext=gunzipSync(compressed);}catch{throw new Error('BACKUP_COMPRESSION_INVALID');}const digest=createHash('sha256').update(plaintext).digest('hex');if(digest!==header.sha256)throw new Error('BACKUP_DIGEST_MISMATCH');const snapshot=JSON.parse(plaintext.toString('utf8'));if(snapshot.kind!=='zhirox-pos-backup'||snapshot.format_version!==FORMAT_VERSION||snapshot.schema_version!==SCHEMA_VERSION)throw new Error('BACKUP_SCHEMA_UNSUPPORTED');for(const table of Object.keys(snapshot.tables||{}))if(!TABLES.includes(table))throw new Error('BACKUP_TABLE_UNEXPECTED');for(const table of TABLES)if(!Array.isArray(snapshot.tables?.[table]))throw new Error(`BACKUP_TABLE_MISSING:${table}`);return {header,snapshot};
}

export async function restoreEncryptedBackup(pool,filePath,{key=backupKeyFromEnv()}={}){
  const {snapshot}=await decryptBackup(filePath,key);const client=await pool.connect();
  try{
    await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtextextended('zhirox-restore-v1',0))");
    const truncate=[...VOLATILE_TABLES,...[...TABLES].reverse()];await client.query(`TRUNCATE ${truncate.map(quote).join(', ')} CASCADE`);
    for(const table of TABLES){for(const row of snapshot.tables[table]){const columns=Object.keys(row);if(columns.length===0)continue;for(const column of columns)quote(column);const placeholders=columns.map((_,i)=>`$${i+1}`).join(',');const values=columns.map(column=>row[column]);await client.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${placeholders})`,values);}}
    await client.query('COMMIT');return {restored:true,counts:snapshot.counts,created_at:snapshot.created_at};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}

export const backupTables=()=>[...TABLES];
''',encoding='utf-8')

(server/'src/backupScheduler.mjs').write_text(r'''import { createEncryptedBackup } from './backup.mjs';

const businessParts=(timeZone)=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());return Object.fromEntries(parts.map(p=>[p.type,p.value]));};
export async function runScheduledBackup(pool,{timeZone=process.env.MARKET_TIME_ZONE||'Asia/Baghdad',hour=Number(process.env.BACKUP_HOUR_LOCAL||2)}={}){
  const parts=businessParts(timeZone);if(Number(parts.hour)<hour)return {skipped:'BEFORE_BACKUP_HOUR'};const date=`${parts.year}-${parts.month}-${parts.day}`;const client=await pool.connect();let runId;
  try{
    await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`backup:${date}`]);const success=await client.query("SELECT id FROM backup_runs WHERE business_date=$1::date AND status='success' LIMIT 1",[date]);if(success.rows[0]){await client.query('COMMIT');return {skipped:'ALREADY_COMPLETED'};}const recent=await client.query("SELECT id FROM backup_runs WHERE business_date=$1::date AND status='running' AND started_at>now()-interval '2 hours' LIMIT 1",[date]);if(recent.rows[0]){await client.query('COMMIT');return {skipped:'ALREADY_RUNNING'};}runId=`backup-${date}-${Date.now()}`;await client.query("INSERT INTO backup_runs (id,business_date,status) VALUES ($1,$2::date,'running')",[runId,date]);await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  try{const result=await createEncryptedBackup(pool);await pool.query("UPDATE backup_runs SET status='success',file_name=$1,bytes=$2,table_counts=$3::jsonb,finished_at=now() WHERE id=$4",[result.fileName,result.bytes,JSON.stringify(result.counts),runId]);return {ok:true,...result};}catch(error){await pool.query("UPDATE backup_runs SET status='failed',error_code=$1,finished_at=now() WHERE id=$2",[String(error?.message||'BACKUP_FAILED').slice(0,200),runId]).catch(()=>{});throw error;}
}

export function startBackupScheduler(pool){if(process.env.AUTO_BACKUP!=='1')return ()=>{};let stopped=false;const tick=async()=>{if(stopped)return;try{await runScheduledBackup(pool);}catch(error){console.error('automatic backup failed',error);}};void tick();const timer=setInterval(()=>void tick(),30*60*1000);timer.unref?.();return()=>{stopped=true;clearInterval(timer);};}
''',encoding='utf-8')

(server/'scripts').mkdir(exist_ok=True)
(server/'scripts/backup.mjs').write_text(r'''import pg from 'pg';import { createEncryptedBackup } from '../src/backup.mjs';const {Pool}=pg;if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});try{const result=await createEncryptedBackup(pool);console.log(JSON.stringify(result));}finally{await pool.end();}
''',encoding='utf-8')
(server/'scripts/restore.mjs').write_text(r'''import pg from 'pg';import { restoreEncryptedBackup } from '../src/backup.mjs';const {Pool}=pg;if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');const file=process.argv[2];if(!file)throw new Error('Usage: npm run restore -- /path/to/backup.zbx');if(process.env.ALLOW_RESTORE!=='YES')throw new Error('Set ALLOW_RESTORE=YES explicitly before restore');const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});try{const result=await restoreEncryptedBackup(pool,file);console.log(JSON.stringify(result));}finally{await pool.end();}
''',encoding='utf-8')

# package scripts
pkg_path=server/'package.json';import json
pkg=json.loads(pkg_path.read_text(encoding='utf-8'));pkg.setdefault('scripts',{})['backup']='node scripts/backup.mjs';pkg['scripts']['restore']='node scripts/restore.mjs';pkg_path.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# start scheduler in server index
index_path=server/'src/index.mjs';index=index_path.read_text(encoding='utf-8')
index=index.replace("import { createHandler } from './app.mjs';","import { createHandler } from './app.mjs';\nimport { startBackupScheduler } from './backupScheduler.mjs';",1)
index=index.replace("const server = http.createServer(handler);","const server = http.createServer(handler);\nconst stopBackupScheduler = startBackupScheduler(pool);",1)
index=index.replace("  server.close(async () => {\n    await pool.end();","  stopBackupScheduler();\n  server.close(async () => {\n    await pool.end();",1)
index_path.write_text(index,encoding='utf-8')

# env
path=server/'.env.example';env=path.read_text(encoding='utf-8');extra="""
AUTO_BACKUP=1
BACKUP_HOUR_LOCAL=2
BACKUP_DIR=/var/lib/zhirox/backups
BACKUP_RETENTION_FILES=30
BACKUP_ENCRYPTION_KEY_B64=replace-with-base64-of-32-random-bytes
"""
if 'BACKUP_ENCRYPTION_KEY_B64=' not in env: env+=extra
path.write_text(env,encoding='utf-8')

# backup restore drill
(server/'test/backup-drill.mjs').write_text(r'''import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import pg from 'pg';import { createEncryptedBackup, decryptBackup, restoreEncryptedBackup } from '../src/backup.mjs';
const {Pool}=pg;if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');const key=Buffer.alloc(32,7);const pool=new Pool({connectionString:process.env.DATABASE_URL,max:4});const migrations=['001_core.sql','002_financial.sql','003_catalog.sql','004_daily_authority.sql','005_offline_leases.sql','006_user_management.sql','007_backup_ops.sql'];
for(const file of migrations)await pool.query(await fs.readFile(new URL(`../db/${file}`,import.meta.url),'utf8'));
await pool.query('TRUNCATE backup_runs,security_audit,receipt_blocks,offline_leases,devices,journal_lines,journal_batches,stock_movements,payments,sale_items,sales,customer_balances,customers,products,categories,idempotency_keys,receipt_sequences,auth_throttle,sessions,users,branches,markets CASCADE');
const now=new Date().toISOString();await pool.query("INSERT INTO markets(id,name,currency,status,created_at,updated_at) VALUES('m-backup','Backup Market','IQD','active',$1,$1)",[now]);await pool.query("INSERT INTO branches(id,market_id,name,receipt_prefix,is_main,status,created_at,updated_at) VALUES('b-backup','m-backup','Main','BKP',true,'active',$1,$1)",[now]);await pool.query("INSERT INTO users(id,market_id,branch_id,username,full_name,role_type,password_salt,password_hash,status,created_at,updated_at) VALUES('u-backup','m-backup','b-backup','ownerbackup','Owner Backup','owner','00112233445566778899aabbccddeeff','deadbeef','active',$1,$1)",[now]);await pool.query("INSERT INTO products(id,market_id,branch_id,barcode,name,cost_price_iqd,sale_price_iqd,stock_quantity,created_by) VALUES('p-backup','m-backup','b-backup','BKP-001','Backup Product',500,1000,25,'u-backup')");await pool.query("INSERT INTO customers(id,market_id,code,name,debt_limit_iqd,created_by) VALUES('c-backup','m-backup','CBKP','Backup Customer',10000,'u-backup')");await pool.query("INSERT INTO customer_balances(market_id,customer_id,balance_iqd) VALUES('m-backup','c-backup',2500)");await pool.query("INSERT INTO receipt_sequences(market_id,branch_id,business_date,last_value) VALUES('m-backup','b-backup','2026-08-12',812)");await pool.query("INSERT INTO devices(id,market_id,branch_id,label,registered_by) VALUES('device-backup-0001','m-backup','b-backup','Backup POS','u-backup')");await pool.query("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES('session-backup','u-backup','token-hash-backup',now()+interval '1 day')");
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'zhirox-backup-'));try{const backup=await createEncryptedBackup(pool,{directory:dir,key,retention:5});assert.ok(backup.bytes>100);const decrypted=await decryptBackup(backup.filePath,key);assert.equal(decrypted.snapshot.tables.products[0].barcode,'BKP-001');assert.equal(decrypted.snapshot.tables.receipt_sequences[0].last_value,'812');await pool.query("UPDATE products SET stock_quantity=1 WHERE id='p-backup'");await pool.query("UPDATE customer_balances SET balance_iqd=9999 WHERE customer_id='c-backup'");await pool.query("UPDATE receipt_sequences SET last_value=9999 WHERE market_id='m-backup'");const restored=await restoreEncryptedBackup(pool,backup.filePath,{key});assert.equal(restored.restored,true);const product=await pool.query("SELECT stock_quantity FROM products WHERE id='p-backup'");assert.equal(Number(product.rows[0].stock_quantity),25);const balance=await pool.query("SELECT balance_iqd FROM customer_balances WHERE customer_id='c-backup'");assert.equal(Number(balance.rows[0].balance_iqd),2500);const seq=await pool.query("SELECT last_value FROM receipt_sequences WHERE market_id='m-backup'");assert.equal(Number(seq.rows[0].last_value),812);const sessions=await pool.query('SELECT count(*)::int AS count FROM sessions');assert.equal(sessions.rows[0].count,0);
const tampered=path.join(dir,'tampered.zbx');const bytes=Buffer.from(await fs.readFile(backup.filePath));bytes[bytes.length-1]^=0xff;await fs.writeFile(tampered,bytes);await assert.rejects(()=>restoreEncryptedBackup(pool,tampered,{key}),/BACKUP_AUTHENTICATION_FAILED|BACKUP_COMPRESSION_INVALID/);const still=await pool.query("SELECT stock_quantity FROM products WHERE id='p-backup'");assert.equal(Number(still.rows[0].stock_quantity),25);console.log('Encrypted backup restore drill passed.');}finally{await pool.end();await fs.rm(dir,{recursive:true,force:true});}
''',encoding='utf-8')

print('Encrypted backup, automatic scheduler, retention and destructive restore drill generated.')
