package main

import (
	"bytes"
	"encoding/json"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
	"time"
)

// defaultCSP is the strict policy used for the landing page and any chain
// without an explicit override. It matches the policy shipped by the majority
// of apps/*/vercel.json.
const defaultCSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"

// staticSecurityHeaders are identical across every app's vercel.json.
var staticSecurityHeaders = map[string]string{
	"X-Content-Type-Options":    "nosniff",
	"Referrer-Policy":           "strict-origin-when-cross-origin",
	"Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
	"Permissions-Policy":        "camera=(), microphone=(), geolocation=(), payment=()",
}

// NewHandler serves the embedded multi-app static tree. Each chain lives in its
// own top-level directory (e.g. "ethereum/"). A miss under "<chain>/..." falls
// back to "<chain>/index.html" so client-side routing works; "/" serves the
// landing page at "index.html". The Content-Security-Policy is selected per
// chain from csp.json (generated from each app's vercel.json) and falls back to
// defaultCSP — some chains (ada, dot, ksm) need 'wasm-unsafe-eval' and/or extra
// connect-src RPC endpoints.
func NewHandler(siteFS fs.FS) http.Handler {
	cspByChain := loadCSP(siteFS)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for k, v := range staticSecurityHeaders {
			w.Header().Set(k, v)
		}

		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if name == "" {
			name = "index.html"
		}

		chain, _, _ := strings.Cut(name, "/")
		csp := cspByChain[chain]
		if csp == "" {
			csp = cspByChain["default"]
		}
		w.Header().Set("Content-Security-Policy", csp)

		// Exact file hit.
		if data, ok := readFile(siteFS, name); ok {
			// Allow the SW to register with a scope that doesn't have a trailing
			// slash (e.g. "/ethereum") so it controls both "/ethereum" and
			// "/ethereum/" without requiring a redirect.
			if strings.HasSuffix(name, "-sw.js") {
				w.Header().Set("Service-Worker-Allowed", "/")
			}
			serveBytes(w, r, name, data)
			return
		}
		// Directory request -> its index.html. Canonicalize to a trailing slash
		// first: each chain SPA is built with base "/<chain>/", and its STEVE
		// service worker's scope is "/<chain>/". A page served at "/<chain>"
		// (no slash) sits *outside* that scope, so the worker never controls it
		// and `navigator.serviceWorker.ready` hangs. Redirect so the page always
		// loads in scope.
		if data, ok := readFile(siteFS, name+"/index.html"); ok {
			if !strings.HasSuffix(r.URL.Path, "/") {
				dest := r.URL.Path + "/"
				if r.URL.RawQuery != "" {
					dest += "?" + r.URL.RawQuery
				}
				http.Redirect(w, r, dest, http.StatusMovedPermanently)
				return
			}
			serveBytes(w, r, name+"/index.html", data)
			return
		}
		// SPA fallback: first path segment is a chain directory.
		if chain != "" {
			if data, ok := readFile(siteFS, chain+"/index.html"); ok {
				serveBytes(w, r, chain+"/index.html", data)
				return
			}
		}
		http.NotFound(w, r)
	})
}

// loadCSP reads the per-chain CSP map embedded as csp.json. It always returns a
// map with a "default" key so callers can rely on a fallback even when csp.json
// is absent (e.g. in unit tests).
func loadCSP(siteFS fs.FS) map[string]string {
	m := map[string]string{"default": defaultCSP}
	data, err := fs.ReadFile(siteFS, "csp.json")
	if err != nil {
		return m
	}
	var parsed map[string]string
	if err := json.Unmarshal(data, &parsed); err != nil {
		return m
	}
	for k, v := range parsed {
		m[k] = v
	}
	if m["default"] == "" {
		m["default"] = defaultCSP
	}
	return m
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
