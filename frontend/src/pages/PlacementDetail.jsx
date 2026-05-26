import { useState, useEffect } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { apiFetch } from '../api.js'
import Layout from '../components/Layout.jsx'

export default function PlacementDetail() {
  const { publisherId, placementId } = useParams()
  const location = useLocation()
  const placementName = location.state?.placement?.name ?? `Placement ${placementId}`

  const [user, setUser] = useState(null)
  const [doohSettings, setDoohSettings] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [committedSearch, setCommittedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const limit = 20

  useEffect(() => {
    apiFetch('/user/details')
      .then(res => res.json())
      .then(setUser)
      .catch(() => {})
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setCommittedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setLoading(true)
    setError('')
    let path = `/publishers/${publisherId}/placements/${placementId}/dooh-settings?page=${page}&limit=${limit}`
    if (committedSearch) path += `&search=${encodeURIComponent(committedSearch)}`

    const controller = new AbortController()
    apiFetch(path, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        setDoohSettings(data.dooh_settings ?? [])
        setTotal(data.total ?? 0)
        setLoading(false)
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        if (err.message !== 'Unauthorized') {
          setError('Failed to load screens.')
          setDoohSettings([])
        }
        setLoading(false)
      })
    return () => controller.abort()
  }, [publisherId, placementId, page, committedSearch])

  const totalPages = Math.ceil(total / limit)

  function fmt(v, fallback = '—') {
    return v || fallback
  }

  return (
    <Layout user={user}>
      <main style={s.main}>
        <Link to={'/publishers/' + publisherId} style={s.backLink}>← Publisher</Link>

        <div style={s.heading}>
          <h2 style={s.title}>{placementName}</h2>
          <span style={s.subtitle}>Screens (DOOH Settings)</span>
        </div>

        {error && <p style={s.error}>{error}</p>}

        <div style={s.controls}>
          <input
            style={s.searchInput}
            type="text"
            placeholder="Search screens…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading && <p style={s.muted}>Loading screens…</p>}

        {!loading && !error && doohSettings.length === 0 && (
          <p style={s.muted}>No screens found.</p>
        )}

        {!loading && doohSettings.length > 0 && (
          <>
            <div style={s.tableWrapper}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>ID</th>
                    <th style={s.th}>Player ID</th>
                    <th style={s.th}>Device ID</th>
                    <th style={s.th}>Orientation</th>
                    <th style={s.th}>Resolution</th>
                    <th style={s.th}>Physical Size</th>
                    <th style={s.th}>Venue Type</th>
                    <th style={s.th}>Country</th>
                    <th style={s.th}>City</th>
                    <th style={s.th}>Region</th>
                    <th style={s.th}>Zip</th>
                    <th style={s.th}>Address</th>
                    <th style={s.th}>Duration</th>
                    <th style={s.th}>CPM</th>
                    <th style={s.th}>Avg Weekly Audience</th>
                    <th style={s.th}>Allowed Content</th>
                  </tr>
                </thead>
                <tbody>
                  {doohSettings.map((sc, i) => {
                    const resolution = sc.resolution_width && sc.resolution_height
                      ? `${sc.resolution_width}×${sc.resolution_height}`
                      : '—'
                    const physicalSize = sc.width && sc.height
                      ? `${sc.width}×${sc.height}`
                      : '—'
                    const venueType = sc.venue_type_id
                      ? `${sc.venue_type_id}${sc.venue_type_tax ? ` (${sc.venue_type_tax})` : ''}`
                      : '—'
                    const duration = sc.min_duration || sc.max_duration
                      ? `${sc.min_duration}s – ${sc.max_duration}s`
                      : '—'
                    const cpm = sc.cpm != null
                      ? `${sc.cpm.toFixed(2)}${sc.currency_code ? ` ${sc.currency_code}` : ''}`
                      : '—'
                    const audience = sc.avg_weekly_audience != null
                      ? sc.avg_weekly_audience.toLocaleString()
                      : '—'
                    return (
                      <tr key={sc.id} style={i % 2 !== 0 ? s.rowAlt : undefined}>
                        <td style={s.td}><span style={s.idTag}>{sc.id}</span></td>
                        <td style={s.td}>{fmt(sc.player_id)}</td>
                        <td style={s.td}>{fmt(sc.device_id)}</td>
                        <td style={s.td}>{fmt(sc.orientation)}</td>
                        <td style={s.td}>{resolution}</td>
                        <td style={s.td}>{physicalSize}</td>
                        <td style={s.td}>{venueType}</td>
                        <td style={s.td}>{fmt(sc.country_code)}</td>
                        <td style={s.td}>{fmt(sc.city)}</td>
                        <td style={s.td}>{fmt(sc.region)}</td>
                        <td style={s.td}>{fmt(sc.zip)}</td>
                        <td style={s.td}>{fmt(sc.address)}</td>
                        <td style={s.td}>{duration}</td>
                        <td style={s.td}>{cpm}</td>
                        <td style={s.td}>{audience}</td>
                        <td style={s.td}>{fmt(sc.allowed_content)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={s.pagination}>
              <button style={s.pageBtn} onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                Prev
              </button>
              <span style={s.pageInfo}>Page {page}{totalPages > 0 ? ` of ${totalPages}` : ''}</span>
              <button style={s.pageBtn} onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
                Next
              </button>
            </div>
          </>
        )}
      </main>
    </Layout>
  )
}

const s = {
  main: { padding: '2.5rem 1.5rem', maxWidth: '100%', margin: '0 auto' },
  backLink: { display: 'inline-block', marginBottom: '1rem', color: '#4338ca', fontSize: '0.875rem', textDecoration: 'none', fontWeight: 500 },

  heading: { marginBottom: '1.5rem' },
  title: { margin: '0 0 0.25rem', fontSize: '1.25rem', fontWeight: 700, color: '#111827' },
  subtitle: { fontSize: '0.875rem', color: '#6b7280' },

  controls: { display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' },
  searchInput: {
    flex: 1,
    maxWidth: 320,
    padding: '0.4375rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize: '0.875rem',
    color: '#111827',
    outline: 'none',
  },

  tableWrapper: { overflowX: 'auto' },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: '#fff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  th: {
    padding: '0.75rem 1rem',
    background: '#f9fafb',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: '#6b7280',
    textAlign: 'left',
    borderBottom: '1px solid #e5e7eb',
    whiteSpace: 'nowrap',
    minWidth: 110,
  },
  td: { padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#111827', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' },
  rowAlt: { background: '#fafafa' },
  idTag: { color: '#6b7280', fontWeight: 400 },

  pagination: { display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' },
  pageBtn: {
    padding: '0.375rem 0.875rem',
    background: '#1a1a2e',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: '0.8125rem',
  },
  pageInfo: { fontSize: '0.875rem', color: '#6b7280' },

  error: { color: '#dc2626', fontSize: '0.875rem' },
  muted: { color: '#6b7280', fontSize: '0.875rem' },
}
