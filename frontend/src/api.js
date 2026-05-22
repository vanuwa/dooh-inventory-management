let onUnauthorized = null

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

export async function apiFetch(path, options = {}) {
  const accessToken = localStorage.getItem('access_token')
  const refreshToken = localStorage.getItem('refresh_token')

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (accessToken) headers['X-Access-Token'] = accessToken
  if (refreshToken) headers['X-Refresh-Token'] = refreshToken

  const response = await fetch('/api' + path, { ...options, headers })

  const newAccessToken = response.headers.get('X-New-Access-Token')
  const newRefreshToken = response.headers.get('X-New-Refresh-Token')
  if (newAccessToken) {
    localStorage.setItem('access_token', newAccessToken)
    if (newRefreshToken) localStorage.setItem('refresh_token', newRefreshToken)
  }

  if (response.status === 401) {
    if (onUnauthorized) onUnauthorized()
    throw new Error('Unauthorized')
  }

  return response
}
