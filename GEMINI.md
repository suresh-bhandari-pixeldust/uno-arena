# Game Arena - Project Context

## Project Overview
Game Arena is a web-based, multiplayer game platform featuring classic nostalgic games. It features a Node.js WebSocket server for real-time online play and vanilla JavaScript frontends that support both local and online room-based matchmaking. Games include UNO, Bingo, and WWE Trump Cards.

### Core Technologies
- **Backend:** Node.js, `ws` (WebSocket library).
- **Frontend:** Vanilla HTML5/CSS3/JavaScript (ESM).
- **Game Logic:** Custom functional game engine in `game.js`.
- **Tooling:** `Makefile` for development automation.

### Architecture
- **Server (`server.js`):** Manages WebSocket connections, room lifecycle, and state synchronization. It uses the game engine to process actions and broadcasts sanitized state updates to players.
- **Game Engine (`game.js`):** A pure logic layer that implements UNO rules, deck management, and turn-based state transitions. It includes state sanitization to ensure players cannot see opponents' hands in online mode.
- **Client (`app.js`):** Handles UI rendering, user interactions, and communication with the WebSocket server. It mirrors the game logic for local play.

---

## Building and Running

### Prerequisites
- Node.js (v16+)
- Python 3 (for serving the frontend) or any static web server.

### Commands
- **Install Dependencies:** `npm install` or `make install`
- **Start WebSocket Server:** `node server.js` or `make server` (Runs on port 8080 by default).
- **Serve Frontend:** `python3 -m http.server 8000` or `make serve` (Opens on http://localhost:8000).
- **Development Mode:** `make dev` (Displays instructions for running both server and client).
- **Clean Environment:** `make clean` (Removes `node_modules` and lockfiles).

---

## Specialized Agents (Skills)
Two specialized agent identities have been established to handle project-specific tasks. You can activate them using `activate_skill("skill-name")`.

### 1. QA Agent (`uno-qa`)
- **Responsibility**: Testing, logic validation, and rule adherence.
- **Key Resources**:
    - `references/uno-rules.md`: Comprehensive guide to UNO rules and engine toggles.
- **Workflow**: Activate when validating bug reports or verifying new game mechanics.

### 2. Dev Agent (`uno-dev`)
- **Responsibility**: Feature implementation, bug fixes, and architectural integrity.
- **Key Constraint**: Maintains the functional purity of `game.js` while ensuring the WebSocket protocol remains synchronized across client and server.
- **Workflow**: Activate when implementing user requests or fixing bugs identified by the QA agent.

---

## Development Conventions

### Code Style
- **ES Modules:** The project uses standard ECMAScript Modules (`import`/`export`).
- **Functional State:** Game logic in `game.js` follows a functional pattern where `applyAction` returns a new state object or an error.
- **Naming:** Uses `camelCase` for variables and functions. Files are named lowercase with hyphens if necessary (e.g., `server.js`, `game.js`).
- **Minimal Dependencies:** Avoid adding new dependencies unless absolutely necessary (currently only `ws`).

### Game Logic & Rules
- **State Sanitization:** Always use `sanitizeStateForPlayer` before sending game state to a client in online mode.
- **Custom Rules:** The engine supports several rule toggles:
    - `unoPenalty`: Players must call UNO when they have one card left.
    - `enforceWildDrawFour`: Wild Draw 4 can only be played if no other matching color cards are in hand.
    - `mustDrawOnlyIfNoPlay`: Players can only draw if they have no playable cards.

### Testing
- **Manual Testing:** Use `make dev` and open multiple browser tabs (or incognito windows) to simulate multiple players in a room.
- **Playwright:** The `.playwright-cli` directory suggests usage of Playwright for automated E2E testing/scraping, though no formal test suite is defined in `package.json`.
