# Caution Enclave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve all 21 minitel chain decoder SPAs from a single Caution/Nitro enclave via a reproducible Go static server, with the prebuilt dists vendored into the repo.

**Architecture:** A tiny Go `net/http` server `go:embed`s a `deploy/site/` tree (one directory per chain plus a landing page) and serves it on `:8080` with the project's existing CSP/security headers; Caution's Caddy fronts it with TLS. The site tree is produced by a build script (run in CI) and committed, so the StageX build only has to compile a deterministic Go binary — making `caution verify` reproduce PCRs trivially.

**Tech Stack:** Go (stdlib only), `go:embed`, StageX `pallet-go`, Bun + Vite (existing app builds), Caution Procfile, GitHub Actions.

**Spec:** `docs/caution-enclave-design.md`

**Branch:** `feat/caution-enclave` (already created).

---

## File structure

```
deploy/
  go.mod              # module github.com/kilnfi/minitel/deploy, stdlib only
  handler.go          # NewHandler(fs.FS): routing, SPA fallback, security headers
  handler_test.go     # table tests against fstest.MapFS (no real dist needed)
  main.go             # //go:embed all:site + ListenAndServe(":8080")
  main_test.go        # asserts embedded site has index.html
  build-site.sh       # builds 21 apps with per-chain base, assembles deploy/site/
  Containerfile       # StageX pallet-go reproducible build -> FROM scratch
  site/               # VENDORED: index.html + <chain>/ dirs (committed)
Procfile              # repo root: run/ports/http_port/domain
.dockerignore         # repo root: keep build context lean + deterministic
.github/workflows/build-site.yml   # rebuild + commit deploy/site on app changes
```

Each file has one responsibility: `handler.go` is pure routing/serving logic (testable with a synthetic FS), `main.go` is only wiring + the embed directive, `build-site.sh` is only artifact assembly. Tests target `handler.go` through an injected `fs.FS` so they never depend on a real build.

---

### Task 1: Go static server handler (routing + headers + SPA fallback)

**Files:**
- Create: `deploy/go.mod`
- Create: `deploy/handler.go`
- Test: `deploy/handler_test.go`

- [ ] **Step 1: Create the Go module**

Create `deploy/go.mod`:

```
module github.com/kilnfi/minitel/deploy

go 1.22
```

