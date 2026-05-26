import { useState, useEffect } from 'react'
import { apiFetch } from '../api.js'
import Layout from '../components/Layout.jsx'

const badge = {
  display: 'inline-block',
  padding: '0.2rem 0.6rem',
  borderRadius: 999,
  fontSize: '0.8rem',
  fontWeight: 500,
}

function StatusBadge({ active }) {
  const style = active
    ? { ...badge, background: '#dcfce7', color: '#15803d' }
    : { ...badge, background: '#f3f4f6', color: '#6b7280' }
  return <span style={style}>{active ? 'Active' : 'Inactive'}</span>
}

export default function Placements() {
  const [user, setUser] = useState(null)
  const [rows, setRows] = useState([])
  const [totalPublishers, setTotalPublishers] = useState(0)
  const [page, setPage] = useState(1)
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
    setLoading(true)
    setError('')
    apiFetch(`/placements?page=${page}&limit=${limit}`)
      .then(res => res.json())
      .then(data => {
        setRows(data.rows ?? [])
        setTotalPublishers(data.total_publishers ?? 0)
        setLoading(false)
      })
      .catch(err => {
        if (err.message !== 'Unauthorized') setError('Failed to load placements.')
        setLoading(false)
      })
  }, [page])

  const totalPages = Math.ceil(totalPublishers / limit)

  return (
    <Layout user={user}>
      <main style={s.main}>
        {error && <p style={s.error}>{error}</p>}
        {loading && <p style={s.muted}>Loading placements…</p>}

        {!loading && !error && rows.length === 0 && (
          <p style={s.muted}>No placements found.</p>
        )}

        {!loading && rows.length > 0 && (
          <>
            <div style={s.tableWrapper}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Publisher</th>
                    <th style={s.th}>Publisher Status</th>
                    <th style={s.th}>Placement</th>
                    <th style={s.th}>Placement Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.placement_id} style={i % 2 !== 0 ? s.rowAlt : undefined}>
                      <td style={s.td}><span style={s.idTag}>#{row.publisher_id}</span>{' '}{row.publisher_name}</td>
                      <td style={s.td}><StatusBadge active={row.publisher_status} /></td>
                      <td style={s.td}><span style={s.idTag}>#{row.placement_id}</span>{' '}{row.placement_name}</td>
                      <td style={s.td}><StatusBadge active={row.placement_status} /></td>
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
