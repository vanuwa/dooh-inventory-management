import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { setUnauthorizedHandler } from '../api.js'
import { readApiEnv, scopedKey, writeApiEnv } from '../utils/apiEnvironment.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [apiEnv] = useState(readApiEnv)
  const [tokens, setTokens] = useState(() => ({
    accessToken: localStorage.getItem(scopedKey('access_token', apiEnv)),
    refreshToken: localStorage.getItem(scopedKey('refresh_token', apiEnv)),
  }))

  const logout = useCallback(() => {
    const env = readApiEnv()
    localStorage.removeItem(scopedKey('access_token', env))
    localStorage.removeItem(scopedKey('refresh_token', env))
    setTokens({ accessToken: null, refreshToken: null })
  }, [])

  const login = useCallback((accessToken, refreshToken) => {
    const env = readApiEnv()
    localStorage.setItem(scopedKey('access_token', env), accessToken)
    localStorage.setItem(scopedKey('refresh_token', env), refreshToken)
    setTokens({ accessToken, refreshToken })
  }, [])

  // A full page load rather than a state update: in-flight requests and cached
  // page state carry IDs that mean nothing in the other environment.
  const switchApiEnv = useCallback(name => {
    writeApiEnv(name)
    window.location.assign('/recent')
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
  }, [logout])

  return (
    <AuthContext.Provider
      value={{ ...tokens, isAuthenticated: !!tokens.accessToken, login, logout, apiEnv, switchApiEnv }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
