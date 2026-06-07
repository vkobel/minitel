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

func TestServesChainIndexNoTrailingSlash(t *testing.T) {
	rec := do(t, NewHandler(testFS()), "/ethereum")
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
