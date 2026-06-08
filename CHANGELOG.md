# Changelog

## 2026-06-08

### Features
- Added Changelog page listing all releases grouped by date with category chips
- Added update notification banner that detects when a newer version is available on the main branch

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
