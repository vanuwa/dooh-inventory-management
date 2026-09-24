# Changelog

## 2026-09-24

### Features
- The portal can now talk to either SSP instance without a rebuild: an environment switcher in the header (and on the login page) selects **Production** (`api.360yield.com`) or **Acceptance** (`api.360yielddev.com`), and every `/api/...` call carries the choice as an `X-Api-Env` header that the Go proxy resolves per request
- Both the upstream base URL and the OAuth client used to mint the token follow the selection, so an access token is always issued by the instance it is spent on; the same `IMPROVE_CLIENT_ID` / `IMPROVE_CLIENT_SECRET` is valid on both, so switching needs no extra secrets
- Tokens and recent-activity history are namespaced per environment in localStorage, so you stay logged into production and acceptance at the same time and switching does not log either session out; existing unscoped keys are migrated to production on first load, so nobody is logged out by the upgrade
- An orange accent strip below the header names the active environment and its host whenever it is not production, so an acceptance session cannot be mistaken for a production one; switching does a full reload to `/recent`, because cached page state carries IDs that mean nothing in the other instance
- A request naming an unconfigured environment is rejected with `400 unknown api environment` before it reaches any upstream, while a request with no header keeps behaving exactly as before (production), so an older cached bundle continues to work

### Known limitations
- **Copy VAST Tag** still builds a production `https://ad.360yield.com/...` URL. That is the ad server rather than the API, and it is intentionally not switched — on acceptance the copied tag therefore points at the production ad server while carrying acceptance IDs

## 2026-09-23

### Features
- Screens can now be deleted from the placement Screens tab: a **Select** toggle turns on a checkbox column and a red **Delete (N)** button, backed by the inventory API's admin-only bulk delete endpoint
- Selection persists across pages, searches and status-filter changes, so screens from several pages can be collected into one deletion; a summary line shows the running count with a **Clear** link, and the selection stops at 1000 screens (the upstream per-request limit) with a note in that line
- Confirming opens a wide dialog listing every selected screen (ID, Player ID, Status, Placement ID, Publisher, Country) with a checkbox per row, so individual screens can be unticked before deleting
- Upstream validation failures (unknown id, concurrent delete, 404) and a 403 for non-admin users are shown inside the dialog with the upstream wording, and the dialog stays open so the selection can be adjusted and retried
- After a successful delete the grid refetches from page 1 and select mode stays on until **Done**; new backend route `DELETE /api/publishers/{publisherId}/placements/{placementId}/dooh-settings?ids=...` validates the id list (numeric CSV, max 1000) before forwarding it upstream verbatim, and nginx's request-line buffer was raised so a full 1000-id selector is not rejected with a 414

### Improvements
- Screen save and create errors now show the upstream validation text (`property: description`, one line per message) instead of collapsing everything into a generic "Save failed (400)"; the parsing lives in a shared `formatApiError` helper

## 2026-08-14

### Features
- Added a **Status** column (Active/Inactive) to the Screens grid, backed by the upstream `dooh-settings` API's new `status` field
- Create Screen form defaults new screens to Active; the Status dropdown (Active/Inactive) is editable on both create and edit
- Added a Status filter (All, Active only, Inactive only) to the Screens grid, defaulting to "Active only"
- CSV export from the Screens grid now respects the current search and status filters instead of exporting every screen

## 2026-08-06

### Features
- Added a **Basemap** switcher to the DOOH Metadata map tab: screens can now be viewed on either OpenStreetMap (Leaflet, keyless) or Google Maps, which has richer venue/POI data for verifying a screen sits at the expected location
- Google Maps uses `@vis.gl/react-google-maps` with `@googlemaps/markerclusterer`; markers are built imperatively and clustered so up to 2000 screens render without reconciling thousands of React elements
- The chosen basemap is remembered per browser and reflected in the URL as `?mapProvider=google`, so a map link opens on the same provider; it survives Table↔Map tab switches alongside the existing filters
- Each provider loads as its own lazy chunk, so opening the map downloads only the selected one and neither is in the initial bundle
- Google Maps requires `GOOGLE_MAPS_API_KEY` (see README); without it the Google option renders disabled with an explanatory tooltip and OpenStreetMap continues to work. OpenStreetMap stays the default so Google's billed map loads remain opt-in

### Improvements
- Widened the `.gitignore` env pattern to `.env*` (keeping `.env.example` tracked) so a local `frontend/.env.local` holding an API key can no longer be committed

## 2026-07-22

### Features
- Added a Map tab to the DOOH Metadata page (`/dooh-metadata/map`) that plots screens on an interactive Leaflet + OpenStreetMap map with marker clustering; the Table and Map tabs share the country/publisher filters and preserve them across tab switches
- Map screens load from the existing `/dooh-metadata` endpoint (up to a 2000-screen cap), with banners when the set is capped or when screens have no coordinates; clicking a pin shows screen ID, publisher, location, venue type, and coordinates
- Leaflet is lazy-loaded so it stays out of the initial bundle and only downloads when the Map tab is opened; the basemap lives behind a single config seam (`mapConfig.js`) for a later swap to a self-hosted or keyed tile provider

