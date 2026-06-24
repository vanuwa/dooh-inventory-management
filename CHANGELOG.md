# Changelog

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
