# Caution enclave ops for minitel.
# See deploy/CAUTION.md for the full walkthrough.

PLATFORM      ?= linux/amd64
CONTAINERFILE ?= deploy/Containerfile
PALLET_GO     ?= stagex/pallet-go
EPOCH         ?= 1

.DEFAULT_GOAL := help
.PHONY: help install site test vet run build image repro digest \
        caution-build deploy verify clean

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n",$$1,$$2}'

install: ## Install JS deps (frozen lockfile)
	bun install --frozen-lockfile

site: ## Build all 21 chain SPAs + csp.json into deploy/site/
	./deploy/build-site.sh

test: ## Run the Go server unit tests
	cd deploy && go test ./...

vet: ## go vet the server
	cd deploy && go vet ./...

run: ## Build & run the static server locally on :8080
	cd deploy && go run .

build: install site test ## Install deps, build the site, run tests

image: ## Build the enclave OCI image once (linux/amd64)
	docker buildx build --platform $(PLATFORM) --target run \
		--output type=docker,dest=/tmp/minitel.oci.tar -f $(CONTAINERFILE) .

repro: ## Prove the build is byte-for-byte reproducible (two no-cache builds)
	@set -e; for d in a b; do \
		echo ">> build $$d"; \
		SOURCE_DATE_EPOCH=$(EPOCH) docker buildx build --no-cache \
			--platform $(PLATFORM) --target run \
			--output type=oci,dest=/tmp/minitel-repro-$$d.oci.tar,rewrite-timestamp=true \
			-f $(CONTAINERFILE) .; \
	done; \
	cmp /tmp/minitel-repro-a.oci.tar /tmp/minitel-repro-b.oci.tar \
		&& echo REPRODUCIBLE

digest: ## Pull pallet-go and print its digest + Go version (for re-pinning Containerfile)
	docker pull --platform $(PLATFORM) $(PALLET_GO)
	docker inspect $(PALLET_GO) --format '{{index .RepoDigests 0}}'
	docker run --rm --platform $(PLATFORM) $(PALLET_GO) go version

caution-build: ## Build the enclave image with the caution CLI
	caution apps build

deploy: ## Push the enclave with the caution CLI (set Procfile domain first!)
	caution apps push

verify: ## Verify a live deployment reproduces PCRs (usage: make verify ATT_URL=https://...)
	@test -n "$(ATT_URL)" || { echo "set ATT_URL=<attestation url>"; exit 1; }
	caution verify --attestation-url $(ATT_URL)

clean: ## Remove local build artifacts (keeps the committed deploy/site/)
	rm -rf apps/*/dist /tmp/minitel*.oci.tar
