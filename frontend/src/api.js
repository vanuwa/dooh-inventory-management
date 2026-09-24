import { readApiEnv, readScoped, writeScoped } from './utils/apiEnvironment.js'

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
  const refreshToken = readScoped('refresh_token', env)
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
      writeScoped('access_token', env, data.access_token)
      if (data.refresh_token) {
        writeScoped('refresh_token', env, data.refresh_token)
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
  const accessToken = readScoped('access_token', env)

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
    if (onUnauthorized) onUnauthorized()
    throw new Error('Unauthorized')
  }

  return response
}
