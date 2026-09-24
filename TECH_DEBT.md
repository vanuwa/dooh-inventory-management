# Tech Debt

Known shortcuts and inefficiencies that are acceptable for now but should be revisited.

## Frontend

- **Copy VAST Tag is production-only** (`frontend/src/pages/PlacementDetail.jsx`). The ad host `https://ad.360yield.com` is hardcoded and does not follow the API environment switcher, so on acceptance the copied tag points at the production ad server while carrying acceptance publisher/placement IDs. The ad server is a different host from the API, which is why it was left out when the switcher landed (2026-09-24).
  - Fix: add an `adHost` field to each row of `API_ENVIRONMENTS` (`frontend/src/constants/apiEnvironments.js`) and build the URL from it.

- **Environment hosts are duplicated in the frontend** (`frontend/src/constants/apiEnvironments.js`). `api.360yield.com` / `api.360yielddev.com` are hardcoded for the login host note and the non-production accent strip, while the proxy resolves the real base URLs from `IMPROVE_API_BASE_URL` / `IMPROVE_ACCEPTANCE_API_BASE_URL`. Override either variable and the UI names a host the proxy is not using. Harmless for the default deployment (the values match `compose.yaml`), and the environment *label* — the actual safety signal — stays correct either way.
  - Fix: expose the resolved base URLs from the backend (e.g. on an existing GET) and render those instead of the constants.
  - Flagged by the code review of the environment switcher on 2026-09-24; not fixed because the alternatives were a new endpoint or dropping the most concrete cue from the accent strip.

- **Duplicate filter-change causes a wasted, aborted fetch** (`frontend/src/pages/PlacementDetail.jsx`, Screens tab). The page-reset effect (`useEffect(() => { setPage(1) }, [committedSearch, statusFilter])`) and the data-fetch effect (`useEffect(..., [publisherId, placementId, page, committedSearch, statusFilter, activeTab, screensTick])`) are separate. When a filter (search or status) changes while not on page 1, both effects fire in the same commit: the fetch effect runs first with the *new* filter but the *stale* `page`, issuing a request that's immediately aborted once `setPage(1)` triggers a re-render and the fetch effect re-runs with `page=1`. Net effect: one extra HTTP request per filter change while off page 1, always aborted before it's used.
  - Predates the status-filter addition (already present for the search filter); the status filter (added 2026-08-14) just extended it to a second trigger via the same existing pattern.
  - Fix: merge the two effects, or reset `page` synchronously within the fetch effect when a filter changed, so only one request fires per filter change.
  - Flagged by the `/simplify` efficiency review on 2026-08-14; not fixed because doing so properly means restructuring both effects, which affects existing search-filter behavior too and was out of scope for that change.
