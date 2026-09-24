import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { setUnauthorizedHandler } from '../api.js'
import {
  ACCESS_TOKEN_KEY,
  API_ENV_KEY,
  REFRESH_TOKEN_KEY,
  isKnownApiEnv,
  readApiEnv,
  readScoped,
  removeScoped,
  writeApiEnv,
  writeScoped,
} from '../utils/apiEnvironment.js'

const AuthContext = createContext(null)

function readTokens(env) {
  return {
    accessToken: readScoped(ACCESS_TOKEN_KEY, env),
    refreshToken: readScoped(REFRESH_TOKEN_KEY, env),
  }
}

export function AuthProvider({ children }) {
  // A mirror of the stored selection, never a shadow of it: every other consumer
  // (api.js, useRecentActivity) re-reads storage per call, so the chrome must never
  // name an environment the requests are not actually going to.
  const [apiEnv, setApiEnv] = useState(readApiEnv)
  const [tokens, setTokens] = useState(() => readTokens(readApiEnv()))

  // Clears the tokens of the environment the caller names — api.js passes the one its
  // failing request actually used — and falls back to the live stored selection, never
  // to the apiEnv mirror: another tab's switch redirects requests before this tab's
  // state catches up, and clearing the wrong slot would end the other session silently.
  const logout = useCallback(env => {
    const target = isKnownApiEnv(env) ? env : readApiEnv()
    removeScoped(ACCESS_TOKEN_KEY, target)
    removeScoped(REFRESH_TOKEN_KEY, target)
    setTokens({ accessToken: null, refreshToken: null })
  }, [])

  const login = useCallback((accessToken, refreshToken) => {
    writeScoped(ACCESS_TOKEN_KEY, apiEnv, accessToken)
    writeScoped(REFRESH_TOKEN_KEY, apiEnv, refreshToken)
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
  // this tab's requests too. Mirror the new selection before reloading — the reload is
  // not instant, and until it lands the header would otherwise keep naming the
  // environment the requests have already left — then reload for the same reason a
  // local switch does: cached page state carries IDs from the old instance.
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== API_ENV_KEY) return
      const applied = readApiEnv()
      if (applied === apiEnv) return
      setApiEnv(applied)
      setTokens(readTokens(applied))
      window.location.assign('/recent')
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
