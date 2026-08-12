from pathlib import Path
import runpy

runpy.run_path('tools/v19_add_offline_lease_core.py', run_name='__main__')
path=Path('source/server/test/server.test.mjs')
text=path.read_text(encoding='utf-8')
old="assert.equal(offline.response.status,201); assert.equal(offline.json.receipt_number,receipt);"
new="assert.equal(offline.response.status,201,`offline commit failed: ${JSON.stringify(offline.json)}`); assert.equal(offline.json.receipt_number,receipt);"
if old not in text: raise SystemExit('offline commit assertion marker missing')
path.write_text(text.replace(old,new,1),encoding='utf-8')
print('Offline diagnostic assertion enabled.')
