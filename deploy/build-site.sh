#!/usr/bin/env bash
# Builds every chain SPA with its own base path and assembles deploy/site/.
# Override the chain set for fast iteration: CHAINS="ethereum" deploy/build-site.sh
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root

read -r -a chains <<<"${CHAINS:-$(ls apps | sort | tr '\n' ' ')}"

rm -rf deploy/site
mkdir -p deploy/site

for c in "${chains[@]}"; do
  echo ">> building $c"
  ( cd "apps/$c" && bunx vite build --base="/$c/" --outDir dist --emptyOutDir )
  cp -r "apps/$c/dist" "deploy/site/$c"
done

# Generate the landing page (stable order -> deterministic output).
{
  echo '<!doctype html>'
  echo '<html lang="en"><head><meta charset="utf-8">'
  echo '<meta name="viewport" content="width=device-width, initial-scale=1">'
  echo '<title>Minitel — Transaction Decoders</title></head><body>'
  echo '<h1>Minitel transaction decoders</h1><ul>'
  for c in "${chains[@]}"; do
    printf '  <li><a href="/%s/">%s</a></li>\n' "$c" "$c"
  done
  echo '</ul></body></html>'
} > deploy/site/index.html

# Generate the per-chain CSP map from each app's vercel.json (single source of
# truth). The "default" key is the most common policy (landing page / unknown).
python3 - <<'PY' > deploy/site/csp.json
import glob, json, os
from collections import Counter

out = {}
for vj in sorted(glob.glob("apps/*/vercel.json")):
    chain = os.path.basename(os.path.dirname(vj))
    data = json.load(open(vj))
    csp = None
    for block in data.get("headers", []):
        for h in block["headers"]:
            if h["key"] == "Content-Security-Policy":
                csp = h["value"]
    if csp:
        out[chain] = csp

if out:
    out["default"] = Counter(out.values()).most_common(1)[0][0]

print(json.dumps(out, indent=2, sort_keys=True))
PY

echo ">> done: $(ls -d deploy/site/*/ | wc -l | tr -d ' ') chains"
