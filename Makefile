.PHONY: help install server serve dev open status e2e-open e2e-close clean clean-deps clean-artifacts

help:
	@echo "Game Arena commands"
	@echo "  make install   Install server dependencies"
	@echo "  make server    Run WebSocket server on :8080"
	@echo "  make serve     Run static web server on :8000"
	@echo "  make dev       Print multi-terminal instructions"
	@echo "  make open      Open Chrome at http://localhost:8000 (macOS)"
	@echo "  make status    Show listeners on :8000 and :8080"
	@echo "  make e2e-open  Open Chrome via Playwright (headed)"
	@echo "  make e2e-close Close Playwright browsers"
	@echo "  make clean     Remove Playwright artifacts"
	@echo "  make clean-deps Remove node_modules and lockfile"

install:
	npm install

server:
	node server.js

serve:
	python3 -m http.server 8000

dev:
	@echo "Run these in two terminals:"
	@echo "  make server"
	@echo "  make serve"
	@echo "Then open http://localhost:8000 in your browser."

open:
	open -a "Google Chrome" http://localhost:8000

status:
	@echo "Static server (:8000):"
	@lsof -nP -iTCP:8000 -sTCP:LISTEN || true
	@echo "WebSocket server (:8080):"
	@lsof -nP -iTCP:8080 -sTCP:LISTEN || true

e2e-open:
	playwright-cli open 'http://localhost:8000/?cachebust=1' --headed --browser chrome

e2e-close:
	playwright-cli close-all

clean: clean-artifacts

clean-deps:
	rm -rf node_modules package-lock.json

clean-artifacts:
	rm -rf .playwright-cli output/playwright
