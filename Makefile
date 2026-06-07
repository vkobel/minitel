# Local build & reproducibility checks for the minitel enclave.
# Deploy/verify go through the caution CLI directly — see deploy/CAUTION.md.

PLATFORM      ?= linux/amd64
CONTAINERFILE ?= Containerfile
PALLET_GO     ?= stagex/pallet-go
EPOCH         ?= 1

.DEFAULT_GOAL := help
.PHONY: help install site test run build repro digest clean

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n",$$1,$$2}'

install: ## Install JS deps (frozen lockfile)
	bun install --frozen-lockfile

site: ## Build all 21 chain SPAs + csp.json into deploy/site/
	./deploy/build-site.sh

test: ## Run the Go server unit tests
	cd deploy && go test ./...

run: ## Build & run the static server locally on :8083
	cd deploy && go run .

build: install site test ## Install deps, build the site, run tests

repro: ## Prove the StageX build is byte-for-byte reproducible (two no-cache builds)
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

clean: ## Remove local build artifacts (keeps the committed deploy/site/)
	rm -rf apps/*/dist /tmp/minitel*.oci.tar
