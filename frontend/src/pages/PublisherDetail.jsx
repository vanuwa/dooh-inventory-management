import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'
import { apiFetch } from '../api.js'
import Layout from '../components/Layout.jsx'
import { StatusBadge } from '../components/StatusBadge.jsx'
import BulkUploadJobsTab from '../components/BulkUploadJobsTab.jsx'
import { tabStyles } from '../styles/tabs.js'

const yesterdayStr = (() => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
})()

export default function PublisherDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const activeTab = location.pathname.endsWith('/bulk-upload-jobs')
    ? 'bulk-upload-jobs'
    : location.pathname.endsWith('/reporting')
      ? 'reporting'
      : 'placements'

  const [user, setUser] = useState(null)
  const [publisher, setPublisher] = useState(null)
  const [placements, setPlacements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [placementSearch, setPlacementSearch] = useState('')
  const [placementActiveFilter, setPlacementActiveFilter] = useState('')
  const [placementPage, setPlacementPage] = useState(1)
  const placementsPerPage = 20

  // reporting tab
  const [quickAlias, setQuickAlias] = useState('LAST_7_DAYS')
  const [dateRangeType, setDateRangeType] = useState('quick')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [reportColumns, setReportColumns] = useState([])
  const [reportRows, setReportRows] = useState([])
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reportLoaded, setReportLoaded] = useState(false)
  const [groupBy, setGroupBy] = useState('day')
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvError, setCsvError] = useState('')
  const csvAbortRef = useRef(false)

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

  useEffect(() => () => { csvAbortRef.current = true }, [])
  useEffect(() => { setReportRows([]); setReportLoaded(false) }, [groupBy])

  function buildDateRange() {
    return dateRangeType === 'quick'
      ? { quick: quickAlias }
      : { fixed: { start_date: customStart, end_date: customEnd } }
  }

  async function fetchReport() {
    setReportLoading(true)
    setReportError('')
    setCsvError('')
    const dateRange = buildDateRange()
    try {
      const res = await apiFetch(`/report/publisher/${id}`, {
        method: 'POST',
        body: JSON.stringify({ date_range: dateRange, group_by: groupBy }),
      })
      const data = await res.json()
      setReportColumns(data.column_order ?? [])
      setReportRows(data.rows ?? [])
      setReportLoaded(true)
    } catch (err) {
      if (err.message !== 'Unauthorized') setReportError('Failed to load report.')
      setReportLoaded(false)
    } finally {
      setReportLoading(false)
    }
  }

  async function downloadCSV() {
    csvAbortRef.current = false
    setCsvLoading(true)
    setCsvError('')
    const dateRange = buildDateRange()
    try {
      const genRes = await apiFetch(`/report/generate/publisher/${id}`, {
        method: 'POST',
        body: JSON.stringify({ date_range: dateRange, group_by: groupBy }),
      })
      if (!genRes.ok) {
        setCsvError('Failed to start report generation.')
        return
      }
      const genData = await genRes.json()
      if (!genData.report_generation_id) {
        setCsvError('Failed to start report generation.')
        return
      }
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000))
        if (csvAbortRef.current) return
        const statusRes = await apiFetch(`/report/status/${genData.report_generation_id}`)
        if (csvAbortRef.current) return
        if (!statusRes.ok) {
          setCsvError('Failed to check report status.')
          return
        }
        const statusData = await statusRes.json()
        if (statusData.status_name === 'FINISHED_OK') {
          const a = document.createElement('a')
          a.href = statusData.report_download_url
          a.style.display = 'none'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          return
        }
        if (statusData.status_name === 'FAILED') {
          setCsvError(statusData.error || 'Report generation failed.')
          return
        }
      }
      setCsvError('Report generation timed out.')
    } catch (err) {
      if (err.message !== 'Unauthorized') setCsvError('Failed to download report.')
    } finally {
      if (!csvAbortRef.current) setCsvLoading(false)
    }
  }

  function handleQuickChange(e) {
    const val = e.target.value
    if (val === 'custom') {
      setDateRangeType('fixed')
    } else {
      setDateRangeType('quick')
      setQuickAlias(val)
    }
  }

  const lowerSearch = placementSearch.toLowerCase()
  const filteredPlacements = placements.filter(pl => {
    if (placementActiveFilter === 'true' && !pl.placement_status) return false
    if (placementActiveFilter === 'false' && pl.placement_status) return false
    if (lowerSearch && !pl.name.toLowerCase().includes(lowerSearch)) return false
    return true
  })
  const placementTotalPages = Math.ceil(filteredPlacements.length / placementsPerPage)
  const visiblePlacements = filteredPlacements.slice(
    (placementPage - 1) * placementsPerPage,
    placementPage * placementsPerPage,
  )

  function handlePlacementFilterChange(setter) {
    return e => { setter(e.target.value); setPlacementPage(1) }
  }

  function handleTabClick(tab) {
    if (tab === 'placements') navigate(`/publishers/${id}/placements`)
    else if (tab === 'bulk-upload-jobs') navigate(`/publishers/${id}/bulk-upload-jobs`)
    else navigate(`/publishers/${id}/reporting`)
  }

  return (
    <Layout user={user}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
              <button style={activeTab === 'placements' ? tabStyles.tabActive : tabStyles.tab} onClick={() => handleTabClick('placements')}>
                Placements
              </button>
              <button style={activeTab === 'bulk-upload-jobs' ? tabStyles.tabActive : tabStyles.tab} onClick={() => handleTabClick('bulk-upload-jobs')}>
                Bulk Upload Jobs
              </button>
              <button style={activeTab === 'reporting' ? tabStyles.tabActive : tabStyles.tab} onClick={() => handleTabClick('reporting')}>
                Reporting
              </button>
            </div>

            {activeTab === 'placements' && (
              <>
                <div style={s.controls}>
                  <input
                    style={s.searchInput}
                    type="text"
                    placeholder="Search placements…"
                    value={placementSearch}
                    onChange={e => { setPlacementSearch(e.target.value); setPlacementPage(1) }}
                  />
                  <select
                    style={s.select}
                    value={placementActiveFilter}
                    onChange={handlePlacementFilterChange(setPlacementActiveFilter)}
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
                            <th style={s.th}>Type</th>
                            <th style={s.th}>Site</th>
                            <th style={s.th}>Platform</th>
                            <th style={s.th}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visiblePlacements.map((pl, i) => (
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
                  )
                }

                {placementTotalPages > 1 && (
                  <div style={s.pagination}>
                    <button style={s.pageBtn} onClick={() => setPlacementPage(p => p - 1)} disabled={placementPage === 1}>
                      Prev
                    </button>
                    <span style={s.pageInfo}>Page {placementPage} of {placementTotalPages}</span>
                    <button style={s.pageBtn} onClick={() => setPlacementPage(p => p + 1)} disabled={placementPage >= placementTotalPages}>
                      Next
                    </button>
                  </div>
                )}
              </>
            )}

            {activeTab === 'bulk-upload-jobs' && <BulkUploadJobsTab publisherId={id} />}

            {activeTab === 'reporting' && (
              <>
                <div style={s.reportControls}>
                  <select
                    value={dateRangeType === 'fixed' ? 'custom' : quickAlias}
                    onChange={handleQuickChange}
                    style={s.reportSelect}
                  >
                    <option value="YESTERDAY">Yesterday</option>
                    <option value="LAST_7_DAYS">Last 7 Days</option>
                    <option value="LAST_14_DAYS">Last 14 Days</option>
                    <option value="LAST_31_DAYS">Last 31 Days</option>
                    <option value="LAST_90_DAYS">Last 90 Days</option>
                    <option value="THIS_WEEK">This Week</option>
                    <option value="LAST_WEEK">Last Week</option>
                    <option value="THIS_MONTH">This Month</option>
                    <option value="LAST_MONTH">Last Month</option>
                    <option value="LAST_3_MONTHS">Last 3 Months</option>
                    <option value="LAST_6_MONTHS">Last 6 Months</option>
                    <option disabled>──────────</option>
                    <option value="custom">Custom range</option>
                  </select>

                  {dateRangeType === 'fixed' && (
                    <>
                      <input type="date" value={customStart} max={yesterdayStr} onChange={e => setCustomStart(e.target.value)} style={s.reportSelect} />
                      <input type="date" value={customEnd} max={yesterdayStr} onChange={e => setCustomEnd(e.target.value)} style={s.reportSelect} />
                    </>
                  )}

                  <div style={s.groupByToggle}>
                    {[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(([v, label], idx, arr) => (
                      <button
                        key={v}
                        style={{
                          padding: '0.4375rem 0.75rem',
                          background: groupBy === v ? '#1a1a2e' : '#fff',
                          color: groupBy === v ? '#fff' : '#374151',
                          border: 'none',
                          borderRight: idx < arr.length - 1 ? '1px solid #d1d5db' : 'none',
                          cursor: 'pointer',
                          fontSize: '0.8125rem',
                          fontWeight: groupBy === v ? 500 : 400,
                        }}
                        onClick={() => setGroupBy(v)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <button style={s.loadBtn} onClick={fetchReport} disabled={reportLoading}>
                    Load Report
                  </button>

                  {reportLoaded && reportRows.length > 0 && (
                    <button style={{ ...s.csvBtn, marginLeft: 'auto' }} onClick={downloadCSV} disabled={reportLoading || csvLoading}>
                      {csvLoading ? <><span style={s.spinnerSm} />Generating…</> : 'Download CSV'}
                    </button>
                  )}
                </div>

                {reportError && <p style={s.error}>{reportError}</p>}
                {csvError && <p style={s.error}>{csvError}</p>}

                {!reportLoaded && !reportLoading && !reportError && (
                  <p style={s.muted}>Select a date range and click Load Report.</p>
                )}

                {reportLoading && !reportLoaded && (
                  <div style={s.spinnerCenter}>
                    <span style={s.spinnerLg} />
                  </div>
                )}

                {reportLoaded && reportRows.length === 0 && !reportLoading && (
                  <p style={s.muted}>No data for this period.</p>
                )}

                {reportLoaded && reportRows.length > 0 && (
                  <div style={{ position: 'relative' }}>
                    {reportLoading && (
                      <div style={s.loadingOverlay}>
                        <span style={s.spinnerLg} />
                      </div>
                    )}
                    <div style={{ ...s.tableWrapper, opacity: reportLoading ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                      <table style={s.table}>
                        <thead>
                          <tr>
                            {reportColumns.map(c => (
                              <th key={c.id} style={s.th}>{c.display}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {reportRows.map((row, i) => (
                            <tr key={i} style={i % 2 !== 0 ? s.rowAlt : undefined}>
                              {reportColumns.map(c => (
                                <td key={c.id} style={s.td}>
                                  {c.id === 'revenue'
                                    ? (row[c.id] != null ? parseFloat(row[c.id]).toFixed(2) : '—')
                                    : (row[c.id] ?? '—')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </Layout>
  )
}

const s = {
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

  reportControls: { display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' },
  reportSelect: { padding: '0.4375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', color: '#111827', outline: 'none', background: '#fff' },
  groupByToggle: { display: 'flex', border: '1px solid #d1d5db', borderRadius: 4, overflow: 'hidden' },
  loadBtn: { padding: '0.4375rem 1rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 },
  csvBtn: { padding: '0.4375rem 1rem', background: '#fff', color: '#1a1a2e', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' },
  spinnerSm: { display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(26,26,46,0.2)', borderTopColor: '#1a1a2e', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 },
  spinnerLg: { display: 'inline-block', width: 36, height: 36, border: '3px solid rgba(26,26,46,0.15)', borderTopColor: '#1a1a2e', borderRadius: '50%', animation: 'spin 0.7s linear infinite' },
  spinnerCenter: { display: 'flex', justifyContent: 'center', padding: '3rem 0' },
  loadingOverlay: { position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, zIndex: 1 },

  tableWrapper: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden' },
  th: { padding: '0.75rem 1rem', background: '#f9fafb', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', textAlign: 'left', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '0.75rem 1rem', fontSize: '0.9rem', color: '#111827', borderBottom: '1px solid #f3f4f6' },
  rowAlt: { background: '#fafafa' },
  idTag: { color: '#6b7280', fontWeight: 400 },

  pagination: { display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' },
  pageBtn: { padding: '0.375rem 0.875rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8125rem' },
  pageInfo: { fontSize: '0.875rem', color: '#6b7280' },

  error: { color: '#dc2626', fontSize: '0.875rem' },
  muted: { color: '#6b7280', fontSize: '0.875rem' },
}
