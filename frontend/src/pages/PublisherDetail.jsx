import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'
import { apiFetch } from '../api.js'
import { useRecentActivity } from '../hooks/useRecentActivity.js'
import Layout from '../components/Layout.jsx'
import { StatusBadge } from '../components/StatusBadge.jsx'
import BulkUploadJobsTab from '../components/BulkUploadJobsTab.jsx'
import PublisherUsersTab from '../components/PublisherUsersTab.jsx'
import ReportingTab from '../components/ReportingTab.jsx'
import { tabStyles } from '../styles/tabs.js'
import { tableStyles } from '../styles/tables.js'
import { useDebounce } from '../hooks/useDebounce.js'
import PaginationControls from '../components/PaginationControls.jsx'

const TABS = [
  { key: 'placements',       label: 'Placements' },
  { key: 'bulk-upload-jobs', label: 'Bulk Upload Jobs' },
  { key: 'users',            label: 'Users' },
  { key: 'reporting',        label: 'Reporting' },
]

export default function PublisherDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const activeTab = TABS.find(t => location.pathname.endsWith('/' + t.key))?.key ?? 'placements'

  const { recordVisit } = useRecentActivity()

  const [user, setUser] = useState(null)
  const [publisher, setPublisher] = useState(null)
  const [placements, setPlacements] = useState([])
  const [placementTotal, setPlacementTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [placementsLoading, setPlacementsLoading] = useState(false)
  const [error, setError] = useState('')
  const [placementsError, setPlacementsError] = useState('')
  const [placementSearch, setPlacementSearch] = useState('')
  const committedSearch = useDebounce(placementSearch, 300)
  const [placementActiveFilter, setPlacementActiveFilter] = useState('')
  const [placementPage, setPlacementPage] = useState(1)
  const placementsLimit = 20

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
    apiFetch(`/publishers/${id}`, { signal: controller.signal })
      .then(res => res.json())
      .then(pubData => {
        setPublisher(pubData)
        setLoading(false)
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        if (err.message !== 'Unauthorized') setError('Failed to load publisher.')
        setLoading(false)
      })
    return () => controller.abort()
  }, [id])

  useEffect(() => { setPlacementPage(1) }, [committedSearch])

  useEffect(() => {
    if (activeTab !== 'placements') return
    setPlacementsLoading(true)
    setPlacementsError('')
    let path = `/publishers/${id}/placements?page=${placementPage}&limit=${placementsLimit}`
    if (committedSearch) path += `&search=${encodeURIComponent(committedSearch)}`
    if (placementActiveFilter !== '') path += `&active=${placementActiveFilter}`
    const controller = new AbortController()
    apiFetch(path, { signal: controller.signal })
      .then(res => res.json())
      .then(plData => {
        setPlacements(plData.placements ?? [])
        setPlacementTotal(plData.total ?? 0)
        setPlacementsLoading(false)
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        if (err.message !== 'Unauthorized') {
          setPlacementsError('Failed to load placements.')
          setPlacements([])
        }
        setPlacementsLoading(false)
      })
    return () => controller.abort()
  }, [id, activeTab, placementPage, committedSearch, placementActiveFilter])

  useEffect(() => {
    if (!publisher) return
    const url = activeTab === 'placements'
      ? `/publishers/${id}`
      : `/publishers/${id}/${activeTab}`
    recordVisit({ url, pageType: activeTab, publisher: { name: publisher.name, id } })
  }, [publisher, activeTab])

  const placementTotalPages = Math.ceil(placementTotal / placementsLimit)

  function handleTabClick(tab) {
    navigate(`/publishers/${id}/${tab}`)
  }

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
              <span style={s.cardId}>{id}</span>
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
            <div style={tabStyles.tabBar}>
              {TABS.map(t => (
                <button
                  key={t.key}
                  style={activeTab === t.key ? tabStyles.tabActive : tabStyles.tab}
                  onClick={() => handleTabClick(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === 'placements' && (
              <>
                {placementsLoading && <p style={s.muted}>Loading…</p>}
                {placementsError && <p style={s.error}>{placementsError}</p>}
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
                    onChange={e => { setPlacementActiveFilter(e.target.value); setPlacementPage(1) }}
                  >
                    <option value="">All</option>
                    <option value="true">Active only</option>
                    <option value="false">Inactive only</option>
                  </select>
                </div>

                {!placementsLoading && placements.length === 0
                  ? <p style={s.muted}>No placements found.</p>
                  : !placementsLoading && (
                    <>
                      <div style={s.tableWrapper}>
                        <table style={s.table}>
                          <thead>
                            <tr>
                              <th style={s.th}>ID</th>
                              <th style={s.th}>Name</th>
                              <th style={s.th}>Type</th>
                              <th style={s.th}>Site</th>
                              <th style={s.th}>Platform</th>
                              <th style={s.th}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {placements.map((pl, i) => (
                              <tr
                                key={pl.id}
                                className="clickable-row"
                                style={i % 2 !== 0 ? s.rowAlt : undefined}
                                onClick={() => navigate('/publishers/' + id + '/placements/' + pl.id, { state: { placement: pl, publisherName: publisher?.name } })}
                              >
                                <td style={s.td}><span style={s.idTag}>{pl.id}</span></td>
                                <td style={s.td}>{pl.name}</td>
                                <td style={s.td}>{pl.placement_type || '—'}</td>
                                <td style={s.td}>{pl.inventory_name ? `${pl.inventory_name} (${pl.inventory_id})` : '—'}</td>
                                <td style={s.td}>{pl.inventory_platform_type_name || '—'}</td>
                                <td style={s.td}><StatusBadge active={pl.placement_status} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <PaginationControls page={placementPage} totalPages={placementTotalPages} onPageChange={setPlacementPage} />
                    </>
                  )
                }
              </>
            )}

            {activeTab === 'bulk-upload-jobs' && <BulkUploadJobsTab publisherId={id} />}

            {activeTab === 'users' && <PublisherUsersTab publisherId={id} publisherName={publisher?.name} />}

            {activeTab === 'reporting' && (
              <ReportingTab
                previewUrl={`/report/publisher/${id}`}
                generateUrl={`/report/generate/publisher/${id}`}
              />
            )}
          </>
        )}
      </main>
    </Layout>
  )
}

const s = {
  ...tableStyles,
  main: { padding: '2.5rem 1.5rem', maxWidth: '100%', margin: '0 auto' },
  backLink: { display: 'inline-block', marginBottom: '1.5rem', color: '#4338ca', fontSize: '0.875rem', textDecoration: 'none', fontWeight: 500 },

  card: { background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden', marginBottom: '2rem' },
  cardHeader: { display: 'flex', alignItems: 'baseline', gap: '0.625rem', padding: '1.125rem 1.375rem', borderBottom: '1px solid #f3f4f6' },
  cardTitle: { margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#111827' },
  cardId: { fontSize: '0.875rem', color: '#6b7280', fontWeight: 400 },
  cardBody: { padding: '0.25rem 0' },
  cardRow: { display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.625rem 1.375rem', borderBottom: '1px solid #f9fafb' },
  cardLabel: { fontSize: '0.8125rem', color: '#6b7280', fontWeight: 500, minWidth: 120 },
  cardValue: { fontSize: '0.9rem', color: '#111827' },

  controls: { display: 'flex', gap: '0.75rem', marginBottom: '1rem' },
  searchInput: { flex: 1, maxWidth: 280, padding: '0.4375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', color: '#111827', outline: 'none' },
  select: { padding: '0.4375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', color: '#111827', background: '#fff', cursor: 'pointer' },

  idTag: { color: '#6b7280', fontWeight: 400 },

  error: { color: '#dc2626', fontSize: '0.875rem' },
  muted: { color: '#6b7280', fontSize: '0.875rem' },
}
