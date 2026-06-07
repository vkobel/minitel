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
