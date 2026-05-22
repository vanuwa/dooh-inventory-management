import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiFetch } from '../api.js'

function UserAvatar() {
  return (
    <span style={s.avatarCircle}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" fill="white" />
        <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function RolePill({ label }) {
  return <span style={s.pill}>{label}</span>
}

export default function Dashboard() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch('/user/details')
      .then(res => res.json())
      .then(setUser)
      .catch(err => {
        if (err.message !== 'Unauthorized') setError('Failed to load user details.')
      })
  }, [])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const fullName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ')
    : ''

  const bunit = user?.business_unit_id != null
    ? { id: user.business_unit_id, name: user.business_unit_name }
    : null

  const roles = (user?.user_roles ?? []).map(r =>
    typeof r === 'string' ? r : (r?.name ?? String(r))
  )

  return (
    <div style={s.page}>
      <header style={s.header}>
        <span style={s.headerTitle}>DOOH Inventory Management</span>
        <div style={s.headerRight}>
          {user && (
            <>
              <UserAvatar />
              <span style={s.userName}>{fullName}</span>
              <span style={s.vDivider} />
            </>
          )}
          <button style={s.logoutBtn} onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main style={s.main}>
        {error && <p style={s.error}>{error}</p>}
        {!user && !error && <p style={s.muted}>Loading…</p>}

        {user && (
          <>
            <h2 style={s.welcome}>Welcome, {user.first_name}!</h2>

            <div style={s.card}>
              <div style={s.row}>
                <span style={s.label}>Business Unit</span>
                <span style={s.value}>
                  {bunit
                    ? <><span style={s.bunitId}>#{bunit.id}</span>{' '}{bunit.name}</>
                    : <span style={s.empty}>—</span>}
                </span>
              </div>

              <div style={s.separator} />

              <div style={s.row}>
                <span style={s.label}>Roles</span>
                {roles.length > 0
                  ? <div style={s.pillRow}>{roles.map((r, i) => <RolePill key={i} label={r} />)}</div>
                  : <span style={s.empty}>—</span>}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f0f2f5' },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 1.5rem',
    height: 56,
    background: '#1a1a2e',
    color: '#fff',
  },
  headerTitle: { fontWeight: 600, fontSize: '0.9375rem', letterSpacing: '0.01em' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '0.625rem' },
  avatarCircle: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
    flexShrink: 0,
  },
  userName: { fontSize: '0.875rem', color: '#e2e8f0', fontWeight: 500 },
  vDivider: { display: 'inline-block', width: 1, height: 20, background: 'rgba(255,255,255,0.2)' },
  logoutBtn: {
    padding: '0.375rem 0.875rem',
    background: 'transparent',
    color: '#e2e8f0',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: '0.8125rem',
  },

  main: { padding: '2.5rem 1.5rem', maxWidth: 680, margin: '0 auto' },
  welcome: { margin: '0 0 1.75rem', fontSize: '1.625rem', fontWeight: 700, color: '#1a1a2e' },

  card: {
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    padding: '1.125rem 1.375rem',
  },
  separator: { height: 1, background: '#f3f4f6' },
  label: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: '#9ca3af',
  },
  value: { fontSize: '0.9375rem', color: '#111827', fontWeight: 500 },
  bunitId: { color: '#6b7280', fontWeight: 400 },
  empty: { color: '#9ca3af' },

  pillRow: { display: 'flex', flexWrap: 'wrap', gap: '0.375rem' },
  pill: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    background: '#eef2ff',
    color: '#4338ca',
    borderRadius: 999,
    fontSize: '0.8125rem',
    fontWeight: 500,
    letterSpacing: '0.01em',
  },

  error: { color: '#dc2626', fontSize: '0.875rem' },
  muted: { color: '#6b7280', fontSize: '0.875rem' },
}
