from pathlib import Path
import json

path = Path('source/package.json')
package = json.loads(path.read_text(encoding='utf-8'))
package['dependencies']['react-router-dom'] = '^7.18.2'
package['devDependencies']['vite'] = '^7.3.6'
path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Pinned react-router-dom >=7.18.2 and vite >=7.3.6')
