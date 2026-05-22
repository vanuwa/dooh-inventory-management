import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { setUnauthorizedHandler } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [tokens, setTokens] = useState({
    accessToken: localStorage.getItem('access_token'),
    refreshToken: localStorage.getItem('refresh_token'),
  })

  const logout = useCallback(() => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setTokens({ accessToken: null, refreshToken: null })
  }, [])

  const login = useCallback((accessToken, refreshToken) => {
    localStorage.setItem('access_token', accessToken)
    localStorage.setItem('refresh_token', refreshToken)
    setTokens({ accessToken, refreshToken })
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
  }, [logout])

  return (
    <AuthContext.Provider value={{ ...tokens, isAuthenticated: !!tokens.accessToken, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