(`go 1.22` is intentionally conservative so it is ≤ the Go version inside `pallet-go`. The code uses only long-stable stdlib APIs. Verify pallet-go's Go is ≥ 1.22 in Task 4 when pinning the digest.)

- [ ] **Step 2: Write the failing test**

Create `deploy/handler_test.go`:

```go
package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func testFS() fstest.MapFS {
	return fstest.MapFS{
		"index.html":             {Data: []byte("<html>LANDING</html>")},
		"ethereum/index.html":    {Data: []byte("<html>ETH</html>")},
		"ethereum/assets/app.js": {Data: []byte("console.log(1)")},
		"solana/index.html":      {Data: []byte("<html>SOL</html>")},
	}
}

func do(t *testing.T, h http.Handler, target string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, target, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestServesLandingAtRoot(t *testing.T) {
	rec := do(t, NewHandler(testFS()), "/")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "LANDING") {
		t.Fatalf("got %d body=%q", rec.Code, rec.Body.String())
	}
}

func TestServesChainIndex(t *testing.T) {
	rec := do(t, NewHandler(testFS()), "/ethereum/")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "ETH") {
		t.Fatalf("got %d body=%q", rec.Code, rec.Body.String())
	}
}

func TestServesAssetWithContentType(t *testing.T) {
	rec := do(t, NewHandler(testFS()), "/ethereum/assets/app.js")
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "javascript") {
		t.Fatalf("content-type = %q, want javascript", ct)
	}
}

func TestSPAFallbackToChainIndex(t *testing.T) {
	rec := do(t, NewHandler(testFS()), "/ethereum/some/client/route")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "ETH") {
		t.Fatalf("got %d body=%q", rec.Code, rec.Body.String())
	}
}

func TestUnknownTopLevel404(t *testing.T) {
	rec := do(t, NewHandler(testFS()), "/nope/whatever")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("got %d, want 404", rec.Code)
	}
}

func TestSecurityHeadersPresent(t *testing.T) {
	rec := do(t, NewHandler(testFS()), "/ethereum/")
	csp := rec.Header().Get("Content-Security-Policy")
	if !strings.Contains(csp, "default-src 'self'") || !strings.Contains(csp, "frame-ancestors 'none'") {
		t.Fatalf("CSP = %q", csp)
	}
	for _, h := range []string{"X-Content-Type-Options", "Referrer-Policy", "Strict-Transport-Security", "Permissions-Policy"} {
		if rec.Header().Get(h) == "" {
			t.Fatalf("missing header %s", h)
		}
	}
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd deploy && go test ./...`
Expected: FAIL — `undefined: NewHandler` (compile error).

- [ ] **Step 4: Implement the handler**

Create `deploy/handler.go`:

```go
package main

import (
	"bytes"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
	"time"
)

// securityHeaders mirrors apps/*/vercel.json so the enclave serves the exact
// policy the app ships with today.
var securityHeaders = map[string]string{
	"Content-Security-Policy":   "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
	"X-Content-Type-Options":    "nosniff",
	"Referrer-Policy":           "strict-origin-when-cross-origin",
	"Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
	"Permissions-Policy":        "camera=(), microphone=(), geolocation=(), payment=()",
}

// NewHandler serves the embedded multi-app static tree. Each chain lives in its
// own top-level directory (e.g. "ethereum/"). A miss under "<chain>/..." falls
// back to "<chain>/index.html" so client-side routing works; "/" serves the
// landing page at "index.html".
func NewHandler(siteFS fs.FS) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for k, v := range securityHeaders {
			w.Header().Set(k, v)
		}

		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if name == "" {
			name = "index.html"
		}

		// Exact file hit.
		if data, ok := readFile(siteFS, name); ok {
			serveBytes(w, r, name, data)
			return
		}
		// Directory request -> its index.html.
		if data, ok := readFile(siteFS, name+"/index.html"); ok {
			serveBytes(w, r, name+"/index.html", data)
			return
		}
		// SPA fallback: first path segment is a chain directory.
		if seg, _, _ := strings.Cut(name, "/"); seg != "" {
			if data, ok := readFile(siteFS, seg+"/index.html"); ok {
				serveBytes(w, r, seg+"/index.html", data)
				return
			}
		}
		http.NotFound(w, r)
	})
}

func readFile(siteFS fs.FS, name string) ([]byte, bool) {
	info, err := fs.Stat(siteFS, name)
	if err != nil || info.IsDir() {
		return nil, false
	}
	data, err := fs.ReadFile(siteFS, name)
	if err != nil {
		return nil, false
	}
	return data, true
}

func serveBytes(w http.ResponseWriter, r *http.Request, name string, data []byte) {
	ctype := mime.TypeByExtension(path.Ext(name))
	if ctype == "" {
		ctype = http.DetectContentType(data)
	}
	w.Header().Set("Content-Type", ctype)
	// Zero modtime keeps responses deterministic (no Last-Modified).
	http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(data))
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd deploy && go test ./...`
Expected: PASS (all 6 tests ok).

- [ ] **Step 6: Commit**

```bash
git add deploy/go.mod deploy/handler.go deploy/handler_test.go
git commit -m "feat(enclave): add static server handler with SPA fallback + CSP headers"
```

---

### Task 2: Embed the site tree and serve on :8080

**Files:**
- Create: `deploy/main.go`
- Create: `deploy/site/index.html` (placeholder landing; real one generated in Task 3)
- Test: `deploy/main_test.go`

- [ ] **Step 1: Create the placeholder site so `go:embed` compiles**

Create `deploy/site/index.html`:

```html
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Minitel</title></head>
  <body><h1>Minitel</h1><p>Run deploy/build-site.sh to populate chains.</p></body>
</html>
```

- [ ] **Step 2: Write the failing test**

Create `deploy/main_test.go`:

```go
package main

import (
	"io/fs"
	"testing"
)

func TestEmbeddedSiteHasIndex(t *testing.T) {
	if _, err := fs.Stat(siteFS(), "index.html"); err != nil {
		t.Fatalf("embedded site missing index.html: %v", err)
	}
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd deploy && go test ./...`
Expected: FAIL — `undefined: siteFS`.

- [ ] **Step 4: Implement main.go**

Create `deploy/main.go`:

```go
package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
)

//go:embed all:site
var embedded embed.FS

// siteFS returns the embedded site tree rooted at the "site" directory.
func siteFS() fs.FS {
	sub, err := fs.Sub(embedded, "site")
	if err != nil {
		log.Fatalf("embed sub: %v", err)
	}
	return sub
}

func main() {
	const addr = ":8080"
	log.Printf("minitel: serving on %s", addr)
	if err := http.ListenAndServe(addr, NewHandler(siteFS())); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd deploy && go test ./...`
Expected: PASS.

- [ ] **Step 6: Manual smoke test (optional, 30s)**

Run: `cd deploy && go run . &` then `curl -i http://localhost:8080/ | head -20` then `kill %1`
Expected: 200 with the placeholder HTML and the CSP header.

- [ ] **Step 7: Commit**

```bash
git add deploy/main.go deploy/main_test.go deploy/site/index.html
git commit -m "feat(enclave): embed site tree and serve on :8080"
```

---

### Task 3: Build script that assembles deploy/site from the 21 apps

**Files:**
- Create: `deploy/build-site.sh`

- [ ] **Step 1: Write the build script**

Create `deploy/build-site.sh`:

```bash
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
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x deploy/build-site.sh`

- [ ] **Step 3: Verify with a single chain (fast)**

Run:
```bash
bun install
CHAINS="ethereum" deploy/build-site.sh
```
Expected: ends with `done: 1 chains` and creates `deploy/site/ethereum/index.html`.

- [ ] **Step 4: Confirm the base path was applied**

Run: `grep -o '/ethereum/assets/[^"]*' deploy/site/ethereum/index.html | head -1`
Expected: a path beginning `/ethereum/assets/...` (proves `--base=/ethereum/` rewrote asset URLs so they resolve under the path prefix).

- [ ] **Step 5: Commit the script only (not the partial single-chain site)**

```bash
git checkout -- deploy/site 2>/dev/null || true
rm -rf deploy/site/ethereum
git add deploy/build-site.sh
git commit -m "feat(enclave): add build-site.sh to assemble per-chain dist tree"
```

(The full vendored `deploy/site/` is built and committed in Task 7 to keep this commit focused on the script.)

---

### Task 4: Reproducible StageX Containerfile

**Files:**
- Create: `deploy/Containerfile`
- Create: `.dockerignore` (repo root)

- [ ] **Step 1: Create `.dockerignore` at the repo root**

Create `.dockerignore`:

```
.git
node_modules
**/node_modules
apps/*/dist
apps/*/build
docs
audits
*.oci.tar
```

(Keeps the build context small and deterministic. It does NOT exclude `deploy/site`, which must reach the build.)

- [ ] **Step 2: Pin the current pallet-go digest**

Run:
```bash
docker pull --platform linux/amd64 stagex/pallet-go
docker inspect stagex/pallet-go --format '{{index .RepoDigests 0}}'
docker run --rm --platform linux/amd64 stagex/pallet-go go version
```
Record the `sha256:...` digest and confirm the printed Go version is ≥ 1.22 (the `go.mod` version). Use the digest in the next step — do NOT use a digest from memory.

- [ ] **Step 3: Create the Containerfile**

Create `deploy/Containerfile` (replace `<PINNED-DIGEST>` with the digest from Step 2):

```dockerfile
# StageX images are linux/amd64 only; force the platform for arm64 hosts.
FROM --platform=linux/amd64 stagex/pallet-go@sha256:<PINNED-DIGEST> AS build

ENV SOURCE_DATE_EPOCH=1 \
    CGO_ENABLED=0 \
    GOOS=linux \
    GOARCH=amd64

WORKDIR /src
# Build context is the repo root (caution runs `docker build -f deploy/Containerfile .`).
COPY deploy/ /src/

# stdlib-only build -> no module downloads -> fully hermetic.
RUN --network=none \
    go build -trimpath -buildvcs=false -ldflags="-s -w -buildid=" -o /server .

FROM scratch AS run
COPY --from=build /server /server
ENTRYPOINT ["/server"]
```

- [ ] **Step 4: Build once and confirm it runs**

Run:
```bash
docker buildx build --platform linux/amd64 --target run \
  --output type=docker,dest=/tmp/minitel.tar -f deploy/Containerfile .
```
Expected: build succeeds and the `go build` step runs (not `CACHED`). (Note: on an arm64 host the amd64 Go compile runs under emulation and may take several minutes.)

- [ ] **Step 5: Prove reproducibility (two no-cache OCI builds, byte-compared)**

Run:
```bash
for d in a b; do
  SOURCE_DATE_EPOCH=1 docker buildx build --no-cache \
    --platform linux/amd64 --target run \
    --output type=oci,dest=/tmp/repro-$d.oci.tar,rewrite-timestamp=true \
    -f deploy/Containerfile .
done
cmp /tmp/repro-a.oci.tar /tmp/repro-b.oci.tar && echo REPRODUCIBLE
```
Expected: `REPRODUCIBLE`. If it fails, confirm both runs actually recompiled (the build log shows the `go build` line, not `CACHED`) before investigating determinism.

- [ ] **Step 6: Commit**

```bash
git add .dockerignore deploy/Containerfile
git commit -m "feat(enclave): add reproducible StageX pallet-go Containerfile"
```

---

### Task 5: Procfile

**Files:**
- Create: `Procfile` (repo root)

- [ ] **Step 1: Create the Procfile**

Create `Procfile` at the repo root:

```procfile
run: /server
containerfile: deploy/Containerfile
http_port: 8080
ports: 8080
domain: minitel.example.com
app_sources: https://github.com/kilnfi/minitel
```

- [ ] **Step 2: Replace the domain placeholder**

Edit the `domain:` line to the real production hostname before any `caution apps push`. `minitel.example.com` is a stand-in only. `http_port` (8080) is intentionally also listed in `ports` — Caution push validation rejects the Procfile otherwise.

- [ ] **Step 3: Commit**

```bash
git add Procfile
git commit -m "feat(enclave): add Caution Procfile"
```

---

### Task 6: CI workflow to rebuild and commit the vendored site

**Files:**
- Create: `.github/workflows/build-site.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/build-site.yml`:

```yaml
name: build-site

on:
  push:
    paths:
      - 'apps/**'
      - 'packages/**'
      - 'deploy/build-site.sh'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build-site:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Build site
        run: ./deploy/build-site.sh

      - name: Commit vendored dist if changed
        run: |
          if [ -n "$(git status --porcelain deploy/site)" ]; then
            git config user.name "github-actions[bot]"
            git config user.email "github-actions[bot]@users.noreply.github.com"
            git add deploy/site
            git commit -m "chore(enclave): rebuild vendored deploy/site"
            git push
          else
            echo "deploy/site already up to date"
          fi
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build-site.yml
git commit -m "ci(enclave): rebuild and commit deploy/site on app changes"
```

---

### Task 7: Build and vendor the full 21-chain site

**Files:**
- Create: `deploy/site/<chain>/` for all 21 chains (committed artifacts)

- [ ] **Step 1: Build the full site**

Run:
```bash
bun install
deploy/build-site.sh
```
Expected: ends with `done: 21 chains`.

- [ ] **Step 2: Sanity-check the tree**

Run: `ls deploy/site && test -f deploy/site/index.html && grep -c '<li>' deploy/site/index.html`
Expected: 21 chain directories + `index.html`, and `21` list items in the landing page.

- [ ] **Step 3: Commit the vendored dist**

```bash
git add deploy/site
git commit -m "feat(enclave): vendor prebuilt site for all 21 chains"
```

- [ ] **Step 4: Re-verify reproducibility with the real site (optional but recommended)**

Run the two-build `cmp` from Task 4 Step 5 again now that `deploy/site` is populated.
Expected: `REPRODUCIBLE`.

---

### Task 8: Document the enclave deployment

**Files:**
- Modify: `README.md` (append a section)

- [ ] **Step 1: Append a deployment section to README.md**

Add at the end of `README.md`:

```markdown
## Serving from a Caution enclave

The decoders can be served from a single AWS Nitro / Caution enclave. A small
Go server (`deploy/`) embeds a prebuilt static tree (`deploy/site/`, one
directory per chain plus a landing page) and serves it on `:8080` with the same
CSP/security headers used in production. Caution fronts it with TLS.

- Build the vendored site: `deploy/build-site.sh` (CI does this automatically on
  changes to `apps/**` / `packages/**`).
- Build recipe: `deploy/Containerfile` (StageX `pallet-go`, reproducible).
- Run recipe: `Procfile` (set `domain:` before deploying).
- Verify a live deployment: `caution verify --attestation-url <url>` reproduces
  the PCRs from the attested commit.

See `docs/caution-enclave-design.md` for the design.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(enclave): document Caution enclave deployment"
```

---

## Local QEMU smoke test (manual, optional)

Requires an amd64 Linux environment (the `caution-platform` skill explains why and how on macOS). After `caution apps build`:

```bash
qemu-system-x86_64 -m 512M -nographic \
  -kernel ./vmlinuz-amd64 \
  -initrd ./eif-stage/output/rootfs.cpio.gz \
  -append "console=ttyS0 reboot=k panic=1 nomodules nit.target=/run.sh" \
  -netdev user,id=net0,hostfwd=tcp:0.0.0.0:8080-:8080 \
  -device virtio-net-pci,netdev=net0
```
Then `curl -i http://localhost:8080/` (landing) and `curl -i http://localhost:8080/ethereum/` (chain). Expect 200 + CSP header. The attestation endpoint failing locally (no NSM in QEMU) is expected.

---

## Self-review notes

- **Spec coverage:** one-enclave/all-chains (Task 7), vendor prebuilt dist (Tasks 3,6,7), path-based + landing (Task 3 `--base` + generated index; Task 1 routing), Go server (Tasks 1–2), CSP headers (Task 1), StageX reproducible build (Task 4), Procfile (Task 5), CI auto-commit (Task 6), no outbound networking (`--network=none` build, app serves static only). All covered.
- **Open items from spec:** production `domain` (Task 5 Step 2), pinned `pallet-go` digest (Task 4 Step 2). Both are explicit actionable steps, not silent placeholders.
- **Type consistency:** `NewHandler(fs.FS) http.Handler`, `siteFS() fs.FS`, helpers `readFile`/`serveBytes` are used consistently across Tasks 1–2.
```