## 2026-07-09

### Features
- Added an "Appnexus" checkbox to the Create Placement modal (defaults to checked); backend now forwards the selected value instead of hardcoding `appnexus: true`, which previously caused creation to fail with `placement.appnexus.forbidden` for publishers without AppNexus enabled
- Placement detail info card now shows an "Appnexus" row (Enabled/Disabled); backend fetches it via an additional upstream call since the placements list endpoint doesn't return it
- Edit Placement modal now exposes "Status" (Active) and "Appnexus" (Enabled) checkboxes; unchecking Active automatically unchecks and disables Appnexus, since a placement can't have AppNexus enabled while inactive
- `StatusBadge` component accepts an optional `labels` prop so it can render "Enabled/Disabled" alongside its existing "Active/Inactive" usage
- Create Screen form now prefills Resolution Width (1920), Resolution Height (1080), and Currency Code (EUR) — all still editable; Orientation defaults to unselected
- Orientation on the Create/Edit Screen form is now a dropdown (empty, landscape, portrait, square) instead of free text

### Bug Fixes
- Fixed Create/Edit Placement modals showing a generic failure message instead of the upstream validation reason; both now parse the SSP's `{messages: [{description}]}` error shape
- Fixed `UpdatePublisherPlacement` discarding the real upstream error body on a failed placement update, always returning "failed to update placement name (site details were saved)" regardless of the actual cause
- Fixed disabling Appnexus on an existing placement failing validation ("appnexus name cannot be defined") because the stale `appnexus_name` field wasn't cleared when `appnexus` was set to false

## 2026-07-02

### Features
- Added "Create Screen" button to the Screens tab on the placement detail page; opens the existing screen modal in create mode with publisher ID and placement ID pre-filled (read-only), venue type taxonomy defaulting to "OpenOOH Venue Taxonomy 1.1", and allowed content defaulting to "VIDEO"
- Required fields (Player ID, Resolution Width/Height, Venue Type ID, Venue Type Tax, Latitude, Longitude, Country Code, City, Allowed Content) are marked with an asterisk and highlighted with a red border if left empty on submission
- `?` help tooltips on Venue Type ID (links to the OpenOOH taxonomy spec) and Country Code (ISO 3166-1 alpha-2 explanation)
- New `POST /api/publishers/{publisherId}/placements/{placementId}/dooh-settings` backend endpoint proxying the upstream create API; upstream validation errors are passed through to the UI verbatim
- On successful creation the screens grid refreshes automatically to show the new entry; the create URL (`?screen=new`) is shareable and reopens the form on load

## 2026-06-29

### Features
- Added hourly grouping option to reporting tabs on placement and publisher pages; backend maps the `hour` group-by to the `date_hour` dimension when forwarding to the upstream API, producing per-hour rows with timestamps like `2026-06-27 15:00:00.0`
- Group-by buttons are now ordered Hourly / Daily / Weekly / Monthly; hourly remains available (not disabled) when "Today" is selected, as it is the most useful granularity for a single-day range

## 2026-06-25

### Features
- Added "Today" quick alias to reporting date range selectors on placement and publisher pages; backend converts it to a fixed single-day range before forwarding to the upstream API
- Custom date range pickers now allow selecting today's date (previously capped at yesterday)

### Improvements
- Weekly and monthly group-by options are automatically reset to daily and disabled when "Today" is selected, since a single-day range is incompatible with multi-day time dimensions
- Date picker `max` constraint now uses the browser's local calendar date rather than UTC, preventing UTC+ users from being unable to select their local today

## 2026-06-24

### Features
- Added Edit button on the placement detail page: opens a pre-filled modal to update placement name, site URL, and max defaults; button is disabled until the full placement detail is loaded to prevent silent data-loss on max defaults
- New `PUT /api/publishers/{id}/placements/{placementId}` backend endpoint that orchestrates a GET-merge-PUT for both the upstream inventory (name + URL + max defaults) and placement (name) to avoid wiping unrelated fields; changing the name updates both resources in sync

## 2026-06-23

### Features
- Added placement info card on the Placement detail page: shows placement ID, type, site (name + ID), platform, site URL, and max defaults above the tabs; visible on both direct URL access and publisher-page navigation
- New `GET /api/publishers/{id}/placements/{placementId}` backend endpoint that facades two upstream calls — v2 placements search (returns inventory and platform fields) followed by inventory detail (returns site URL and max defaults)

### Bug Fixes
- Fixed placement detail page showing no card data on direct URL access (was calling a non-existent upstream endpoint that returned 403)

