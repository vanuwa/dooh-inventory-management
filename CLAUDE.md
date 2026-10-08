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

1. Frontend POSTs credentials to `POST /api/auth/login` → Go calls upstream `/oauth/token` (password grant) → returns `{access_token, refresh_token}`; frontend stores both in localStorage under the environment-scoped keys `access_token:<env>` / `refresh_token:<env>`.
2. Authenticated requests carry `X-Access-Token` plus `X-Api-Env`, the selected upstream environment (see `frontend/src/api.js` and **API environments** below).
3. On a 401, the frontend calls `POST /api/auth/refresh` with the refresh token in the JSON body, stores the new tokens, and retries the original request once. Concurrent refreshes are deduplicated via a shared `pendingRefresh` promise. A failed refresh triggers logout.
4. Login page uses raw `fetch` (not `apiFetch`) because tokens don't exist yet, so it sets `X-Api-Env` itself (`pages/Login.jsx`) from the environment its own selector displays.

The upstream OAuth response has a non-standard shape — `{value, refreshToken: {value}}`. `handlers/auth.go` normalizes it to `{access_token, refresh_token}` for both login and refresh.

### Write Allowlist (mostly read-only)

`readOnlyMiddleware` in `main.go` blocks all non-GET requests except paths in `writeAllowed`: auth endpoints, `/api/report/*` (report generation), `.../dooh-settings` (PUT screen edits *and* the bulk soft delete, DELETE the opt-in permanent screen delete), and `.../bulk-upload-jobs` (POST file upload). The entries match on path prefix/suffix only, never on method — `.../dooh-settings` admits *any* method on that path. So a new write-capable route on a path already in `writeAllowed` needs no change; only a route on a **new** path does.

### Backend Layout (`backend/`)

| Path | Purpose |
|---|---|
| `main.go` | Server setup, route registration, CORS + `apiEnvMiddleware` (400 on an unknown `X-Api-Env`) + read-only middleware with `writeAllowed` allowlist |
| `config/config.go` | Env var loading (`IMPROVE_*`, `FRONTEND_ORIGIN`, `PORT`); the `Environments` table (`map[name]Environment{BaseURL, ClientID, ClientSecret}`) and `Config.Env(name)` lookup |
| `handlers/auth.go` | Login + refresh — OAuth password/refresh grants, normalizes token shape |
| `handlers/proxy.go` | Core `doRequest`, `writeJSON`, `writeProxyResponse` helpers used by all handlers; `EnvHeader` plus the `upstreamEnv` / `upstreamBaseURL` per-request resolvers |
| `handlers/publishers.go` | Publishers list/detail, placements, users, DOOH settings (list/item/PUT/bulk DELETE), `resolveTotal` pagination helper |
| `handlers/report.go` | Report preview, generation, and status polling for placements and publishers |
| `handlers/bulk_upload_jobs.go` | Bulk upload jobs list + create (multipart file upload) |
| `handlers/dooh_metadata.go` | DOOH metadata feed proxy (`/demand-partner/v1/dooh-metadata`): filter-name translation, `limit+1` has-more sentinel, items passed through raw |
| `config/config_test.go` | Unit tests for the `Env()` lookup and `Load()` environment defaults |
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
GET  /api/publishers/{publisherId}/placements/{placementId}/dooh-settings?page&limit&search&sort&status
GET  /api/publishers/{publisherId}/placements/{placementId}/dooh-settings/{screenId}
PUT  /api/publishers/{publisherId}/placements/{placementId}/dooh-settings   ← edit screen; also the bulk soft delete (rows sent back with status: "deleted")
DELETE /api/publishers/{publisherId}/placements/{placementId}/dooh-settings?ids=1,2,3  ← permanently delete screens (admin-only upstream; the opt-in path)
GET  /api/publishers/{publisherId}/bulk-upload-jobs
POST /api/publishers/{publisherId}/bulk-upload-jobs                  ← upload file
GET  /api/dooh-metadata?page&limit&country&publisherId&sort          ← DOOH Metadata table + map
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
| `context/AuthContext.jsx` | Auth state, environment-scoped localStorage sync, login/logout, `apiEnv` + `selectApiEnv`/`switchApiEnv` |
| `api.js` | Fetch wrapper: attaches `X-Access-Token` + `X-Api-Env`, reads/writes tokens under environment-scoped keys, client-driven refresh + retry on 401 |
| `pages/RecentActivity.jsx` | Landing page — localStorage-backed visit history with color-coded page-type badges |
| `pages/Publishers.jsx` | Paginated/searchable publishers table |
| `pages/PublisherDetail.jsx` | Tabs: Placements, Bulk Upload Jobs, Users, Reporting |
| `pages/PlacementDetail.jsx` | Tabs: Screens grid + Reporting; screen view/edit modal, Copy VAST Tag |
| `pages/DoohMetadata.jsx` | DOOH Metadata Table + Map tabs (`/dooh-metadata`, `/dooh-metadata/map`); country/publisher filters in the URL; rows keyed by `id`; Status column via `ScreenStatusBadge` |
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
| `utils/dateUtils.js`, `utils/formatApiError.js`, `constants/pageTypes.js` | Date helpers, upstream error-body renderer (`formatApiError`, `labelBatchErrors`), page-type badge constants |
| `utils/format.js` | Shared display formatters (`fmtNamedId`, `fmtNameOrId` — both `(name, id)` — and `fmtStreet`; whitespace-only counts as blank) and the shared `isBlank` that `utils/screenStatus.js` and the edit form import; covered by `utils/format.test.js` |
| `utils/screenStatus.js` | Every screen-`status` decision as pure functions: `SCREEN_STATUS_OPTIONS`, `screenStatusBadge`, `softDeleteBody`, `PATH_OWNED_KEYS`, `partitionSoftDeletable` |
| `constants/apiEnvironments.js`, `utils/apiEnvironment.js` | Environment table (`API_ENVIRONMENTS`, `DEFAULT_API_ENV`) and its pure helpers (`isKnownApiEnv`, `scopedKey`, `apiEnvHost`, `apiEnvBanner`, `readApiEnv`, `writeApiEnv`, `readScoped`, `writeScoped`, `removeScoped`, `migrateLegacyKeys`) |

