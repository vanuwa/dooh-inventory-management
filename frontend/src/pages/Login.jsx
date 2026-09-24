import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { API_ENVIRONMENTS } from '../constants/apiEnvironments.js'
import { readApiEnv, writeApiEnv } from '../utils/apiEnvironment.js'

export default function Login() {
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Layout (and its switcher) is not rendered on /login, so the form carries its
  // own selector. Local state rather than switchApiEnv: that one reloads the page,
  // which would wipe a half-typed form.
  const [apiEnv, setApiEnv] = useState(() => readApiEnv())
  const apiEnvHost = API_ENVIRONMENTS.find(e => e.name === apiEnv)?.host

  if (isAuthenticated) return <Navigate to="/recent" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Env': readApiEnv() },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        setError('Invalid credentials. Please try again.')
        return
      }
      const data = await res.json()
      login(data.access_token, data.refresh_token)
      navigate('/recent', { replace: true })
    } catch {
      setError('Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>DOOH Inventory Management</h1>
        <form onSubmit={handleSubmit} style={s.form}>
          <label style={s.label} htmlFor="api-env">Environment</label>
          <select
            id="api-env"
            style={s.input}
            value={apiEnv}
            onChange={e => {
              setApiEnv(e.target.value)
              writeApiEnv(e.target.value)
            }}
          >
            {API_ENVIRONMENTS.map(env => (
              <option key={env.name} value={env.name}>{env.label}</option>
            ))}
          </select>
          {apiEnvHost && <p style={s.hostNote}>{apiEnvHost}</p>}
          <label style={s.label}>Username</label>
          <input
            style={s.input}
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            required
            autoFocus
          />
          <label style={s.label}>Password</label>
          <input
            style={s.input}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <p style={s.error}>{error}</p>}
          <button style={s.button} type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

const s = {
  page: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f0f2f5' },
  card: { background: '#fff', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', width: '100%', maxWidth: '360px' },
  title: { margin: '0 0 1.5rem', fontSize: '1.125rem', fontWeight: 600, textAlign: 'center', color: '#1a1a2e' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  label: { fontSize: '0.8125rem', fontWeight: 500, color: '#444', marginTop: '0.5rem' },
  input: { padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.9375rem', outline: 'none' },
  hostNote: { margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#6b7280' },
  error: { margin: '0.25rem 0 0', fontSize: '0.8125rem', color: '#dc2626' },
  button: { marginTop: '1.25rem', padding: '0.625rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.9375rem', cursor: 'pointer', fontWeight: 500 },
}
