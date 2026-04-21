.PHONY: infra-up infra-down dev build test tidy clean

infra-up:
	docker-compose up -d postgres

infra-down:
	docker-compose down

dev: infra-up
	@test -f .env || (echo "missing .env — copy .env.example and fill it in"; exit 1)
	go run ./cmd/server

build:
	mkdir -p bin
	go build -o bin/server ./cmd/server

test:
	go test ./...

tidy:
	go mod tidy

clean:
	rm -rf bin tmp
