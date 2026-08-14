# Tech Debt

Known shortcuts and inefficiencies that are acceptable for now but should be revisited.

## Frontend

- **Duplicate filter-change causes a wasted, aborted fetch** (`frontend/src/pages/PlacementDetail.jsx`, Screens tab). The page-reset effect (`useEffect(() => { setPage(1) }, [committedSearch, statusFilter])`) and the data-fetch effect (`useEffect(..., [publisherId, placementId, page, committedSearch, statusFilter, activeTab, screensTick])`) are separate. When a filter (search or status) changes while not on page 1, both effects fire in the same commit: the fetch effect runs first with the *new* filter but the *stale* `page`, issuing a request that's immediately aborted once `setPage(1)` triggers a re-render and the fetch effect re-runs with `page=1`. Net effect: one extra HTTP request per filter change while off page 1, always aborted before it's used.
  - Predates the status-filter addition (already present for the search filter); the status filter (added 2026-08-14) just extended it to a second trigger via the same existing pattern.
  - Fix: merge the two effects, or reset `page` synchronously within the fetch effect when a filter changed, so only one request fires per filter change.
  - Flagged by the `/simplify` efficiency review on 2026-08-14; not fixed because doing so properly means restructuring both effects, which affects existing search-filter behavior too and was out of scope for that change.
