import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api.js'
import Layout from '../components/Layout.jsx'
import { tableStyles as ts } from '../styles/tables.js'
import { useDebounce } from '../hooks/useDebounce.js'

const PAGE_SIZES = [10, 20, 50, 100, 500, 1000, 2000, 5000, 10000]

function limitFromParams(searchParams) {
  const fromUrl = Number(searchParams.get('limit'))
  if (PAGE_SIZES.includes(fromUrl)) return fromUrl
  const fromStorage = Number(localStorage.getItem('dooh-metadata-page-size'))
  return PAGE_SIZES.includes(fromStorage) ? fromStorage : 20
}

export default function DoohMetadata() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [user, setUser] = useState(null)
  const [items, setItems] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)

  // Initialise from URL; fall back to localStorage / defaults
  const [country, setCountry] = useState(searchParams.get('country') ?? '')
  const [publisherId, setPublisherId] = useState(searchParams.get('publisherId') ?? '')
  // Fix #4: parseInt guards against NaN from malformed ?page=abc.
  const [page, setPage] = useState(() => {
    const n = parseInt(searchParams.get('page'), 10)
    return isNaN(n) || n < 1 ? 1 : n
  })
  const [limit, setLimit] = useState(() => limitFromParams(searchParams))

  const debouncedCountry = useDebounce(country, 300)
  const debouncedPublisherId = useDebounce(publisherId, 300)

  // Skip the "reset page" effect on the very first render so a shared URL
  // with page > 1 isn't immediately reset to 1.
  const filtersReady = useRef(false)

  useEffect(() => {
    apiFetch('/user/details').then(r => r.json()).then(setUser).catch(() => {})
  }, [])

  // Reset to page 1 when filters change (not on mount).
  // Fix #5: return a cleanup that resets the ref so React StrictMode's
  // mount→unmount→remount cycle doesn't fire setPage(1) on the second run.
  useEffect(() => {
    if (!filtersReady.current) {
      filtersReady.current = true
      return () => { filtersReady.current = false }
    }
    setPage(1)
  }, [debouncedCountry, debouncedPublisherId])

  // Sync state → URL (replace so filter-typing doesn't pollute history)
  useEffect(() => {
    const next = new URLSearchParams()
    if (debouncedCountry) next.set('country', debouncedCountry)
    if (debouncedPublisherId) next.set('publisherId', debouncedPublisherId)
    next.set('limit', String(limit))
    if (page > 1) next.set('page', String(page))
    setSearchParams(next, { replace: true })
  }, [page, limit, debouncedCountry, debouncedPublisherId])

  // Fetch
  useEffect(() => {
    setLoading(true)
    setError('')

    let path = `/dooh-metadata?page=${page}&limit=${limit}`
    if (debouncedCountry) path += `&country=${encodeURIComponent(debouncedCountry)}`
    if (debouncedPublisherId) path += `&publisherId=${encodeURIComponent(debouncedPublisherId)}`

    const controller = new AbortController()
    apiFetch(path, { signal: controller.signal })
      .then(r => {
        // Fix #2: surface HTTP errors instead of letting .json() throw a
        // SyntaxError on the empty body the backend forwards for non-200s.
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        setItems(data.items ?? [])
        setHasMore(data.has_more ?? false)
        setLoading(false)
      })
      .catch(err => {
        if (err.name !== 'AbortError') setError('Failed to load DOOH metadata.')
        setLoading(false)
      })
    return () => controller.abort()
  }, [page, debouncedCountry, debouncedPublisherId, limit])

  function handleLimitChange(e) {
    const val = Number(e.target.value)
    localStorage.setItem('dooh-metadata-page-size', val)
    setLimit(val)
    setPage(1)
  }

  function fmt(v, fallback = '—') {
    return v != null && v !== '' ? v : fallback
  }

  function fmtSize(w, h) {
    if (w == null || h == null) return '—'
    return `${w}×${h}`
  }

  function fmtDuration(min, max) {
    if (min == null && max == null) return '—'
    return `${min ?? '?'}–${max ?? '?'} s`
  }

  function fmtCpm(cpm, currency) {
    if (cpm == null) return '—'
    return currency ? `${cpm} ${currency}` : String(cpm)
  }

  function fmtImpressions(v) {
    if (v == null) return '—'
    return Number(v).toLocaleString()
  }

  function fmtLocation(lat, lon) {
    if (lat == null || lon == null) return '—'
    return `${lat}, ${lon}`
  }

  function fmtPublisher(id, name) {
    if (id == null) return '—'
    return name ? `${name} (${id})` : String(id)
  }

  function fmtAllowedContent(arr) {
    if (!arr || arr.length === 0) return '—'
    return arr.join(', ')
  }

  function fmtMultipliers(arr) {
    if (!arr || arr.length === 0) return '—'
    return `${arr.length} rule${arr.length !== 1 ? 's' : ''}`
  }

  return (
    <Layout user={user}>
      <main style={s.main}>
        <h1 style={s.heading}>DOOH Metadata</h1>

        <div style={s.filters}>
          <input
            style={s.input}
            placeholder="Country code (e.g. NL)"
            value={country}
            onChange={e => setCountry(e.target.value)}
          />
          <input
            style={s.input}
            placeholder="Publisher ID"
            type="number"
            value={publisherId}
            onChange={e => setPublisherId(e.target.value)}
          />
        </div>

        {error && <p style={s.error}>{error}</p>}
        {loading && <p style={s.info}>Loading…</p>}
        {!loading && items.length === 0 && !error && <p style={s.info}>No records found.</p>}

        {!loading && items.length > 0 && (
          <>
            <div style={ts.tableWrapper}>
              <table style={ts.table}>
                <thead>
                  <tr>
                    <th style={ts.thCompact}>Screen ID</th>
                    <th style={ts.thCompact}>Publisher</th>
                    <th style={ts.thCompact}>Country</th>
                    <th style={ts.thCompact}>City</th>
                    <th style={ts.thCompact}>Region</th>
                    <th style={ts.thCompact}>ZIP</th>
                    <th style={ts.thCompact}>Venue Type</th>
                    <th style={ts.thCompact}>Location</th>
                    <th style={ts.thCompact}>Size (px)</th>
                    <th style={ts.thCompact}>Resolution</th>
                    <th style={ts.thCompact}>Duration</th>
                    <th style={ts.thCompact}>CPM</th>
                    <th style={ts.thCompact}>Est. Impr/wk</th>
                    <th style={ts.thCompact}>Multiplier Vendor</th>
                    <th style={ts.thCompact}>Multiplier Src</th>
                    <th style={ts.thCompact}>Venue Tax ID</th>
                    <th style={ts.thCompact}>Allowed Content</th>
                    <th style={ts.thCompact}>Multipliers</th>
                    <th style={ts.thCompact}>Screen Image</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={item.screen_id || `idx-${i}`} style={i % 2 !== 0 ? ts.rowAlt : undefined}>
                      <td style={ts.tdCompact}>{fmt(item.screen_id)}</td>
                      <td style={ts.tdCompact}>{fmtPublisher(item.publisher_id, item.publisher_name)}</td>
                      <td style={ts.tdCompact}>{fmt(item.country_code)}</td>
                      <td style={ts.tdCompact}>{fmt(item.city)}</td>
                      <td style={ts.tdCompact}>{fmt(item.region)}</td>
                      <td style={ts.tdCompact}>{fmt(item.zip)}</td>
                      <td style={ts.tdCompact}>{fmt(item.venue_type_id)}</td>
                      <td style={ts.tdCompact}>{fmtLocation(item.lat, item.lon)}</td>
                      <td style={ts.tdCompact}>{fmtSize(item.width, item.height)}</td>
                      <td style={ts.tdCompact}>{fmtSize(item.resolution_width, item.resolution_height)}</td>
                      <td style={ts.tdCompact}>{fmtDuration(item.min_duration, item.max_duration)}</td>
                      <td style={ts.tdCompact}>{fmtCpm(item.cpm, item.currency_code)}</td>
                      <td style={ts.tdCompact}>{fmtImpressions(item.estimated_weekly_impressions)}</td>
                      <td style={ts.tdCompact}>{fmt(item.multiplier_vendor)}</td>
                      <td style={ts.tdCompact}>{fmt(item.multiplier_source_type_id)}</td>
                      <td style={ts.tdCompact}>{fmt(item.venue_type_tax_id)}</td>
                      <td style={ts.tdCompact}>{fmtAllowedContent(item.allowed_content)}</td>
                      <td style={ts.tdCompact}>{fmtMultipliers(item.dooh_multipliers)}</td>
                      <td style={ts.tdCompact}>
                        {item.screen_image_url
                          ? <button style={s.viewBtn} onClick={() => setPreviewUrl(item.screen_image_url)}>View</button>
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ ...ts.pagination, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button style={page === 1 ? s.pageBtnOff : ts.pageBtn} onClick={() => setPage(1)} disabled={page === 1}>First</button>
                <button style={page === 1 ? s.pageBtnOff : ts.pageBtn} onClick={() => setPage(p => p - 1)} disabled={page === 1}>Prev</button>
                <span style={ts.pageInfo}>Page {page}</span>
                <button style={!hasMore ? s.pageBtnOff : ts.pageBtn} onClick={() => setPage(p => p + 1)} disabled={!hasMore}>Next</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={ts.pageInfo}>Rows per page:</span>
                <select style={s.pageSizeSelect} value={limit} onChange={handleLimitChange}>
                  {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </>
        )}
      </main>

      {previewUrl && (
        <div style={s.overlay} onClick={() => setPreviewUrl(null)}>
          <div style={s.previewModal} onClick={e => e.stopPropagation()}>
            <button style={s.closeBtn} onClick={() => setPreviewUrl(null)}>×</button>
            <img
              src={previewUrl}
              alt="Screen preview"
              style={s.previewImg}
              onError={e => { e.target.style.display = 'none' }}
            />
          </div>
        </div>
      )}
    </Layout>
  )
}

const s = {
  main: { padding: '2rem 1.5rem' },
  heading: { margin: '0 0 1.5rem', fontSize: '1.375rem', fontWeight: 600, color: '#111827' },
  filters: { display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' },
  input: {
    padding: '0.4rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize: '0.875rem',
    width: 180,
  },
  info: { color: '#6b7280', fontSize: '0.9rem' },
  error: { color: '#b91c1c', fontSize: '0.9rem' },
  viewBtn: { background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.875rem', padding: 0, textDecoration: 'underline' },
  pageSizeSelect: { padding: '0.35rem 0.5rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', cursor: 'pointer' },
  pageBtnOff: { padding: '0.375rem 0.875rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, fontSize: '0.8125rem', opacity: 0.35, cursor: 'not-allowed' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  previewModal: { position: 'relative', background: '#fff', borderRadius: 8, padding: '1rem', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' },
  closeBtn: { position: 'absolute', top: '0.5rem', right: '0.75rem', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1, color: '#6b7280' },
  previewImg: { display: 'block', maxWidth: '80vw', maxHeight: '75vh', borderRadius: 4 },
}
