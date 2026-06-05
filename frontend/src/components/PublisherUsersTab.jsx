import { useState, useEffect } from 'react'
import { apiFetch } from '../api.js'
import { StatusBadge } from './StatusBadge.jsx'
import { tableStyles } from '../styles/tables.js'
import { useDebounce } from '../hooks/useDebounce.js'
import PaginationControls from './PaginationControls.jsx'
import { formatDateTime } from '../utils/dateUtils.js'

export default function PublisherUsersTab({ publisherId }) {
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20
  const [search, setSearch] = useState('')
  const committedSearch = useDebounce(search, 300)
  const [accessFilter, setAccessFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => { setPage(1) }, [committedSearch, accessFilter, statusFilter])

  useEffect(() => {
    setLoading(true)
    setError('')
    const controller = new AbortController()
    let path = `/publishers/${publisherId}/users?page=${page}&limit=${limit}`
    if (committedSearch) path += `&search=${encodeURIComponent(committedSearch)}`
    if (accessFilter) path += `&user_access=${encodeURIComponent(accessFilter)}`
    if (statusFilter) path += `&active=${statusFilter}`
    apiFetch(path, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        setUsers(data.users ?? [])
        setTotal(data.total ?? 0)
        setLoading(false)
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        if (err.message !== 'Unauthorized') setError('Failed to load users.')
        setLoading(false)
      })
    return () => controller.abort()
  }, [publisherId, page, committedSearch, accessFilter, statusFilter])

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <div style={s.controls}>
        <input
          style={s.searchInput}
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={s.select} value={accessFilter} onChange={e => setAccessFilter(e.target.value)}>
          <option value="">All Access</option>
          <option value="Console">Console</option>
          <option value="API">API</option>
        </select>
        <select style={s.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {error && <p style={s.error}>{error}</p>}
      {loading && <p style={s.muted}>Loading…</p>}

      {!loading && !error && (
        <>
          {users.length === 0
            ? <p style={s.muted}>No users found.</p>
            : (
              <div style={tableStyles.tableWrapper}>
                <table style={tableStyles.table}>
                  <thead>
                    <tr>
                      <th style={tableStyles.th}>ID</th>
                      <th style={tableStyles.th}>Name</th>
                      <th style={tableStyles.th}>Email</th>
                      <th style={tableStyles.th}>Type</th>
                      <th style={tableStyles.th}>Access</th>
                      <th style={tableStyles.th}>Status &amp; Last Login</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => (
                      <tr key={u.id} style={i % 2 !== 0 ? tableStyles.rowAlt : undefined}>
                        <td style={tableStyles.td}><span style={s.idTag}>{u.id}</span></td>
                        <td style={tableStyles.td}>{u.first_name} {u.last_name}</td>
                        <td style={tableStyles.td}>{u.email}</td>
                        <td style={tableStyles.td}>{u.user_type}</td>
                        <td style={tableStyles.td}>{u.user_access}</td>
                        <td style={tableStyles.td}>
                          <StatusBadge active={u.active} />
                          <div style={s.lastLogin}>{formatDateTime(u.last_login)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
          <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}

const s = {
  controls: { display: 'flex', gap: '0.75rem', marginBottom: '1rem' },
  searchInput: { flex: 1, maxWidth: 280, padding: '0.4375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', color: '#111827', outline: 'none' },
  select: { padding: '0.4375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', color: '#111827', background: '#fff', cursor: 'pointer' },
  idTag: { color: '#6b7280', fontWeight: 400 },
  lastLogin: { fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' },
  error: { color: '#dc2626', fontSize: '0.875rem' },
  muted: { color: '#6b7280', fontSize: '0.875rem' },
}
