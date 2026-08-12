from pathlib import Path
import runpy

runpy.run_path('tools/v19_fix_financial_idempotency.py', run_name='__main__')

path = Path('source/server/src/app.mjs')
text = path.read_text(encoding='utf-8')
old = "[`\\${user.market_id}\\\\0sale.commit\\\\0\\${idempotencyKey}`]"
# The generated JS contains an escaped template literal source. Match directly if the Python-escaped form differs.
candidates = [
    "[`${user.market_id}\\0sale.commit\\0${idempotencyKey}`]",
    "[`${user.market_id}\\\\0sale.commit\\\\0${idempotencyKey}`]",
]
replacement = "[JSON.stringify([user.market_id, 'sale.commit', idempotencyKey])]"
changed = False
for candidate in candidates:
    if candidate in text:
        text = text.replace(candidate, replacement, 1)
        changed = True
        break
if not changed:
    raise SystemExit('Advisory lock key pattern not found')
path.write_text(text, encoding='utf-8')
print('Advisory lock key now uses a UTF-8-safe JSON tuple.')
