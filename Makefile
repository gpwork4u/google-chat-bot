.PHONY: infra-up infra-down dev build test tidy clean \
        web-install web-dev web-build web-clean contracts \
        backfill-skip backfill-skip-apply

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

# --- Backfill ---

# 一次性工具：列出將會被 skip 的 pending 訊息（dry-run，不寫 DB）。
# 確認輸出無誤後，執行 make backfill-skip-apply 真的標記。
backfill-skip:
	go run ./cmd/backfill-skip

# apply 模式：真的呼叫 POST /api/claude/skip 標記訊息。
# 執行前請確認 backend 已啟動（make dev / docker compose up）。
backfill-skip-apply:
	go run ./cmd/backfill-skip --apply

# --- Contracts Codegen ---

# Regenerate web/src/contracts.generated.ts from Go structs in internal/httpapi/types.go.
# Requires tygo: go install github.com/gzuidhof/tygo@latest
contracts:
	tygo generate
