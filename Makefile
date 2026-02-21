.PHONY: dev build test test-cover clean

dev: ## Start backend server (frontend served by Vite separately)
	go run . &
	cd frontend && npm run dev

build: ## Build frontend then embed into Go binary
	cd frontend && npm run build
	go build -o diary .

test: ## Run all backend tests
	go test ./...

test-cover: ## Run tests with coverage report
	go test ./... -coverprofile=coverage.out
	go tool cover -html=coverage.out

clean: ## Remove build artifacts
	rm -f diary coverage.out
	rm -rf frontend/dist
