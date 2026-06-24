import { useState, useEffect, useRef } from 'react'
import { useParams, useLocation, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api.js'
import { useRecentActivity } from '../hooks/useRecentActivity.js'
import Layout from '../components/Layout.jsx'
import { StatusBadge } from '../components/StatusBadge.jsx'
import ReportingTab from '../components/ReportingTab.jsx'
import EditPlacementModal from '../components/EditPlacementModal.jsx'
import PaginationControls from '../components/PaginationControls.jsx'
import { tabStyles } from '../styles/tabs.js'
import { tableStyles } from '../styles/tables.js'
import { useDebounce } from '../hooks/useDebounce.js'

const SCREEN_FIELDS = [
  ['ID', 'id', false],
  ['Publisher ID', 'publisher_id', false],
  ['Placement ID', 'placement_id', false],
  ['Player ID', 'player_id', true, 'text'],
  ['Device ID', 'device_id', true, 'text'],
  ['Screen Image URL', 'screen_img_url', true, 'text'],
  ['Orientation', 'orientation', true, 'text'],
  ['Resolution Width', 'resolution_width', true, 'number'],
  ['Resolution Height', 'resolution_height', true, 'number'],
  ['Venue Type ID', 'venue_type_id', true, 'number'],
  ['Venue Type Tax', 'venue_type_tax', true, 'text'],
  ['Latitude', 'lat', true, 'number'],
  ['Longitude', 'lon', true, 'number'],
  ['Country Code', 'country_code', true, 'text'],
  ['Region', 'region', true, 'text'],
  ['City', 'city', true, 'text'],
  ['Zip', 'zip', true, 'text'],
  ['Address', 'address', true, 'text'],
  ['Width (cm)', 'width', true, 'number'],
  ['Height (cm)', 'height', true, 'number'],
  ['Min Duration (s)', 'min_duration', true, 'number'],
  ['Max Duration (s)', 'max_duration', true, 'number'],
  ['Avg Weekly Audience', 'avg_weekly_audience', true, 'number'],
  ['CPM', 'cpm', true, 'number'],
  ['Currency Code', 'currency_code', true, 'text'],
  ['Allowed Content', 'allowed_content', true, 'text'],
]

function coerceTypes(vals) {
  const intFields = ['resolution_width', 'resolution_height', 'venue_type_id', 'width', 'height', 'min_duration', 'max_duration']
  const floatFields = ['lat', 'lon', 'avg_weekly_audience', 'cpm']
  const out = { ...vals }
  for (const f of intFields) {
    if (out[f] === '' || out[f] == null) { out[f] = null; continue }
    const n = parseInt(out[f], 10)
    out[f] = isNaN(n) ? null : n
  }
  for (const f of floatFields) {
    if (out[f] === '' || out[f] == null) { out[f] = null; continue }
    const n = parseFloat(out[f])
    out[f] = isNaN(n) ? null : n
  }
  return out
}

export default function PlacementDetail() {
  const { publisherId, placementId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const activeTab = location.pathname.endsWith('/reporting') ? 'reporting' : 'screens'

  const { recordVisit } = useRecentActivity()

  const [user, setUser] = useState(null)
  const [publisherName, setPublisherName] = useState(location.state?.publisherName ?? '')
  const [fetchedPlacement, setFetchedPlacement] = useState(null)
  const placement = fetchedPlacement ?? location.state?.placement ?? null
  const placementName = placement?.name ?? `Placement ${placementId}`

  // screens tab
  const [doohSettings, setDoohSettings] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const committedSearch = useDebounce(search, 300)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const limit = 20
  const [screensCsvLoading, setScreensCsvLoading] = useState(false)
  const screensCsvInFlightRef = useRef(false)
  const [screensTick, setScreensTick] = useState(0)

  const [editPlacementOpen, setEditPlacementOpen] = useState(false)

  // screen detail modal
  const [selectedScreen, setSelectedScreen] = useState(null)
  const [hoveredScreenId, setHoveredScreenId] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editValues, setEditValues] = useState({})
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [copiedVast, setCopiedVast] = useState(false)
  const autoOpenAttemptedRef = useRef(false)
  const copiedVastTimerRef = useRef(null)

  useEffect(() => {
    apiFetch('/user/details')
      .then(res => res.json())
      .then(setUser)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!publisherName) return
    if (!placement?.name) return
    const url = activeTab === 'reporting'
      ? `/publishers/${publisherId}/placements/${placementId}/reporting`
      : `/publishers/${publisherId}/placements/${placementId}`
    recordVisit({
      url,
      pageType: activeTab,
      publisher: { name: publisherName, id: publisherId },
      placement: { name: placement.name, id: placementId },
    })
  }, [publisherName, activeTab, placement?.name])

  useEffect(() => {
    if (publisherName) return
    apiFetch(`/publishers/${publisherId}`)
      .then(res => res.json())
      .then(data => { if (data.name) setPublisherName(data.name) })
      .catch(() => {})
  }, [publisherId])

  useEffect(() => {
    const controller = new AbortController()
    apiFetch(`/publishers/${publisherId}/placements/${placementId}`, { signal: controller.signal })
      .then(r => r.json())
      .then(pl => { if (pl?.id) setFetchedPlacement(pl) })
      .catch(() => {})
    return () => controller.abort()
  }, [publisherId, placementId])

  useEffect(() => { setPage(1) }, [committedSearch])

  const initialScreenId = searchParams.get('screen')

  useEffect(() => {
    if (autoOpenAttemptedRef.current || loading || !initialScreenId) return
    const found = doohSettings.find(sc => String(sc.id) === initialScreenId)
    if (found) {
      autoOpenAttemptedRef.current = true
      setSelectedScreen(found)
      return
    }
    autoOpenAttemptedRef.current = true
    apiFetch(`/publishers/${publisherId}/placements/${placementId}/dooh-settings/${initialScreenId}`)
      .then(res => {
        if (!res.ok) { autoOpenAttemptedRef.current = false; return null }
        return res.json()
      })
      .then(data => { if (data?.dooh_setting) setSelectedScreen(data.dooh_setting) })
      .catch(() => { autoOpenAttemptedRef.current = false })
  }, [loading, doohSettings, initialScreenId])

  useEffect(() => {
    setCopiedVast(false)
    return () => { if (copiedVastTimerRef.current) clearTimeout(copiedVastTimerRef.current) }
  }, [selectedScreen])

  useEffect(() => {
    if (activeTab !== 'screens') return
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
  }, [publisherId, placementId, page, committedSearch, activeTab, screensTick])

  const totalPages = Math.ceil(total / limit)

  function fmt(v, fallback = '—') {
    return v || fallback
  }

  async function downloadScreensCSV() {
    if (screensCsvInFlightRef.current) return
    screensCsvInFlightRef.current = true
    setScreensCsvLoading(true)
    try {
      const all = []
      let p = 1
      let total = Infinity
      while (all.length < total) {
        const res = await apiFetch(`/publishers/${publisherId}/placements/${placementId}/dooh-settings?page=${p}&limit=100`)
        const data = await res.json()
        all.push(...(data.dooh_settings ?? []))
        total = data.total ?? all.length
        p++
      }
      const cols = ['id', 'publisher_id', 'placement_id', 'player_id', 'device_id', 'screen_img_url', 'orientation', 'resolution_width', 'resolution_height', 'venue_type_id', 'venue_type_tax', 'lat', 'lon', 'country_code', 'region', 'city', 'zip', 'address', 'width', 'height', 'min_duration', 'max_duration', 'avg_weekly_audience', 'cpm', 'currency_code', 'allowed_content']
      const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
      const csv = [cols.join(','), ...all.map(row => cols.map(c => esc(row[c])).join(','))].join('\n')
      const now = new Date()
      const ts = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + 'T' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0')
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `placement_${placementId}_screen_data_${ts}.csv`
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      if (err.message !== 'Unauthorized') setError('Failed to download screens CSV.')
    } finally {
      screensCsvInFlightRef.current = false
      setScreensCsvLoading(false)
    }
  }

  function closeModal() {
    setSelectedScreen(null)
    setSearchParams({}, { replace: true })
  }

  function handleCopyVastTag() {
    const { publisher_id, placement_id, player_id } = selectedScreen
    const vastUrl = `https://ad.360yield.com/${publisher_id}/advast?p=${placement_id}&player_id=${encodeURIComponent(player_id)}&dooh_multiplier=1`
    navigator.clipboard.writeText(vastUrl).catch(() => {})
    if (copiedVastTimerRef.current) clearTimeout(copiedVastTimerRef.current)
    setCopiedVast(true)
    copiedVastTimerRef.current = setTimeout(() => setCopiedVast(false), 2000)
  }

  function handleEdit() {
    setEditValues({ ...selectedScreen })
    setEditMode(true)
    setSaveError('')
  }

  async function handleSave() {
    if (saveLoading) return
    setSaveLoading(true)
    setSaveError('')
    const updated = coerceTypes(editValues)
    const payload = Object.fromEntries(
      Object.entries(updated).filter(([k, v]) =>
        (v != null && v !== '') || (selectedScreen[k] != null && selectedScreen[k] !== '')
      )
    )
    const body = { dooh_settings: [payload] }
    try {
      const res = await apiFetch(
        `/publishers/${publisherId}/placements/${placementId}/dooh-settings`,
        { method: 'PUT', body: JSON.stringify(body) }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        setSaveError(errData.message ?? `Save failed (${res.status})`)
        return
      }
      setDoohSettings(prev => prev.map(sc => sc.id === updated.id ? updated : sc))
      setSelectedScreen(updated)
      setEditMode(false)
    } catch (err) {
      if (err.message !== 'Unauthorized') setSaveError('Save failed.')
    } finally {
      setSaveLoading(false)
    }
  }

  return (
    <Layout user={user}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <main style={s.main}>
        <Link to={'/publishers/' + publisherId + '/placements'} style={s.backLink}>← Publisher{publisherName ? `: ${publisherName}` : ''}</Link>

        <div style={s.heading}>
          <h2 style={s.title}>{placementName}</h2>
        </div>

        {placement && (
          <div style={s.card}>
            <div style={s.cardHeader}>
              <span style={s.cardId}>ID: {placement.id}</span>
              <button style={{ ...s.editBtn, marginLeft: 'auto' }} onClick={() => setEditPlacementOpen(true)} disabled={!fetchedPlacement}>Edit</button>
            </div>
            <div style={s.cardBody}>
              <div style={s.cardRow}>
                <span style={s.cardLabel}>Type</span>
                <span style={s.cardValue}>{placement.placement_type || '—'}</span>
              </div>
              <div style={s.cardRow}>
                <span style={s.cardLabel}>Site</span>
                <span style={s.cardValue}>
                  {placement.inventory_name
                    ? `${placement.inventory_name} (${placement.inventory_id})`
                    : '—'}
                </span>
              </div>
              <div style={s.cardRow}>
                <span style={s.cardLabel}>Platform</span>
                <span style={s.cardValue}>{placement.inventory_platform_type_name || '—'}</span>
              </div>
              {placement.inventory_url && (
                <div style={s.cardRow}>
                  <span style={s.cardLabel}>Site URL</span>
                  <a href={/^https?:\/\//.test(placement.inventory_url) ? placement.inventory_url : `https://${placement.inventory_url}`} target="_blank" rel="noopener noreferrer"
                     style={{ color: '#4338ca', fontSize: '0.9rem' }}>
                    {placement.inventory_url}
                  </a>
                </div>
              )}
              {!!placement.max_defaults && (
                <div style={s.cardRow}>
                  <span style={s.cardLabel}>Max Defaults</span>
                  <span style={s.cardValue}>{placement.max_defaults}</span>
                </div>
              )}
              <div style={s.cardRow}>
                <span style={s.cardLabel}>Status</span>
                <StatusBadge active={placement.placement_status} />
              </div>
            </div>
          </div>
        )}

        {editPlacementOpen && placement && (
          <EditPlacementModal
            publisherId={publisherId}
            placementId={placementId}
            placement={placement}
            onClose={() => setEditPlacementOpen(false)}
            onSaved={updated => {
              setFetchedPlacement(updated)
              setEditPlacementOpen(false)
            }}
          />
        )}

        <div style={tabStyles.tabBar}>
          <button style={activeTab === 'screens' ? tabStyles.tabActive : tabStyles.tab} onClick={() => navigate(`/publishers/${publisherId}/placements/${placementId}/screens`, { state: { publisherName, placement } })}>Screens</button>
          <button style={activeTab === 'reporting' ? tabStyles.tabActive : tabStyles.tab} onClick={() => navigate(`/publishers/${publisherId}/placements/${placementId}/reporting`, { state: { publisherName, placement } })}>Reporting</button>
        </div>

        {activeTab === 'screens' && (
          <>
            {error && <p style={s.error}>{error}</p>}

            <div style={s.controls}>
              <input
                style={s.searchInput}
                type="text"
                placeholder="Search screens…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <button style={s.csvBtn} onClick={downloadScreensCSV} disabled={screensCsvLoading}>
                {screensCsvLoading ? <><span style={s.spinnerSm} />Downloading…</> : 'Download CSV'}
              </button>
              <button style={s.refreshBtn} onClick={() => setScreensTick(t => t + 1)} disabled={loading}>
                Refresh
              </button>
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
                          <tr
                            key={sc.id}
                            onClick={() => { setSelectedScreen(sc); setEditMode(false); setSearchParams({ screen: String(sc.id) }, { replace: true }) }}
                            onMouseEnter={() => setHoveredScreenId(sc.id)}
                            onMouseLeave={() => setHoveredScreenId(null)}
                            style={{ cursor: 'pointer', background: hoveredScreenId === sc.id ? '#e8edf2' : (i % 2 !== 0 ? '#fafafa' : undefined) }}
                          >
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

                <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
              </>
            )}
          </>
        )}

        {selectedScreen && (
          <div style={s.overlay} onClick={closeModal}>
            <div style={s.modal} onClick={e => e.stopPropagation()}>
              <div style={s.modalHeader}>
                <h3 style={s.modalTitle}>Screen #{selectedScreen.id}</h3>
                {!editMode && (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button style={s.vastTagBtn} onClick={handleCopyVastTag} disabled={!selectedScreen.player_id}>
                      {copiedVast ? 'Copied!' : 'Copy VAST Tag'}
                    </button>
                    <button style={s.editBtn} onClick={handleEdit}>Edit</button>
                  </div>
                )}
              </div>

              <div style={s.modalBodyScroll}>
                <table style={s.modalTable}>
                  <tbody>
                    {SCREEN_FIELDS.map(([label, field, editable, inputType]) => (
                      <tr key={field} style={s.modalRow}>
                        <td style={s.modalLabel}>{label}</td>
                        <td style={s.modalValue}>
                          {editMode && editable
                            ? <input
                                type={inputType}
                                value={editValues[field] ?? ''}
                                onChange={e => setEditValues(prev => ({ ...prev, [field]: e.target.value }))}
                                style={s.editInput}
                                step={inputType === 'number' ? 'any' : undefined}
                              />
                            : (selectedScreen[field] != null && selectedScreen[field] !== '' ? String(selectedScreen[field]) : '—')
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {editMode && saveError && <p style={s.saveError}>{saveError}</p>}

              <div style={s.modalFooter}>
                {editMode ? (
                  <>
                    <button style={s.cancelBtn} onClick={() => { setEditMode(false); setSaveError('') }}>Cancel</button>
                    <button style={s.primaryBtn} onClick={handleSave} disabled={saveLoading}>
                      {saveLoading ? 'Saving…' : 'Save'}
                    </button>
                  </>
                ) : (
                  <button style={s.primaryBtn} onClick={closeModal}>Close</button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reporting' && (
          <ReportingTab
            previewUrl={`/report/placement/${publisherId}/${placementId}`}
            generateUrl={`/report/generate/placement/${publisherId}/${placementId}`}
          />
        )}
      </main>
    </Layout>
  )
}

const s = {
  ...tableStyles,
  th: tableStyles.thCompact,
  td: tableStyles.tdCompact,
  main: { padding: '2.5rem 1.5rem', maxWidth: '100%', margin: '0 auto' },
  backLink: { display: 'inline-block', marginBottom: '1rem', color: '#4338ca', fontSize: '0.875rem', textDecoration: 'none', fontWeight: 500 },

  heading: { marginBottom: '1rem' },
  title: { margin: '0', fontSize: '1.25rem', fontWeight: 700, color: '#111827' },

  card: { background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden', marginBottom: '1.5rem' },
  cardHeader: { display: 'flex', alignItems: 'baseline', gap: '0.625rem', padding: '0.75rem 1.375rem', borderBottom: '1px solid #f3f4f6' },
  cardId: { fontSize: '0.875rem', color: '#6b7280', fontWeight: 400 },
  cardBody: { padding: '0.25rem 0' },
  cardRow: { display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.625rem 1.375rem', borderBottom: '1px solid #f9fafb' },
  cardLabel: { fontSize: '0.8125rem', color: '#6b7280', fontWeight: 500, minWidth: 120 },
  cardValue: { fontSize: '0.9rem', color: '#111827' },

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
  csvBtn: { padding: '0.4375rem 1rem', background: '#fff', color: '#1a1a2e', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' },
  refreshBtn: { padding: '0.375rem 0.75rem', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: '0.8125rem', marginLeft: 'auto' },
  spinnerSm: { display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(26,26,46,0.2)', borderTopColor: '#1a1a2e', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 },

  idTag: { color: '#6b7280', fontWeight: 400 },

  error: { color: '#dc2626', fontSize: '0.875rem' },
  muted: { color: '#6b7280', fontSize: '0.875rem' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', padding: '1.75rem', width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column', position: 'relative' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexShrink: 0 },
  modalTitle: { margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' },
  editBtn: { padding: '0.375rem 0.875rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500 },
  vastTagBtn: { padding: '0.375rem 0.875rem', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500 },
  modalBodyScroll: { overflowY: 'auto', flex: 1 },
  modalTable: { width: '100%', borderCollapse: 'collapse' },
  modalRow: { borderBottom: '1px solid #f3f4f6' },
  modalLabel: { padding: '0.5rem 0.75rem 0.5rem 0', fontSize: '0.8125rem', color: '#6b7280', fontWeight: 500, width: '45%', verticalAlign: 'middle', whiteSpace: 'nowrap' },
  modalValue: { padding: '0.5rem 0', fontSize: '0.875rem', color: '#111827', width: '55%', verticalAlign: 'middle' },
  editInput: { width: '100%', padding: '0.375rem 0.625rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', color: '#111827', outline: 'none', boxSizing: 'border-box' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem', flexShrink: 0 },
  primaryBtn: { padding: '0.4375rem 1.25rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 },
  cancelBtn: { padding: '0.4375rem 1.25rem', background: '#fff', color: '#1a1a2e', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem' },
  saveError: { color: '#dc2626', fontSize: '0.8125rem', marginTop: '0.5rem', flexShrink: 0 },
}
