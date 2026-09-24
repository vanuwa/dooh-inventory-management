import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  readApiEnv,
  readScoped,
  writeScoped,
} from './utils/apiEnvironment.js'

let onUnauthorized = null
let pendingRefresh = null

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

async function refreshTokens() {
  if (pendingRefresh) return pendingRefresh
  // Resolved per call, never captured: a switch reloads the page, but a stale
  // value here would spend one environment's refresh token on the other.
  const env = readApiEnv()
  const refreshToken = readScoped(REFRESH_TOKEN_KEY, env)
  if (!refreshToken) return false

  const doRefresh = async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Env': env },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (!res.ok) return false
      const data = await res.json()
      writeScoped(ACCESS_TOKEN_KEY, env, data.access_token)
      if (data.refresh_token) {
        writeScoped(REFRESH_TOKEN_KEY, env, data.refresh_token)
      }
      return true
    } catch {
      return false
    } finally {
      pendingRefresh = null
    }
  }

  pendingRefresh = doRefresh()
  return pendingRefresh
}

export async function apiFetch(path, options = {}, _retried = false) {
  const env = readApiEnv()
  const accessToken = readScoped(ACCESS_TOKEN_KEY, env)

  const headers = {}
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  Object.assign(headers, options.headers)
  if (accessToken) headers['X-Access-Token'] = accessToken
  headers['X-Api-Env'] = env

  const response = await fetch('/api' + path, { ...options, headers })

  if (response.status === 401) {
    if (!_retried) {
      const ok = await refreshTokens()
      if (ok) return apiFetch(path, options, true)
    }
    // The handler is told which environment failed: it clears that environment's
    // tokens, and the app's mirror of the selection can lag a cross-tab switch by a
    // turn of the event loop, so it must not guess from its own state.
    if (onUnauthorized) onUnauthorized(env)
    throw new Error('Unauthorized')
  }

  return response
}
