import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
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
