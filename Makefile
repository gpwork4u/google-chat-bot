.PHONY: infra-up infra-down dev build test tidy clean \
        web-install web-dev web-build web-clean contracts

# --- Infrastructure ---

infra-up:
	docker-compose up -d postgres

infra-down:
	docker-compose down

# --- Backend ---

dev: infra-up web-build
	@test -f .env || (echo "missing .env — copy .env.example and fill it in"; exit 1)
	go run ./cmd/server

build: web-build
	mkdir -p bin
	go build -o bin/server ./cmd/server

test:
	go test ./...

tidy:
	go mod tidy

clean: web-clean
	rm -rf bin tmp

# --- Frontend ---

# Install Node dependencies (run once after clone or when package.json changes).
web-install:
	cd web && npm install

# Start Vite dev server (port 5173, proxies /api and /ws to :8080).
# Run `make dev` in another terminal to start the Go backend.
web-dev:
	cd web && npm run dev

# Build production bundle into internal/httpapi/web/dist/.
web-build:
	cd web && npm run build

web-clean:
	rm -rf internal/httpapi/web/dist/*
	touch internal/httpapi/web/dist/.gitkeep
	cp internal/httpapi/web/dist/.gitkeep /dev/null || true

# --- Contracts Codegen ---

# Regenerate web/src/contracts.generated.ts from Go structs in internal/httpapi/types.go.
# Requires tygo: go install github.com/gzuidhof/tygo@latest
contracts:
	tygo generate
