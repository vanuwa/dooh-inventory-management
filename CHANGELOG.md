# Changelog

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
