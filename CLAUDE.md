# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Start / stop everything (Docker):**
```bash
make up            # docker compose up -d --build --force-recreate (passes GIT_COMMIT/GIT_BRANCH)
make down          # docker compose down --rmi all --remove-orphans
make rebuild-api   # rebuild and restart the api container only
make rebuild-ui    # rebuild and restart the ui container only (passes GIT_COMMIT/GIT_BRANCH)
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

Inventory management portal for DOOH operations, mostly read-only with a few explicit write paths. Proxies the SSP API — no local database.

- **Backend:** Go stdlib HTTP (no external deps) at `backend/`
- **Frontend:** React 19 + React Router 7 + Vite 6 at `frontend/`
- **In Docker:** nginx serves the SPA and reverse-proxies `/api/` to the Go backend (`http://api:8080/`)

### Auth & Token Flow

1. Frontend POSTs credentials to `POST /api/auth/login` → Go calls upstream `/oauth/token` (password grant) → returns `{access_token, refresh_token}`; frontend stores both in localStorage.
2. Authenticated requests carry only `X-Access-Token` (see `frontend/src/api.js`).
3. On a 401, the frontend calls `POST /api/auth/refresh` with the refresh token in the JSON body, stores the new tokens, and retries the original request once. Concurrent refreshes are deduplicated via a shared `pendingRefresh` promise. A failed refresh triggers logout.
4. Login page uses raw `fetch` (not `apiFetch`) because tokens don't exist yet.

The upstream OAuth response has a non-standard shape — `{value, refreshToken: {value}}`. `handlers/auth.go` normalizes it to `{access_token, refresh_token}` for both login and refresh.

### Write Allowlist (mostly read-only)

`readOnlyMiddleware` in `main.go` blocks all non-GET requests except paths in `writeAllowed`: auth endpoints, `/api/report/*` (report generation), `.../dooh-settings` (PUT screen edits), and `.../bulk-upload-jobs` (POST file upload). When registering a new write-capable route, you must also add it to `writeAllowed`.

### Backend Layout (`backend/`)

| Path | Purpose |
|---|---|
| `main.go` | Server setup, route registration, CORS + read-only middleware with `writeAllowed` allowlist |
| `config/config.go` | Env var loading (`IMPROVE_*`, `FRONTEND_ORIGIN`, `PORT`) |
| `handlers/auth.go` | Login + refresh — OAuth password/refresh grants, normalizes token shape |
| `handlers/proxy.go` | Core `doRequest`, `writeJSON`, `writeProxyResponse` helpers used by all handlers |
| `handlers/publishers.go` | Publishers list/detail, placements, users, DOOH settings (list/item/PUT), `resolveTotal` pagination helper |
| `handlers/report.go` | Report preview, generation, and status polling for placements and publishers |
| `handlers/bulk_upload_jobs.go` | Bulk upload jobs list + create (multipart file upload) |
| `server_test.go` | Unit test suite with a mock upstream server |

### API Routes

```
POST /api/auth/login
POST /api/auth/refresh
GET  /api/user/details
GET  /api/publishers?page&limit&search&active
GET  /api/publishers/{id}
GET  /api/publishers/{id}/placements?page&limit&search&active        ← server-side paginated
GET  /api/publishers/{id}/users
GET  /api/publishers/{publisherId}/placements/{placementId}/dooh-settings?page&limit&search&sort
GET  /api/publishers/{publisherId}/placements/{placementId}/dooh-settings/{screenId}
PUT  /api/publishers/{publisherId}/placements/{placementId}/dooh-settings   ← edit screen
GET  /api/publishers/{publisherId}/bulk-upload-jobs
POST /api/publishers/{publisherId}/bulk-upload-jobs                  ← upload file
POST /api/report/placement/{publisherId}/{placementId}              ← preview
POST /api/report/generate/placement/{publisherId}/{placementId}     ← start CSV generation
POST /api/report/publisher/{publisherId}                            ← preview
POST /api/report/generate/publisher/{publisherId}                   ← start CSV generation
GET  /api/report/status/{reportGenerationId}                        ← poll until FINISHED_OK
```

### Frontend Layout (`frontend/src/`)

| Path | Purpose |
|---|---|
| `App.jsx` | Router + `AuthProvider`; catch-all redirects to `/recent` (landing page) |
| `context/AuthContext.jsx` | Auth state, localStorage sync, login/logout |
| `api.js` | Fetch wrapper: attaches `X-Access-Token`, client-driven refresh + retry on 401 |
| `pages/RecentActivity.jsx` | Landing page — localStorage-backed visit history with color-coded page-type badges |
| `pages/Publishers.jsx` | Paginated/searchable publishers table |
| `pages/PublisherDetail.jsx` | Tabs: Placements, Bulk Upload Jobs, Users, Reporting |
| `pages/PlacementDetail.jsx` | Tabs: Screens grid + Reporting; screen view/edit modal, Copy VAST Tag |
| `pages/Changelog.jsx` | Renders `CHANGELOG.md` (copied into `public/` at Docker build) |
| `pages/UserPage.jsx` | User profile (email, business unit, roles) |
| `components/Layout.jsx` | Header with nav, user avatar, logout, outdated-version banner |
| `components/ReportingTab.jsx` | Shared reporting UI (placement + publisher), driven by `hooks/useReportTab.js` |
| `components/BulkUploadJobsTab.jsx` | Jobs grid with per-task detail modal + file upload |
| `components/PublisherUsersTab.jsx` | Publisher users grid |
| `components/PaginationControls.jsx` | Shared pagination controls |
| `hooks/` | `useDebounce`, `useReportTab`, `useRecentActivity`, `useVersionCheck` |
| `styles/` | Shared inline-style objects (`tables.js`, `tabs.js`) — not CSS files |
| `utils/dateUtils.js`, `constants/pageTypes.js` | Date helpers, page-type badge constants |

### Key Implementation Details

- **No CSS files** — all styling is inline style objects in JSX (shared ones in `src/styles/`). Consistent palette: `#1a1a2e` (dark nav), `#f0f2f5` (page bg).
- **Tabs and modals are URL-reflected:** tabs are routes (e.g. `/publishers/:id/users`, `.../placements/:placementId/screens`); the screens modal uses a `?screen={id}` search param so screen URLs are shareable.
- **Server-side pagination everywhere:** publishers, publisher placements, and screens all paginate/search upstream. Search inputs are debounced 300ms (`useDebounce`).
- **Abort signals:** async fetch operations use `AbortController` to cancel in-flight requests on unmount.
- **Report polling:** CSV generation polls `/report/status` every 2 seconds, up to 60 attempts, until `status_name === 'FINISHED_OK'`.
- **Version check:** `useVersionCheck` compares `VITE_GIT_COMMIT` (baked in at Docker build from the Makefile) against the latest commit on `VITE_GIT_BRANCH` via the GitHub API every 5 minutes; Layout shows an update banner when outdated.
- **Copy VAST Tag:** built client-side as `https://ad.360yield.com/{publisher_id}/advast?p={placement_id}&player_id=...&dooh_multiplier=1`; disabled when the screen has no `player_id`.
- **Upstream API typo:** The SSP API returns `totalNumberOfElemements` (missing an 's'). `resolveTotal` in `handlers/` handles both spellings and falls back to the `X-360-Content-Range` header.
- **Pagination defaults:** 20 items per page, max 100. Offset = `(page - 1) * limit`.
- **Plans:** `plans/` holds dated implementation plans for past features — useful context for why things are shaped the way they are.

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
