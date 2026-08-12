from pathlib import Path
import runpy

runpy.run_path('tools/v19_add_offline_lease_core.py', run_name='__main__')
path=Path('source/server/src/app.mjs')
text=path.read_text(encoding='utf-8')
marker="const safeTokenEqual = (left,right) => { const a=Buffer.from(String(left)); const b=Buffer.from(String(right)); return a.length===b.length && timingSafeEqual(a,b); };"
if marker not in text: raise SystemExit('offline helper marker missing')
text=text.replace(marker,marker+"\nconst sqlDateString = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value ?? '').slice(0,10);",1)
old="String(block.business_date).slice(0,10)!==String(offline.business_date)"
new="sqlDateString(block.business_date)!==String(offline.business_date)"
if old not in text: raise SystemExit('receipt block date comparison marker missing')
path.write_text(text.replace(old,new,1),encoding='utf-8')
print('PostgreSQL DATE normalized before offline receipt-block validation.')
