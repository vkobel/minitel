package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
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
	// Default to :8083 — the upstream STEVE forwards to when e2e is enabled
	// (Caution routes Caddy -> STEVE -> 127.0.0.1:8083). Override with PORT for
	// local runs or non-e2e deployments.
	port := os.Getenv("PORT")
	if port == "" {
		port = "8083"
	}
	addr := ":" + port
	log.Printf("minitel: serving on %s", addr)
	if err := http.ListenAndServe(addr, NewHandler(siteFS())); err != nil {
		log.Fatal(err)
	}
}
