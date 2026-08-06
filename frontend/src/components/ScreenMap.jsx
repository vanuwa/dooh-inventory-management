import { useState, useEffect, useMemo, useRef, useLayoutEffect, lazy, Suspense } from 'react'
import { apiFetch } from '../api.js'
import { tableStyles as ts } from '../styles/tables.js'
import {
  MAP_MARKER_CAP,
  MAP_PROVIDERS,
  GOOGLE_MAPS_AVAILABLE,
} from '../constants/mapConfig.js'

// Each provider is lazy-loaded so only the chosen one's chunk downloads —
// Leaflet (plus its vendor CSS and icon assets) and the Google Maps SDK stay
// out of each other's way, and out of the initial bundle entirely.
const LeafletScreenMap = lazy(() => import('./map/LeafletScreenMap.jsx'))
const GoogleScreenMap = lazy(() => import('./map/GoogleScreenMap.jsx'))

// Isolated fetch — reuses /dooh-metadata for the PoC. When a dedicated map
// endpoint (e.g. /dooh-metadata/geo, possibly with different filters) lands,
// only this function needs to change.
function buildPath(country, publisherId) {
  let path = `/dooh-metadata?page=1&limit=${MAP_MARKER_CAP}`
  if (country) path += `&country=${encodeURIComponent(country)}`
  if (publisherId) path += `&publisherId=${encodeURIComponent(publisherId)}`
  return path
}

export default function ScreenMap({ country, publisherId, provider, onProviderChange }) {
  const [items, setItems] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Bumped on each successful load so the cluster layer refreshes its markers
  // without remounting the map (which would reload tiles and reset the view).
  const [loadId, setLoadId] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError('')
    const controller = new AbortController()
    apiFetch(buildPath(country, publisherId), { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        setItems(data.items ?? [])
        setHasMore(data.has_more ?? false)
        setLoadId(id => id + 1)
        setLoading(false)
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setError('Failed to load screens for the map.')
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, [country, publisherId])

  const markers = useMemo(
    () => items.filter(i => i.lat != null && i.lon != null),
    [items],
  )
  const skipped = items.length - markers.length
  const plural = skipped !== 1

  // Size the map to the gap between its top and the viewport bottom, so it
  // adapts to whatever chrome (tabs, filters, banners) sits above it instead
  // of assuming a fixed pixel offset.
  const wrapRef = useRef(null)
  const [mapHeight, setMapHeight] = useState(MIN_MAP_HEIGHT)
  useLayoutEffect(() => {
    function recompute() {
      const el = wrapRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      setMapHeight(Math.max(MIN_MAP_HEIGHT, Math.round(window.innerHeight - top - 16)))
    }
    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [hasMore, skipped, loading, error])

  const switcher = (
    <div style={s.switcherRow}>
      <span style={ts.pageInfo}>Basemap:</span>
      <div style={s.switcher}>
        {MAP_PROVIDERS.map((p, idx, arr) => {
          const isDisabled = p.id === 'google' && !GOOGLE_MAPS_AVAILABLE
          const isActive = provider === p.id
          return (
            <button
              key={p.id}
              disabled={isDisabled}
              title={isDisabled ? 'Google Maps API key is not configured for this build' : undefined}
              style={{
                padding: '0.4375rem 0.75rem',
                background: isActive ? '#1a1a2e' : '#fff',
                color: isDisabled ? '#9ca3af' : (isActive ? '#fff' : '#374151'),
                border: 'none',
                borderRight: idx < arr.length - 1 ? '1px solid #d1d5db' : 'none',
                cursor: isDisabled ? 'default' : 'pointer',
                fontSize: '0.8125rem',
                fontWeight: isActive ? 500 : 400,
              }}
              onClick={() => onProviderChange(p.id)}
            >
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )

  // First load with nothing to show yet — keep the whole-view placeholder.
  // Once we have data, later fetches keep the map mounted and overlay a badge.
  if (loading && items.length === 0) {
    return <div>{switcher}<p style={s.info}>Loading map…</p></div>
  }
  if (error && items.length === 0) {
    return <div>{switcher}<p style={s.error}>{error}</p></div>
  }

  return (
    <div>
      {switcher}
      {error && <p style={s.error}>{error}</p>}
      {hasMore && (
        <p style={s.warn}>
          Showing the first {MAP_MARKER_CAP} screens — refine the country or publisher filter to see the rest.
        </p>
      )}
      {skipped > 0 && (
        <p style={s.info}>
          {skipped} screen{plural ? 's' : ''} {plural ? 'have' : 'has'} no coordinates and {plural ? 'are' : 'is'} not shown on the map.
        </p>
      )}

      {markers.length === 0 ? (
        <p style={s.info}>No screens with coordinates to display.</p>
      ) : (
        <div ref={wrapRef} style={{ ...s.mapWrap, height: mapHeight }}>
          <Suspense fallback={<p style={s.mapLoading}>Loading map…</p>}>
            {provider === 'google' && GOOGLE_MAPS_AVAILABLE
              ? <GoogleScreenMap markers={markers} />
              : <LeafletScreenMap markers={markers} loadId={loadId} height={mapHeight} />}
          </Suspense>
          {loading && <div style={s.updating}>Updating…</div>}
        </div>
      )}
    </div>
  )
}

const MIN_MAP_HEIGHT = 420

const s = {
  info: { color: '#6b7280', fontSize: '0.9rem' },
  warn: { color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 4, padding: '0.5rem 0.75rem', fontSize: '0.875rem', marginBottom: '0.5rem' },
  error: { color: '#b91c1c', fontSize: '0.9rem' },
  switcherRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' },
  switcher: { display: 'flex', border: '1px solid #d1d5db', borderRadius: 4, overflow: 'hidden' },
  mapWrap: { position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid #d1d5db' },
  mapLoading: { padding: '1rem', color: '#6b7280', fontSize: '0.9rem' },
  updating: { position: 'absolute', top: 10, right: 10, zIndex: 1000, background: 'rgba(26,26,46,0.85)', color: '#fff', fontSize: '0.75rem', padding: '0.25rem 0.6rem', borderRadius: 4, pointerEvents: 'none' },
}
