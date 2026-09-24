import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { setUnauthorizedHandler } from '../api.js'
import {
  API_ENV_KEY,
  readApiEnv,
  readScoped,
  removeScoped,
  writeApiEnv,
  writeScoped,
} from '../utils/apiEnvironment.js'

const AuthContext = createContext(null)

function readTokens(env) {
  return {
    accessToken: readScoped('access_token', env),
    refreshToken: readScoped('refresh_token', env),
  }
}

export function AuthProvider({ children }) {
  // A mirror of the stored selection, never a shadow of it: every other consumer
  // (api.js, useRecentActivity) re-reads storage per call, so the chrome must never
  // name an environment the requests are not actually going to.
  const [apiEnv, setApiEnv] = useState(readApiEnv)
  const [tokens, setTokens] = useState(() => readTokens(readApiEnv()))

  const logout = useCallback(() => {
    removeScoped('access_token', apiEnv)
    removeScoped('refresh_token', apiEnv)
    setTokens({ accessToken: null, refreshToken: null })
  }, [apiEnv])

  const login = useCallback((accessToken, refreshToken) => {
    writeScoped('access_token', apiEnv, accessToken)
    writeScoped('refresh_token', apiEnv, refreshToken)
    setTokens({ accessToken, refreshToken })
  }, [apiEnv])

  // Persist first, then mirror whatever actually took: a blocked store keeps the old
  // value, and reflecting that is what stops the header claiming one environment while
  // requests go to another. Returns the environment now in effect.
  const selectApiEnv = useCallback(name => {
    writeApiEnv(name)
    const applied = readApiEnv()
    setApiEnv(applied)
    setTokens(readTokens(applied))
    return applied
  }, [])

  // A full page load rather than a state update: in-flight requests and cached
  // page state carry IDs that mean nothing in the other environment. Skipped when the
  // selection did not take, since the reload would land back in the same environment.
  const switchApiEnv = useCallback(name => {
    if (selectApiEnv(name) !== name) return
    window.location.assign('/recent')
  }, [selectApiEnv])

  // localStorage is shared by every tab, so another tab's switch silently redirects
  // this tab's requests too. Force the same reload rather than leave production chrome
  // over an acceptance session.
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== API_ENV_KEY) return
      if (readApiEnv() !== apiEnv) window.location.assign('/recent')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [apiEnv])

  useEffect(() => {
    setUnauthorizedHandler(logout)
  }, [logout])

  return (
    <AuthContext.Provider
      value={{
        ...tokens,
        isAuthenticated: !!tokens.accessToken,
        login,
        logout,
        apiEnv,
        selectApiEnv,
        switchApiEnv,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
