from pathlib import Path
import runpy

runpy.run_path('tools/v19_wire_offline_frontend.py', run_name='__main__')

path=Path('source/src/services/offlineQueue.ts')
text=path.read_text(encoding='utf-8')
old="lease.block.business_date.replaceAll('-','')"
new="lease.block.business_date.split('-').join('')"
if old not in text:
    raise SystemExit('offline receipt date replaceAll marker not found')
path.write_text(text.replace(old,new,1),encoding='utf-8')
print('Offline receipt formatting made compatible with current TypeScript target.')
