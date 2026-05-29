let onUnauthorized = null
let pendingRefresh = null

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

async function refreshTokens() {
  if (pendingRefresh) return pendingRefresh
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) return false

  const doRefresh = async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (!res.ok) return false
      const data = await res.json()
      localStorage.setItem('access_token', data.access_token)
      if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token)
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
  const accessToken = localStorage.getItem('access_token')

  const headers = {}
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  Object.assign(headers, options.headers)
  if (accessToken) headers['X-Access-Token'] = accessToken

  const response = await fetch('/api' + path, { ...options, headers })

  if (response.status === 401 && !_retried) {
    const ok = await refreshTokens()
    if (ok) return apiFetch(path, options, true)
    if (onUnauthorized) onUnauthorized()
    throw new Error('Unauthorized')
  }

  if (response.status === 401) {
    if (onUnauthorized) onUnauthorized()
    throw new Error('Unauthorized')
  }

  return response
}
