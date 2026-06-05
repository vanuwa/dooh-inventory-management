import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

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

export default function Layout({ user, children }) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ')

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.headerLeft}>
          <img src="/icon.png" alt="Brain Juice" title="Brain Juice" style={{ width: 42, height: 42, flexShrink: 0 }} />
          <span style={s.headerTitle}>DOOH Inventory Management</span>
          <nav style={s.nav}>
            <Link to="/recent" style={s.navLink}>Recent</Link>
            <Link to="/publishers" style={s.navLink}>Publishers</Link>
          </nav>
        </div>
        <div style={s.headerRight}>
          {user && (
            <>
              <UserAvatar />
              <Link to="/user" style={s.userName}>{fullName}</Link>
              <span style={s.vDivider} />
            </>
          )}
          <button style={s.logoutBtn} onClick={handleLogout}>Logout</button>
        </div>
      </header>
      {children}
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
  headerLeft: { display: 'flex', alignItems: 'center', gap: '1.5rem' },
  headerTitle: { fontWeight: 600, fontSize: '0.9375rem', letterSpacing: '0.01em' },
  nav: { display: 'flex', gap: '1rem' },
  navLink: { color: '#e2e8f0', fontSize: '0.875rem', textDecoration: 'none', fontWeight: 500 },
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
  userName: { fontSize: '0.875rem', color: '#e2e8f0', fontWeight: 500, textDecoration: 'none' },
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
}