## 2026-06-22

### Features
- Added DOOH Metadata page (`/dooh-metadata`) with a 19-column scrollable grid of all screens from the upstream admin API; accessible from the top nav between Publishers and Changelog
- Filters by country code and publisher ID (debounced); filter state, page, and page size reflected in the URL for shareable links
- Configurable page size (10–10 000) persisted in localStorage; First/Prev/Next pagination using a limit+1 sentinel to avoid false "next page" prompts on exact-multiple-of-limit datasets
- Screen image preview modal: clicking "View" in the Screen Image column shows the image in an overlay instead of opening a new tab

### Bug Fixes
- Fixed non-200 upstream responses being forwarded with an empty body (frontend now receives the actual error body)
- Fixed `publisherId` filter accepting non-integer values that would cause upstream errors
- Fixed NaN page state when the URL contains a malformed `?page=` parameter
- Fixed page reset incorrectly firing on mount in React StrictMode when navigating to a shared URL with `?page=N`

## 2026-06-15

### Features
- Added Create DOOH Placement on the Publisher's Placements tab: "Create DOOH Placement" button opens a modal (Name, URL, Max Defaults; Creative Type fixed as Multiformat); backend orchestrates inventory → zone → placement creation in a single call with zone-aware rollback on failure
- Placements grid now sorted by ID descending so newly created placements appear at the top

### Bug Fixes
- Fixed path traversal vulnerability: publisher ID is now URL-escaped before interpolation into upstream API paths in the placement creation handler
- Fixed zone not being cleaned up when placement creation fails after the zone was already created
- Fixed stale "Placement created successfully." message reappearing after switching tabs and returning to Placements

## 2026-06-11

### Features
- Added Create User modal on the publisher Users tab: Console/API access types with role presets, searchable publisher multi-select; backend restricts creation to Publisher-type users
- Added Edit User modal opened by clicking a user row (shareable `?user={id}` URL): editable profile, active/inactive status, publishers, and access levels; User Type and Access Type are read-only; backend restricts editing to Publisher-type users

### Improvements
- Replaced stale backend token-refresh tests with coverage matching the client-driven refresh flow

### Bug Fixes
- Fixed "new version available" banner always showing when deployed from a non-main branch (e.g. `dev`); version check now compares against the branch the build was made from

## 2026-06-10

### Features
- Added shareable screen URL and Copy VAST Tag button on placement screens

## 2026-06-08

### Features
- Added Changelog page listing all releases grouped by date with category chips
- Added update notification banner that detects when a newer version is available on the main branch

### Bug Fixes
- Fixed publisher placements grid: switched to server-side pagination and search (was silently truncated to 100 results, breaking search for large publishers)
- Fixed active/inactive filter for placements: forwarded as `placement_status` to match the upstream API field name
- Fixed placement name fallback on direct navigation: increased fetch limit so names resolve correctly for publishers with more than 20 placements
- Fixed double upstream fetch when changing the active filter on the placements tab
- Added error feedback and stale-data clearing on placements fetch failure

### Improvements
- Added missing fields to placements data: `position`, `primary_size`, `zone_id`, `zone_name`

## 2026-06-05

### Features
- Added Publisher's Users tab
- Added Recent Activity page with localStorage-backed visit history and color-coded badges per page type

## 2026-06-03

### Improvements
- Reduced duplication across backend handlers and frontend components; extracted reusable helpers and hooks (useReportTab, ReportingTab, writeJSON, buildDims)

## 2026-06-02

### Features
- Added reporting tab to publisher page with groupBy toggle and date-descending sort

## 2026-05-29

### Features
- Added clickable screens grid with view/edit modal

### Improvements
- Added more columns to placements grid: type, site, platform
- Added favicon, header icon, and publisher name in placement back link

### Bug Fixes
- Deduplicated concurrent token refresh calls

## 2026-05-28

### Features
- Added job detail modal to bulk upload jobs grid with task breakdown and error messages
- Added Download CSV button to placement Screens tab
- Added bulk upload jobs tab to publisher page with URL-reflected tabs

### Improvements
- Moved token refresh responsibility from backend to frontend

### Bug Fixes
- Fixed bulk upload result display and surfaced upstream API errors

## 2026-05-27

### Features
- Added placement reporting tab with CSV export
- Added user profile page

### Improvements
- Added placements pagination and row hover highlight
- Set Publishers as the landing page

## 2026-05-26

### Features
- Added placement detail page with DOOH screens grid
- Added placements list page with backend fan-out and shared Layout

### Improvements
- Replaced flat fan-out placements page with two-level publisher → placement hierarchy
- Removed "#" prefix from all IDs in UI

### Bug Fixes
- Fixed publisher pagination via X-360-Content-Range header fallback

## 2026-05-22

### Features
- Initial release: Go proxy backend + React frontend
- Login page and dashboard with user details
