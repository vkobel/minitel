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