### Key Implementation Details

- **No CSS files** — all styling is inline style objects in JSX (shared ones in `src/styles/`). Consistent palette: `#1a1a2e` (dark nav), `#f0f2f5` (page bg). Exception: third-party components may require their own stylesheets — e.g. `map/LeafletScreenMap.jsx` imports Leaflet/markercluster CSS, which the map cannot render without. Vendor CSS imports are allowed; app styling stays inline.
- **Tabs and modals are URL-reflected:** tabs are routes (e.g. `/publishers/:id/users`, `.../placements/:placementId/screens`); the screens modal uses a `?screen={id}` search param so screen URLs are shareable.
- **Server-side pagination everywhere:** publishers, publisher placements, and screens all paginate/search upstream. Search inputs are debounced 300ms (`useDebounce`).
- **Abort signals:** async fetch operations use `AbortController` to cancel in-flight requests on unmount.
- **Report polling:** CSV generation polls `/report/status` every 2 seconds, up to 60 attempts, until `status_name === 'FINISHED_OK'`.
- **Version check:** `useVersionCheck` compares `VITE_GIT_COMMIT` (baked in at Docker build from the Makefile) against the latest commit on `VITE_GIT_BRANCH` via the GitHub API every 5 minutes; Layout shows an update banner when outdated.
- **DOOH map basemaps:** the map tab supports two providers, selected by a switcher and persisted via `?mapProvider=` + localStorage (`osm` is the default so Google's billed map loads stay opt-in). All provider config lives in `constants/mapConfig.js`; each provider body is lazy-loaded so only the chosen one's chunk downloads. Google Maps needs `VITE_GOOGLE_MAPS_API_KEY` (baked in at Docker build) and a Map ID (`VITE_GOOGLE_MAPS_MAP_ID`, defaults to `DEMO_MAP_ID`) — without a key the Google option renders disabled. Google markers are built imperatively and handed to `MarkerClusterer` rather than rendered as React elements, to avoid reconciling thousands of components.
- **Screens selection mode:** the Screens toolbar has a **Select / Done** toggle. In select mode a checkbox column appears before ID and a red **Delete (N)** button becomes active; Create Screen, Download CSV and Refresh are disabled while search and the status filter stay live. Selection lives in a `Map<id, screen>` in `PlacementDetail.jsx`, so it persists across pages, searches and filter changes and the confirmation dialog can list rows from earlier pages without refetching; it is capped at `MAX_DELETE_IDS` (1000, the upstream `PlacementDoohsDto.MAX_ITEMS`) at selection time, and reset when the tab, publisher or placement changes. Only the checkbox toggles a row (its `<td>` stops propagation) — clicking the row body still opens the screen modal. `DeleteScreensModal` lists every selected screen with a per-row checkbox, and its warning says outright that a soft delete rewrites every stored field of those rows from the selection-time snapshot. **Delete is soft by default:** confirming sends one `PUT .../dooh-settings` carrying the checked rows with `status: 'deleted'` (upstream `status_id = 3`), which any writer may set and revert. A **"Permanently delete instead (cannot be undone)"** checkbox on its own row above the footer opts into the hard delete, `DELETE .../dooh-settings?ids=...`, which the Go proxy validates against `^[0-9]+(,[0-9]+)*$`, caps at 1000 ids and rejects a repeated `ids` parameter before forwarding verbatim; that path is admin-only upstream and still purges the rows. Both paths are all-or-nothing, both capped at `MAX_DELETE_IDS`, and both render the upstream 400/403/404 body in the dialog, which stays open for a retry. The confirm button keeps the label "Confirm Deletion" and its red `#dc2626` in both modes — the checkbox is the destructive affordance; only the warning text above the list changes. **`softDeleteBody(rows)` drops `PATH_OWNED_KEYS` (`publisher_id`, `placement_id`) unconditionally, then drops every key whose value is `null` or `''`** — both load-bearing rather than tidiness, because upstream's `PUT` is a full overwrite (an absent key becomes `NULL`, an empty-string key `''` — except the `cpm`/`currency_code` pair, which becomes 1 USD) and a sent ownership key that has drifted, or decoded from a production `NULL` as `0`, fails the whole batch on `placement.dooh.publisher.id.mismatch`. Numeric `0` survives, since the test is `!= null && !== ''` and never truthiness. The single-screen edit **Save** drops the same two keys for the same reason. **Rows upstream would reject never leave the browser:** `partitionSoftDeletable(rows)` blocks a row missing any of the ten required fields (whitespace-only counts as missing), either direction of the `cpm`/`currency_code` pair, and the six DTO bounds (`lat` ±90, `lon` ±180, `player_id` ≤ 255 chars, `cpm` ≥ 0, `street` ≤ 1024 chars, `street_number` ≤ 32 chars) — the required fields and the bounds fail as a 400 on the bare property name, naming no screen, and the pair as an indexed validator error that still kills the whole batch — flags each in the dialog with what it lacks, and keeps Confirm disabled until it is unticked. `validateFields` in the edit modal runs the same `outOfRangeFields` for the same reason, so a single-screen save marks the field red instead of earning that 400; it also flags a CPM of 0, which upstream's `validatePositive` rejects. **Price default (SSP-1133):** a write carrying neither `cpm` nor `currency_code` stores 1 USD upstream (a blank `currency_code` counts as absent), and since `PUT` is full-replace, a write omitting both resets the price. The form nevertheless makes CPM and Currency Code **required** (asterisked, in `REQUIRED_FIELDS`), so a save always sends an explicit price and never relies on that default; the create form pre-fills `cpm: 1` / `USD`; after a successful Save `handleSave` bumps `screensTick` and re-reads the row through the item GET into the open modal and the selection snapshot, because otherwise they show the submitted values rather than what upstream stored. **Hard delete is never the remedy for a blocked row** — it purges the whole ticked selection, so the dialog says to untick instead. Errors upstream keys by array index (`dooh_settings[7].venue_type_tax`, never by id) are rewritten to `screen <id> (<player_id>) — <field>` by `labelBatchErrors` (`utils/formatApiError.js`) before `formatApiError` renders them, for the bulk delete and the single-screen save alike; the `rows` array is built once and feeds both the request and the labeller, so the index can never name the wrong screen. After a successful delete the grid always refetches from page 1, because selection spans pages and a delete can shrink the total below the current page; the soft-deleted rows then drop out of every filter except **Deleted only**, where they stay listed, unselected and wearing the Deleted badge. Select mode stays on until **Done**. The upstream reasoning behind every rule above — which columns `applyScreenFields` overwrites, why the required-field check is trimmed, where each bound comes from — is documented field by field in `frontend/src/utils/screenStatus.js`, as the DOOH-map bullet does for `constants/mapConfig.js`; TECH_DEBT.md records what the pre-check cannot cover.
- **Screen status (`utils/screenStatus.js`):** the pure module that owns every `status` decision, because vitest runs in the node environment here and a rule living inside a component cannot be tested at all. `SCREEN_STATUS_OPTIONS` drives the Screens status `<select>`: **All** (`''`), **Active only** (the landing default, `useState('active')`), **Inactive only**, **Deleted only**. **"All" sends no `status` parameter at all** — the `if (status)` guard inside the pure `screensQuery({page, limit, search, status})` helper is what makes that work, which is why the query building was lifted out of the component at all — so it inherits upstream's own default, the deny-list `status_id IS NULL OR status_id <> 3`, and therefore **excludes deleted rows**. That option was deliberately left exactly as it was: deleted screens are reached through **Deleted only**, and an explicit `active,inactive,deleted` allow-list would have hidden rows carrying a `NULL` or unmapped `status_id` with no option able to ask for them back. The other three values are sent as `&status=<token>` (single tokens, `encodeURIComponent`d anyway), and `downloadScreensCSV` inherits the filter through `screensPath`. `screenStatusBadge(status)` feeds `components/ScreenStatusBadge.jsx` (own file, default export, shaped like the app's other multi-state badge `JobStatusBadge.jsx`): green Active, rose Deleted (`#ffe4e6` / `#9f1239`, deliberately not the Delete button's `#dc2626`), and grey Inactive as the fall-through for `inactive`, `null` and anything unmapped, so only genuinely deleted rows change appearance. The binary `StatusBadge` is untouched — its six call sites pass booleans about publishers, placements and users, not screen statuses — and the two badges share only the green/grey pair in `constants/statusColors.js`, so neither module depends on the other. `FIELD_OPTIONS.status` holds all three tokens but `CREATE_STATUS_OPTIONS` filters `deleted` out of the create dialog, since a screen cannot sensibly be born deleted and upstream rejects the next `POST` of a soft-deleted `player_id` as a duplicate; editing a screen back to `active` restores it losslessly. `GET .../dooh-settings/{id}` returns a deleted row whatever the list filter says. This needs an upstream on SSP-1125 or later — against an older build `?status=deleted` answers 400, and because the proxy discards non-200 bodies and the screens fetch has no `res.ok` check, the only symptom is a bare "Failed to load screens."
- **`/dooh-metadata` upstream (SSP-1131):** the page and its map read `GET /demand-partner/v1/dooh-metadata` in `360yield-api-demand-partners`; the old `/admin/v1/dooh-metadata` URL is gone. Upstream filters are snake_case only (`country_code`, `publisher_id`, …) and **an unknown parameter is silently ignored**, so a misspelt name returns the unfiltered feed rather than an error. Our own query contract (`country`, `publisherId`) is unchanged — shared `/dooh-metadata?country=&publisherId=` links keep working — and `handlers/dooh_metadata.go` is the one place that translates it. The handler caps `limit` at 9999 because it asks upstream for `limit+1` to detect a next page and upstream clamps at 10000; items are decoded as `[]json.RawMessage` and passed through untouched, so new feed fields reach the UI with no proxy change and an absent field stays absent. Soft-deleted screens are never returned (`?status=deleted` is a 400 there), so the metadata counts line up with the Screens tab's **All**. The service itself never answers 401 (no `Authorization` header → 403, a bad token → 500); the client-side silent refresh relies on the gateway answering 401 in front of it.
- **Delete selector request-line budget:** the ids travel in the request line, so every hop must accept the worst case — `DELETE /api/publishers/{id}/placements/{id}/dooh-settings?ids=` plus 1000 8-digit ids is ~9.1 KB. `frontend/nginx.conf` therefore sets `large_client_header_buffers 4 16k`; nginx's 8k default would answer 414 before the request reached Go (`TestNginxAllowsMaxDoohSelector` guards this, skipping when the file is absent). The other hops already fit it: Go's `DefaultMaxHeaderBytes` is 1 MB, and the upstream inventory service sets `server.max-http-request-header-size: 1048576`. The same file also sets `client_max_body_size 8m;` (server block) and `proxy_read_timeout 300s;` (the `/api/` location) for the soft-delete `PUT`: its body carries up to 1000 whole screen rows at roughly 1 KB each, straddling nginx's 1 MB default and answering 413 before Go sees it, and upstream's `updateAll` validates, looks up and history-writes all of those rows in one transaction while `handlers/proxy.go` uses `http.DefaultClient` with no timeout of its own, which makes nginx's 60s default the binding limit — a 504 there would report failure on a delete that actually committed. `TestNginxAllowsSoftDeletePut` guards both, with the same skip-when-absent fallback, and looks for the timeout inside the `location /api/` block only — elsewhere it would not apply to a proxied request. `proxy_read_timeout 300s` covers the whole `/api/` location rather than the DOOH settings path alone, and `handlers/proxy.go` still uses `http.DefaultClient` with no timeout — see TECH_DEBT.md. `proxyDoohSettings` bounds its `io.ReadAll` with `http.MaxBytesReader` at the same 8 MB, so `npm run dev` (Vite proxies straight to `:8080` with no nginx in front) shares the in-Docker ceiling.
- **Upstream error rendering:** `utils/formatApiError.js` is the shared renderer for screen create/save/delete error bodies (the older placement/user modals still parse the upstream body inline) — it prefers `messages[]` (`property: description`, one per line, unrenderable entries dropped), then `message`, then a caller-supplied fallback. It never returns an empty string, since every caller renders it conditionally. Covered by `src/utils/formatApiError.test.js`. Used by screen create, save and delete; render its output with `whiteSpace: 'pre-line'`.
- **API environments:** the upstream SSP instance is resolved **per request** from an `X-Api-Env` header (`production` → `api.360yield.com`, the default; `acceptance` → `api.360yielddev.com`), never from server state, so two people on one deployment can sit in different environments. `apiEnvMiddleware` in `main.go` answers `400 unknown api environment` for an unrecognised value — only an *absent* header falls back to production, so an older cached bundle keeps working while a typo can never silently hit production. `config.Environment` carries `{BaseURL, ClientID, ClientSecret}` keyed by name and every handler goes through `upstreamBaseURL(h.cfg, r)` (`handlers/proxy.go`), including both `fetchToken` calls in `auth.go`, so a token is always minted by the instance it will be spent on. Both environments currently share one OAuth client (`IMPROVE_CLIENT_ID` / `IMPROVE_CLIENT_SECRET`); the only new variable is `IMPROVE_ACCEPTANCE_API_BASE_URL`. Frontend: `api.js` sends the header on **both** fetch sites (the silent refresh included) and scopes `access_token` / `refresh_token` as `<key>:<env>`; `useRecentActivity` scopes `dooh_recent_activity` the same way, since its entries embed per-instance IDs. `migrateLegacyKeys()` runs at **module scope** in `main.jsx` before `createRoot(...).render(...)` — it must not be an effect, because `AuthContext` reads tokens in a `useState` initialiser during first render. The selection itself lives in the unscoped `api_env` key; `dooh-metadata-page-size` and `dooh-metadata-map-provider` stay unscoped too (env-independent UI prefs). `AuthContext` holds the one React copy of the selection and keeps it in step with storage: `selectApiEnv(name)` persists, then mirrors *whatever actually took* (a blocked store keeps the old value) and re-reads the tokens for it, so the header select and the accent strip can never name an environment the requests are not going to. The header calls `switchApiEnv`, which is `selectApiEnv` plus a full page load to `/recent` — in-flight requests and cached state carry IDs meaningless in the other instance. `Login.jsx` carries its own selector since `Layout` is not rendered on `/login`, and calls `selectApiEnv` *without* the reload (it would wipe a half-typed form); re-reading the tokens there means an existing session in the newly picked environment redirects straight through. Because `api_env` is shared by every tab, `AuthProvider` also listens for the `storage` event on that key and forces the same reload, so a switch in one tab cannot leave another showing production chrome over an acceptance session. The strip's text comes from the pure `apiEnvBanner()` helper (`utils/apiEnvironment.js`), which is where that display decision is unit-tested. The non-production accent strip uses `#fff7ed` / `#fb923c` / `#7c2d12` — deliberately *not* the amber of the update banner, which can be on screen at the same time.
- **Copy VAST Tag:** built client-side as `https://ad.360yield.com/{publisher_id}/advast?p={placement_id}&player_id=...&dooh_multiplier=1`; disabled when the screen has no `player_id`. The host is the ad server, not the API, and stays **production-only** by decision — on acceptance the copied tag points at the production ad server while carrying acceptance IDs. Switching it would mean adding an `adHost` field to `API_ENVIRONMENTS`.
- **Upstream API typo:** The SSP API returns `totalNumberOfElemements` (missing an 's'). `resolveTotal` in `handlers/` handles both spellings and falls back to the `X-360-Content-Range` header.
- **Pagination defaults:** 20 items per page, max 100. Offset = `(page - 1) * limit`.
- **Plans:** `docs/plans/` holds dated implementation plans (finished ones under `docs/plans/completed/`) — useful context for why things are shaped the way they are.

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
