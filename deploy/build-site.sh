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

echo ">> done: $(ls -d deploy/site/*/ | wc -l | tr -d ' ') chains"
