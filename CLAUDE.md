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
npm test       # vitest run — unit tests for pure helpers in src/utils
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

`readOnlyMiddleware` in `main.go` blocks all non-GET requests except paths in `writeAllowed`: auth endpoints, `/api/report/*` (report generation), `.../dooh-settings` (PUT screen edits, DELETE bulk screen delete), and `.../bulk-upload-jobs` (POST file upload). The entries match on path prefix/suffix only, never on method — `.../dooh-settings` admits *any* method on that path. So a new write-capable route on a path already in `writeAllowed` needs no change; only a route on a **new** path does.

### Backend Layout (`backend/`)

| Path | Purpose |
|---|---|
| `main.go` | Server setup, route registration, CORS + `apiEnvMiddleware` (400 on an unknown `X-Api-Env`) + read-only middleware with `writeAllowed` allowlist |
| `config/config.go` | Env var loading (`IMPROVE_*`, `FRONTEND_ORIGIN`, `PORT`); the `Environments` table (`Environment{Name, BaseURL, ClientID, ClientSecret}`) and `Config.Env(name)` lookup |
| `handlers/auth.go` | Login + refresh — OAuth password/refresh grants, normalizes token shape |
| `handlers/proxy.go` | Core `doRequest`, `writeJSON`, `writeProxyResponse` helpers used by all handlers; `EnvHeader` plus the `upstreamEnv` / `upstreamBaseURL` per-request resolvers |
| `handlers/publishers.go` | Publishers list/detail, placements, users, DOOH settings (list/item/PUT/bulk DELETE), `resolveTotal` pagination helper |
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
DELETE /api/publishers/{publisherId}/placements/{placementId}/dooh-settings?ids=1,2,3  ← bulk delete screens (admin-only upstream)
GET  /api/publishers/{publisherId}/bulk-upload-jobs
POST /api/publishers/{publisherId}/bulk-upload-jobs                  ← upload file
POST /api/report/placement/{publisherId}/{placementId}              ← preview
POST /api/report/generate/placement/{publisherId}/{placementId}     ← start CSV generation
POST /api/report/publisher/{publisherId}                            ← preview
POST /api/report/generate/publisher/{publisherId}                   ← start CSV generation
GET  /api/report/status/{reportGenerationId}                        ← poll until FINISHED_OK
```

Every route accepts the optional `X-Api-Env` header (`production` | `acceptance`) selecting the upstream instance for that request — see **API environments** below.

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
| `components/Layout.jsx` | Header with nav, API environment switcher, user avatar, logout, outdated-version banner, non-production accent strip |
| `components/ReportingTab.jsx` | Shared reporting UI (placement + publisher), driven by `hooks/useReportTab.js` |
| `components/BulkUploadJobsTab.jsx` | Jobs grid with per-task detail modal + file upload |
| `components/PublisherUsersTab.jsx` | Publisher users grid |
| `components/PaginationControls.jsx` | Shared pagination controls |
| `components/ScreenMap.jsx` | DOOH map container: fetch, cap/no-coords banners, dynamic height, basemap switcher |
| `components/map/` | Per-provider map bodies (`LeafletScreenMap`, `GoogleScreenMap`) + shared `ScreenPopupContent` |
| `hooks/` | `useDebounce`, `useReportTab`, `useRecentActivity`, `useVersionCheck` |
| `styles/` | Shared inline-style objects (`tables.js`, `tabs.js`) — not CSS files |
| `utils/dateUtils.js`, `utils/formatApiError.js`, `constants/pageTypes.js` | Date helpers, upstream error-body renderer, page-type badge constants |
| `constants/apiEnvironments.js`, `utils/apiEnvironment.js` | Environment table (`API_ENVIRONMENTS`, `DEFAULT_API_ENV`) and its pure helpers (`isKnownApiEnv`, `scopedKey`, `readApiEnv`, `writeApiEnv`, `migrateLegacyKeys`) |

### Key Implementation Details

- **No CSS files** — all styling is inline style objects in JSX (shared ones in `src/styles/`). Consistent palette: `#1a1a2e` (dark nav), `#f0f2f5` (page bg). Exception: third-party components may require their own stylesheets — e.g. `map/LeafletScreenMap.jsx` imports Leaflet/markercluster CSS, which the map cannot render without. Vendor CSS imports are allowed; app styling stays inline.
- **Tabs and modals are URL-reflected:** tabs are routes (e.g. `/publishers/:id/users`, `.../placements/:placementId/screens`); the screens modal uses a `?screen={id}` search param so screen URLs are shareable.
- **Server-side pagination everywhere:** publishers, publisher placements, and screens all paginate/search upstream. Search inputs are debounced 300ms (`useDebounce`).
- **Abort signals:** async fetch operations use `AbortController` to cancel in-flight requests on unmount.
- **Report polling:** CSV generation polls `/report/status` every 2 seconds, up to 60 attempts, until `status_name === 'FINISHED_OK'`.
- **Version check:** `useVersionCheck` compares `VITE_GIT_COMMIT` (baked in at Docker build from the Makefile) against the latest commit on `VITE_GIT_BRANCH` via the GitHub API every 5 minutes; Layout shows an update banner when outdated.
- **DOOH map basemaps:** the map tab supports two providers, selected by a switcher and persisted via `?mapProvider=` + localStorage (`osm` is the default so Google's billed map loads stay opt-in). All provider config lives in `constants/mapConfig.js`; each provider body is lazy-loaded so only the chosen one's chunk downloads. Google Maps needs `VITE_GOOGLE_MAPS_API_KEY` (baked in at Docker build) and a Map ID (`VITE_GOOGLE_MAPS_MAP_ID`, defaults to `DEMO_MAP_ID`) — without a key the Google option renders disabled. Google markers are built imperatively and handed to `MarkerClusterer` rather than rendered as React elements, to avoid reconciling thousands of components.
- **Screens selection mode:** the Screens toolbar has a **Select / Done** toggle. In select mode a checkbox column appears before ID and a red **Delete (N)** button becomes active; Create Screen, Download CSV and Refresh are disabled while search and the status filter stay live. Selection lives in a `Map<id, screen>` in `PlacementDetail.jsx`, so it persists across pages, searches and filter changes and the confirmation dialog can list rows from earlier pages without refetching; it is capped at `MAX_DELETE_IDS` (1000, the upstream `PlacementDoohsDto.MAX_ITEMS`) at selection time, and reset when the tab, publisher or placement changes. Only the checkbox toggles a row (its `<td>` stops propagation) — clicking the row body still opens the screen modal. `DeleteScreensModal` lists every selected screen with a per-row checkbox and on confirm calls `DELETE .../dooh-settings?ids=...`, which the Go proxy validates against `^[0-9]+(,[0-9]+)*$`, caps at 1000 ids and rejects a repeated `ids` parameter before forwarding verbatim. The upstream delete is all-or-nothing, not idempotent and admin-only, so its 400/403/404 body is rendered in the dialog and the dialog stays open for a retry. After a successful delete the grid always refetches from page 1, because selection spans pages and a delete can shrink the total below the current page. Select mode stays on until **Done**.
- **Delete selector request-line budget:** the ids travel in the request line, so every hop must accept the worst case — `DELETE /api/publishers/{id}/placements/{id}/dooh-settings?ids=` plus 1000 8-digit ids is ~9.1 KB. `frontend/nginx.conf` therefore sets `large_client_header_buffers 4 16k`; nginx's 8k default would answer 414 before the request reached Go (`TestNginxAllowsMaxDoohSelector` guards this, skipping when the file is absent). The other hops already fit it: Go's `DefaultMaxHeaderBytes` is 1 MB, and the upstream inventory service sets `server.max-http-request-header-size: 1048576`.
- **Upstream error rendering:** `utils/formatApiError.js` is the shared renderer for screen create/save/delete error bodies (the older placement/user modals still parse the upstream body inline) — it prefers `messages[]` (`property: description`, one per line, unrenderable entries dropped), then `message`, then a caller-supplied fallback. It never returns an empty string, since every caller renders it conditionally. Covered by `src/utils/formatApiError.test.js`. Used by screen create, save and delete; render its output with `whiteSpace: 'pre-line'`.
- **API environments:** the upstream SSP instance is resolved **per request** from an `X-Api-Env` header (`production` → `api.360yield.com`, the default; `acceptance` → `api.360yielddev.com`), never from server state, so two people on one deployment can sit in different environments. `apiEnvMiddleware` in `main.go` answers `400 unknown api environment` for an unrecognised value — only an *absent* header falls back to production, so an older cached bundle keeps working while a typo can never silently hit production. `config.Environment` carries `{Name, BaseURL, ClientID, ClientSecret}` and every handler goes through `upstreamBaseURL(h.cfg, r)` (`handlers/proxy.go`), including both `fetchToken` calls in `auth.go`, so a token is always minted by the instance it will be spent on. Both environments currently share one OAuth client (`IMPROVE_CLIENT_ID` / `IMPROVE_CLIENT_SECRET`); the only new variable is `IMPROVE_ACCEPTANCE_API_BASE_URL`. Frontend: `api.js` sends the header on **both** fetch sites (the silent refresh included) and scopes `access_token` / `refresh_token` as `<key>:<env>`; `useRecentActivity` scopes `dooh_recent_activity` the same way, since its entries embed per-instance IDs. `migrateLegacyKeys()` runs at **module scope** in `main.jsx` before `createRoot(...).render(...)` — it must not be an effect, because `AuthContext` reads tokens in a `useState` initialiser during first render. `dooh-metadata-page-size` and `dooh-metadata-map-provider` stay unscoped (env-independent UI prefs). Switching calls `switchApiEnv`, which persists the choice and does a full page load to `/recent`, because in-flight requests and cached state carry IDs meaningless in the other instance; `Login.jsx` carries its own selector since `Layout` is not rendered on `/login`. The non-production accent strip uses `#fff7ed` / `#fb923c` / `#7c2d12` — deliberately *not* the amber of the update banner, which can be on screen at the same time.
- **Copy VAST Tag:** built client-side as `https://ad.360yield.com/{publisher_id}/advast?p={placement_id}&player_id=...&dooh_multiplier=1`; disabled when the screen has no `player_id`. The host is the ad server, not the API, and stays **production-only** by decision — on acceptance the copied tag points at the production ad server while carrying acceptance IDs. Switching it would mean adding an `adHost` field to `API_ENVIRONMENTS`.
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
