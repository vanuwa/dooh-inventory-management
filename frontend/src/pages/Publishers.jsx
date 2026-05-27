import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api.js'
import Layout from '../components/Layout.jsx'
import { StatusBadge } from '../components/StatusBadge.jsx'

const badge = {
  display: 'inline-block',
  padding: '0.2rem 0.6rem',
  borderRadius: 999,
  fontSize: '0.8rem',
  fontWeight: 500,
}

function BusinessTypeBadge({ owned }) {
  const style = owned
    ? { ...badge, background: '#dbeafe', color: '#1d4ed8' }
    : { ...badge, background: '#f3f4f6', color: '#6b7280' }
  return <span style={style}>{owned ? 'Azerion Owned' : 'Third Party'}</span>
}

export default function Publishers() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [publishers, setPublishers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [committedSearch, setCommittedSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('true')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const limit = 20

  useEffect(() => {
    apiFetch('/user/details')
      .then(res => res.json())
      .then(setUser)
      .catch(() => {})
  }, [])

  // Debounce search: wait 300ms after user stops typing before fetching
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
    let path = `/publishers?page=${page}&limit=${limit}`
    if (committedSearch) path += `&search=${encodeURIComponent(committedSearch)}`
    if (activeFilter !== '') path += `&active=${activeFilter}`

    const controller = new AbortController()
    apiFetch(path, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        setPublishers(data.publishers ?? [])
        setTotal(data.total ?? 0)
        setLoading(false)
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        if (err.message !== 'Unauthorized') {
          setError('Failed to load publishers.')
          setPublishers([])
        }
        setLoading(false)
      })
    return () => controller.abort()
  }, [page, committedSearch, activeFilter])

  function handleActiveChange(e) {
    setActiveFilter(e.target.value)
    setPage(1)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <Layout user={user}>
      <main style={s.main}>
        {error && <p style={s.error}>{error}</p>}

        <div style={s.controls}>
          <input
            style={s.searchInput}
            type="text"
            placeholder="Search publishers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select style={s.select} value={activeFilter} onChange={handleActiveChange}>
            <option value="true">Active only</option>
            <option value="">All</option>
            <option value="false">Inactive only</option>
          </select>
        </div>

        {loading && <p style={s.muted}>Loading publishers…</p>}

        {!loading && !error && publishers.length === 0 && (
          <p style={s.muted}>No publishers found.</p>
        )}

        {!loading && publishers.length > 0 && (
          <>
            <div style={s.tableWrapper}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>ID</th>
                    <th style={s.th}>Name</th>
                    <th style={s.th}>Business Unit</th>
                    <th style={s.th}>Business Type</th>
                    <th style={s.th}>Seller Type</th>
                    <th style={s.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {publishers.map((pub, i) => (
                    <tr
                      key={pub.id}
                      className="clickable-row"
                      style={i % 2 !== 0 ? s.rowAlt : undefined}
                      onClick={() => navigate('/publishers/' + pub.id, { state: { publisher: pub } })}
                    >
                      <td style={s.td}><span style={s.idTag}>{pub.id}</span></td>
                      <td style={s.td}>{pub.name}</td>
                      <td style={s.td}>{pub.business_unit_name || '—'}</td>
                      <td style={s.td}><BusinessTypeBadge owned={pub.azerion_owned} /></td>
                      <td style={s.td}>{pub.seller_type || '—'}</td>
                      <td style={s.td}><StatusBadge active={pub.active} /></td>
                    </tr>
                  ))}
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
  main: { padding: '2.5rem 1.5rem' },

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
  rowAlt: { background: '#fafafa' },
  td: { padding: '0.75rem 1rem', fontSize: '0.9rem', color: '#111827', borderBottom: '1px solid #f3f4f6' },
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
