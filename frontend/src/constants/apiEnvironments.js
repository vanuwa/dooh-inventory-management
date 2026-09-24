// Upstream SSP instances the portal can talk to. The selection is sent as an
// X-Api-Env header on every request and the Go proxy maps it to a base URL and
// the OAuth client that goes with it; nothing is stored server-side.
//
// Adding an environment (e.g. alpha) is one row here plus one entry in the
// backend's config.Load() — no other code change.
export const API_ENVIRONMENTS = [
  { name: 'production', label: 'Production', host: 'api.360yield.com' },
  { name: 'acceptance', label: 'Acceptance', host: 'api.360yielddev.com' },
]

// An absent or unrecognised selection means production, matching the proxy,
// which treats a missing X-Api-Env header as production.
export const DEFAULT_API_ENV = 'production'
