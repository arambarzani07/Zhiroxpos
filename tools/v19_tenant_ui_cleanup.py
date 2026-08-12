from pathlib import Path
import re

path = Path('source/src/pages/Settings.tsx')
text = path.read_text(encoding='utf-8')
text = text.replace(
    "import { Store, Users, Shield, Receipt, DollarSign, Zap, Save, ChevronLeft, Plus, Edit, Lock, Check } from 'lucide-react';",
    "import { Store, Users, Shield, Receipt, DollarSign, Zap, Save, ChevronLeft } from 'lucide-react';",
    1,
)
text = text.replace("import { Modal } from '../components/ui/Modal';\n", "", 1)
text, role_options = re.subn(
    r"\n  const roleOptions = \[.*?\n  \];\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)
text, role_colors = re.subn(
    r"\n  const roleColors: Record<string, string> = \{.*?\};\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)
if role_options != 1 or role_colors != 1:
    raise SystemExit(f'Expected Settings cleanup blocks missing: roleOptions={role_options}, roleColors={role_colors}')
path.write_text(text, encoding='utf-8')
print('Removed obsolete local user-management imports and variables from Settings.')
