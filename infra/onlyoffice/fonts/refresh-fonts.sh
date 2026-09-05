#!/usr/bin/env bash
set -euo pipefail

# Run explicitly inside DocumentServer, after mounting prepared fonts.
# --verify-only is read-only: no font cache rebuild or service changes.
font_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
mode="${1:-apply}"
if [[ "$mode" != apply && "$mode" != --verify-only ]]; then
  echo 'Usage: bash refresh-fonts.sh [--verify-only]' >&2
  exit 2
fi
python3 - "$font_root" <<'PY'
import hashlib
import json
import pathlib
import sys
root = pathlib.Path(sys.argv[1])
manifest = json.loads((root / 'manifest.json').read_text())
for section in ('licenses', 'fonts'):
    for item in manifest[section]:
        base = root / 'licenses' if section == 'licenses' else root
        path = base / item['file']
        if path.parent != base or hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
            raise SystemExit('Missing or changed font/license: ' + str(path))
print('All pinned font and license hashes verified.')
PY
if [[ "$mode" == apply ]]; then
  fc-cache -f
  # true suppresses this upstream script's implicit docservice/converter restart.
  /usr/bin/documentserver-generate-allfonts.sh true
fi
font_index=/var/www/onlyoffice/documentserver/sdkjs/common/AllFonts.js
for family in 'Source Han Serif CN' 'Source Han Sans CN' 'LXGW WenKai' 'Zhuque Fangsong (technical preview)'; do
  if ! fc-list : family | grep -F -- "$family" >/dev/null; then
    echo "Fontconfig did not discover $family" >&2
    exit 1
  fi
  if ! grep -Fq -- "$family" "$font_index"; then
    echo "ONLYOFFICE has not indexed $family; apply font generation first." >&2
    exit 1
  fi
done
for requested in SimSun SimHei FangSong_GB2312 KaiTi; do
  printf '%s -> ' "$requested"
  fc-match --format '%{family}\n' "$requested"
done
echo 'Installed font families and ONLYOFFICE font index verified. No services restarted.'
echo 'Close/reopen the editor and visually check pagination. Fontconfig matches do not prove identical Office rendering.'
