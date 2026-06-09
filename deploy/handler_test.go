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

func TestRedirectsChainRootToTrailingSlash(t *testing.T) {
	// "/ethereum" must 301 to "/ethereum/" so the page lands inside the STEVE
	// service worker's "/ethereum/" scope (otherwise the SW never controls it).
	rec := do(t, NewHandler(testFS()), "/ethereum")
	if rec.Code != http.StatusMovedPermanently {
		t.Fatalf("got %d, want 301", rec.Code)
	}
	if loc := rec.Header().Get("Location"); loc != "/ethereum/" {
		t.Fatalf("Location = %q, want /ethereum/", loc)
	}
}

func TestRedirectPreservesQuery(t *testing.T) {
	rec := do(t, NewHandler(testFS()), "/ethereum?tx=0xabc")
	if rec.Code != http.StatusMovedPermanently {
		t.Fatalf("got %d, want 301", rec.Code)
	}
	if loc := rec.Header().Get("Location"); loc != "/ethereum/?tx=0xabc" {
		t.Fatalf("Location = %q, want /ethereum/?tx=0xabc", loc)
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
	// Security headers are set before routing, so they must appear on 404s too.
	if rec.Header().Get("Content-Security-Policy") == "" {
		t.Fatalf("missing CSP header on 404 response")
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

func TestPerChainCSPOverride(t *testing.T) {
	fsys := testFS()
	fsys["csp.json"] = &fstest.MapFile{Data: []byte(`{
		"default": "default-src 'self'; script-src 'self'; connect-src 'self'",
		"ada": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'",
		"dot": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' wss://x.polkadot.io"
	}`)}
	fsys["ada/index.html"] = &fstest.MapFile{Data: []byte("<html>ADA</html>")}
	fsys["dot/index.html"] = &fstest.MapFile{Data: []byte("<html>DOT</html>")}
	h := NewHandler(fsys)

	if csp := do(t, h, "/ada/").Header().Get("Content-Security-Policy"); !strings.Contains(csp, "wasm-unsafe-eval") {
		t.Fatalf("ada CSP missing wasm: %q", csp)
	}
	if csp := do(t, h, "/dot/").Header().Get("Content-Security-Policy"); !strings.Contains(csp, "wss://x.polkadot.io") {
		t.Fatalf("dot CSP missing rpc: %q", csp)
	}
	// A chain not in the map gets the default (no wasm).
	if csp := do(t, h, "/ethereum/").Header().Get("Content-Security-Policy"); strings.Contains(csp, "wasm-unsafe-eval") {
		t.Fatalf("ethereum should get default CSP, got %q", csp)
	}
	// Landing page gets default.
	if csp := do(t, h, "/").Header().Get("Content-Security-Policy"); strings.Contains(csp, "wasm-unsafe-eval") {
		t.Fatalf("landing should get default CSP, got %q", csp)
	}
}
