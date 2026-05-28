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

Read-only SSP inventory management portal for DOOH operations. Proxies the Improve Digital (360Yield) API — no local database.

- **Backend:** Go stdlib HTTP (no external deps) at `backend/`
- **Frontend:** React 19 + React Router 7 + Vite 6 at `frontend/`
- **In Docker:** nginx serves the SPA and reverse-proxies `/api/` to the Go backend (`http://api:8080/`)

### Auth & Token Flow

1. Frontend POSTs credentials to `POST /api/auth/login` → Go calls upstream `/oauth/token` (password grant) → returns `{access_token, refresh_token}`.
2. Authenticated requests carry tokens in `X-Access-Token` / `X-Refresh-Token` headers.
3. Backend auto-refreshes on 401 and retries; new tokens returned in `X-New-Access-Token` / `X-New-Refresh-Token` response headers.
4. `frontend/src/api.js` reads those headers, updates localStorage, and triggers logout on terminal 401.
5. Login page uses raw `fetch` (not `apiFetch`) because tokens don't exist yet.

The upstream OAuth response has a non-standard shape — `{value, refreshToken: {value}}`. `handlers/auth.go` normalizes it to `{access_token, refresh_token}`.

### Read-only Enforcement

A middleware in `main.go` blocks all non-GET requests except `/api/auth/login` and `/api/report/*`. No mutations are possible through this portal.

### Backend Layout (`backend/`)

| Path | Purpose |
|---|---|
| `main.go` | Server setup, route registration, CORS + read-only middleware |
| `config/config.go` | Env var loading (`IMPROVE_*`, `FRONTEND_ORIGIN`, `PORT`) |
| `handlers/auth.go` | `POST /api/auth/login` — OAuth password grant, normalizes token shape |
| `handlers/proxy.go` | Core `doRequest` + `refreshAndRetry` helpers used by all handlers |
| `handlers/publishers.go` | Publishers list/detail, placements, DOOH settings |
| `handlers/report.go` | Report preview, generation, and status polling |
| `server_test.go` | ~1200-line unit test suite with a mock upstream server |

### API Routes

```
POST /api/auth/login
GET  /api/user/details
GET  /api/publishers?page&limit&search&active
GET  /api/publishers/{id}
GET  /api/publishers/{id}/placements
GET  /api/publishers/{publisherId}/placements/{placementId}/dooh-settings?page&limit&search&sort
POST /api/report/placement/{publisherId}/{placementId}           ← preview
POST /api/report/generate/placement/{publisherId}/{placementId}  ← start CSV generation
GET  /api/report/status/{reportGenerationId}                     ← poll until FINISHED_OK
```

### Frontend Layout (`frontend/src/`)

| Path | Purpose |
|---|---|
| `App.jsx` | Router + `AuthProvider` + route definitions |
| `context/AuthContext.jsx` | Auth state, localStorage sync, login/logout |
| `api.js` | Fetch wrapper: attaches tokens, handles header-based token refresh |
| `pages/Login.jsx` | Login form |
| `pages/Publishers.jsx` | Paginated/searchable publishers table (landing page) |
| `pages/PublisherDetail.jsx` | Publisher metadata + client-side filtered placements list |
| `pages/PlacementDetail.jsx` | Two-tab UI: Screens grid (server-side paginated) + Reporting tab |
| `pages/UserPage.jsx` | User profile (email, business unit, roles) |
| `components/Layout.jsx` | Header with nav, user avatar, logout |
| `components/ProtectedRoute.jsx` | Redirects unauthenticated users to `/login` |
| `components/StatusBadge.jsx` | Reusable active/inactive badge |

### Key Implementation Details

- **No CSS files** — all styling is inline style objects in JSX. Consistent palette: `#1a1a2e` (dark nav), `#f0f2f5` (page bg).
- **Client-side filtering:** `PublisherDetail` loads all placements once and filters in React state. `PlacementDetail` screens use server-side pagination.
- **Debounced search:** 300ms delay before fetching in Publishers and PlacementDetail screens tab.
- **Abort signals:** All async fetch operations use `AbortController` to cancel in-flight requests on unmount.
- **Report polling:** CSV generation polls `/report/status` every 2 seconds, up to 60 attempts (2-minute timeout).
- **Upstream API typo:** The 360Yield API returns `totalNumberOfElemements` (missing an 's'). `handlers/publishers.go` handles both spellings and falls back to the `X-360-Content-Range` header.
- **Pagination defaults:** 20 items per page, max 100. Offset = `(page - 1) * limit`.

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
