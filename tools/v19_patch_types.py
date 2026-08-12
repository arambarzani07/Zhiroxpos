from pathlib import Path

path = Path('source/src/types/index.ts')
content = path.read_text(encoding='utf-8')
needle = "| 'auth.login' | 'auth.logout' | 'auth.failed_login'"
replacement = "| 'auth.login' | 'auth.logout' | 'auth.failed_login' | 'auth.bootstrap'"
if replacement not in content:
    if needle not in content:
        raise SystemExit('AuditAction auth union pattern not found')
    content = content.replace(needle, replacement, 1)
path.write_text(content, encoding='utf-8')
print('AuditAction updated for secure owner bootstrap')
