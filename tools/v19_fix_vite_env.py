from pathlib import Path

path = Path('source/src/services/serverApi.ts')
text = path.read_text(encoding='utf-8')
old = "const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\\/$/, '');"
new = "const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;\nconst API_BASE = String(viteEnv?.VITE_API_BASE_URL || '').replace(/\\/$/, '');"
if old not in text:
    raise SystemExit('Vite API base pattern not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Vite API base access made type-safe.')
