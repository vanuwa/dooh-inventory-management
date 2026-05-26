# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Start / stop everything (Docker):**
```bash
make up            # docker compose up -d --build --force-recreate
make down          # docker compose down --rmi all --remove-orphans
make rebuild-api   # rebuild and restart the api container only
make rebuild-ui    # rebuild and restart the ui container only
```

**Backend (Go):**
```bash
cd backend
go test ./...                    # run all tests
go test ./... -run TestFoo       # run a single test
go build ./...                   # compile check
```

**Frontend (React + Vite):**
```bash
cd frontend
npm install
npm run dev    # dev server on localhost:5173 (proxies /api → localhost:8080)
npm run build  # production build into dist/
```

## Architecture

Full-stack DOOH inventory management portal:
- **Backend:** Go stdlib HTTP server (no external deps) at `backend/`
- **Frontend:** React 19 + React Router 7 + Vite 6 at `frontend/`
- **Auth upstream:** Improve Digital (360Yield) OAuth2 API — credentials in `.env`

In Docker: nginx serves the React SPA and reverse-proxies `/api/` to the Go backend (`http://api:8080/`).

### Auth & Token Flow

1. Frontend POSTs credentials to `POST /api/auth/login` → Go calls Improve Digital `/oauth/token` → returns tokens to frontend (stored in localStorage).
2. Authenticated requests carry tokens in `X-Access-Token` / `X-Refresh-Token` headers.
3. Go proxy (`handlers/proxy.go`) auto-refreshes on 401 and retries; new tokens returned in `X-New-Access-Token` / `X-New-Refresh-Token` response headers.
4. `frontend/src/api.js` reads those headers, updates localStorage, and triggers logout on terminal 401.

### Backend layout (`backend/`)

| Path | Purpose |
|---|---|
| `main.go` | Server setup, route registration, CORS + read-only middleware |
| `config/config.go` | Env var loading (`IMPROVE_*`, `FRONTEND_ORIGIN`, `PORT`) |
| `handlers/auth.go` | `POST /api/auth/login` — OAuth password grant |
| `handlers/proxy.go` | `GET /api/user/details` — proxy with refresh-and-retry |
| `server_test.go` | Unit tests with a mock upstream server |

### Frontend layout (`frontend/src/`)

| Path | Purpose |
|---|---|
| `App.jsx` | Router + `AuthProvider` + route definitions |
| `context/AuthContext.jsx` | Auth state, localStorage sync, login/logout |
| `api.js` | Fetch wrapper: attaches tokens, handles header-based token refresh |
| `pages/Login.jsx` | Login form |
| `pages/Dashboard.jsx` | Shows authenticated user details |
| `components/ProtectedRoute.jsx` | Redirects unauthenticated users to `/login` |

---

## Behavioral Guidelines

Behavioral guidelines to reduce common LLM coding mistakes.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
