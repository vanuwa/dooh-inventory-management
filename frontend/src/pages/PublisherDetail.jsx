import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiFetch } from '../api.js'
import Layout from '../components/Layout.jsx'
import { StatusBadge } from '../components/StatusBadge.jsx'

export default function PublisherDetail() {
  const { id } = useParams()
  const [user, setUser] = useState(null)
  const [publisher, setPublisher] = useState(null)
  const [placements, setPlacements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [placementSearch, setPlacementSearch] = useState('')
  const [placementActiveFilter, setPlacementActiveFilter] = useState('')

  useEffect(() => {
    apiFetch('/user/details')
      .then(res => res.json())
      .then(setUser)
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    setError('')
    setPublisher(null)
    setPlacements([])
    const controller = new AbortController()
    const signal = controller.signal
    Promise.all([
      apiFetch(`/publishers/${id}`, { signal }).then(res => res.json()),
      apiFetch(`/publishers/${id}/placements`, { signal }).then(res => res.json()),
    ])
      .then(([pubData, plData]) => {
        setPublisher(pubData)
        setPlacements(plData.placements ?? [])
        setLoading(false)
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        if (err.message !== 'Unauthorized') setError('Failed to load publisher.')
        setLoading(false)
      })
    return () => controller.abort()
  }, [id])

  const lowerSearch = placementSearch.toLowerCase()
  const visiblePlacements = placements.filter(pl => {
    if (placementActiveFilter === 'true' && !pl.placement_status) return false
    if (placementActiveFilter === 'false' && pl.placement_status) return false
    if (lowerSearch && !pl.name.toLowerCase().includes(lowerSearch)) return false
    return true
  })

  return (
    <Layout user={user}>
      <main style={s.main}>
        <Link to="/publishers" style={s.backLink}>← Publishers</Link>

        {error && <p style={s.error}>{error}</p>}
        {loading && <p style={s.muted}>Loading…</p>}

        {!loading && publisher && (
          <div style={s.card}>
            <div style={s.cardHeader}>
              <h2 style={s.cardTitle}>{publisher.name}</h2>
              <span style={s.cardId}>#{id}</span>
            </div>
            <div style={s.cardBody}>
              {publisher.active !== undefined && (
                <div style={s.cardRow}>
                  <span style={s.cardLabel}>Status</span>
                  <StatusBadge active={publisher.active} />
                </div>
              )}
              {publisher.business_unit_name && (
                <div style={s.cardRow}>
                  <span style={s.cardLabel}>Business Unit</span>
                  <span style={s.cardValue}>{publisher.business_unit_name}</span>
                </div>
              )}
              {publisher.azerion_owned !== undefined && (
                <div style={s.cardRow}>
                  <span style={s.cardLabel}>Business Type</span>
                  <span style={s.cardValue}>{publisher.azerion_owned ? 'Azerion Owned' : 'Third Party'}</span>
                </div>
              )}
              {publisher.seller_type && (
                <div style={s.cardRow}>
                  <span style={s.cardLabel}>Seller Type</span>
                  <span style={s.cardValue}>{publisher.seller_type}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && (
          <>
            <h3 style={s.sectionTitle}>Placements</h3>

            <div style={s.controls}>
              <input
                style={s.searchInput}
                type="text"
                placeholder="Search placements…"
                value={placementSearch}
                onChange={e => setPlacementSearch(e.target.value)}
              />
              <select
                style={s.select}
                value={placementActiveFilter}
                onChange={e => setPlacementActiveFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="true">Active only</option>
                <option value="false">Inactive only</option>
              </select>
            </div>

            {visiblePlacements.length === 0
              ? <p style={s.muted}>No placements found.</p>
              : (
                <div style={s.tableWrapper}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>ID</th>
                        <th style={s.th}>Name</th>
                        <th style={s.th}>Creative Type</th>
                        <th style={s.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePlacements.map((pl, i) => (
                        <tr key={pl.id} style={i % 2 !== 0 ? s.rowAlt : undefined}>
                          <td style={s.td}><span style={s.idTag}>#{pl.id}</span></td>
                          <td style={s.td}>{pl.name}</td>
                          <td style={s.td}>{pl.type || '—'}</td>
                          <td style={s.td}><StatusBadge active={pl.placement_status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </>
        )}
      </main>
    </Layout>
  )
}

const s = {
  main: { padding: '2.5rem 1.5rem', maxWidth: 960, margin: '0 auto' },
  backLink: { display: 'inline-block', marginBottom: '1.5rem', color: '#4338ca', fontSize: '0.875rem', textDecoration: 'none', fontWeight: 500 },

  card: {
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    overflow: 'hidden',
    marginBottom: '2rem',
  },
  cardHeader: { display: 'flex', alignItems: 'baseline', gap: '0.625rem', padding: '1.125rem 1.375rem', borderBottom: '1px solid #f3f4f6' },
  cardTitle: { margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#111827' },
  cardId: { fontSize: '0.875rem', color: '#6b7280', fontWeight: 400 },
  cardBody: { padding: '0.25rem 0' },
  cardRow: { display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.625rem 1.375rem', borderBottom: '1px solid #f9fafb' },
  cardLabel: { fontSize: '0.8125rem', color: '#6b7280', fontWeight: 500, minWidth: 120 },
  cardValue: { fontSize: '0.9rem', color: '#111827' },

  sectionTitle: { margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' },

  controls: { display: 'flex', gap: '0.75rem', marginBottom: '1rem' },
  searchInput: {
    flex: 1,
    maxWidth: 280,
    padding: '0.4375rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize: '0.875rem',
    color: '#111827',
    outline: 'none',
  },
  select: {
    padding: '0.4375rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize: '0.875rem',
    color: '#111827',
    background: '#fff',
    cursor: 'pointer',
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
  },
  td: { padding: '0.75rem 1rem', fontSize: '0.9rem', color: '#111827', borderBottom: '1px solid #f3f4f6' },
  rowAlt: { background: '#fafafa' },
  idTag: { color: '#6b7280', fontWeight: 400 },

  error: { color: '#dc2626', fontSize: '0.875rem' },
  muted: { color: '#6b7280', fontSize: '0.875rem' },
}
