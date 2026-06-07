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
