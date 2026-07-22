import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import { apiFetch } from '../api.js'
import { fmtPublisher } from '../utils/format.js'
import {
  TILE_URL,
  TILE_ATTRIBUTION,
  MAX_ZOOM,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAP_MARKER_CAP,
} from '../constants/mapConfig.js'

// Leaflet + markercluster ship their own stylesheets; the map cannot render
// without them. This is a deliberate exception to the app's "no CSS files"
// convention (see the styling note in CLAUDE.md) — these are vendor styles,
// not app styles.
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

// Leaflet's default marker icons resolve to broken paths under a bundler.
// Repoint them at the bundled image assets so pins actually render.
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

// Fit the map to the loaded markers once they change. Needs the map instance,
// so it lives as a child of MapContainer via useMap().
function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 })
  }, [points, map])
  return null
}

// Leaflet caches its container size, so a CSS-driven height change (e.g. a
// banner appearing/disappearing above the map) needs an explicit invalidate.
function ResizeHandler({ trigger }) {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
  }, [trigger, map])
  return null
}

// Isolated fetch — reuses /dooh-metadata for the PoC. When a dedicated map
// endpoint (e.g. /dooh-metadata/geo, possibly with different filters) lands,
// only this function needs to change.
function buildPath(country, publisherId) {
  let path = `/dooh-metadata?page=1&limit=${MAP_MARKER_CAP}`
  if (country) path += `&country=${encodeURIComponent(country)}`
  if (publisherId) path += `&publisherId=${encodeURIComponent(publisherId)}`
  return path
}

export default function ScreenMap({ country, publisherId }) {
  const [items, setItems] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Bumped on each successful load so the cluster layer refreshes its markers
  // without remounting the whole MapContainer (which would reload tiles and
  // reset the user's view on every filter change).
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

  // First load with nothing to show yet — keep the whole-view placeholder.
  // Once we have data, later fetches keep the map mounted and overlay a badge.
  if (loading && items.length === 0) return <p style={s.info}>Loading map…</p>
  if (error && items.length === 0) return <p style={s.error}>{error}</p>

  return (
    <div>
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
          <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={s.map} scrollWheelZoom>
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={MAX_ZOOM} />
            <FitBounds points={markers} />
            <ResizeHandler trigger={mapHeight} />
            <MarkerClusterGroup key={loadId} chunkedLoading>
              {markers.map((m, i) => (
                <Marker key={m.screen_id || `idx-${i}`} position={[m.lat, m.lon]}>
                  <Popup>
                    <div style={s.popup}>
                      <div style={s.popupTitle}>Screen {m.screen_id || '—'}</div>
                      <div>
                        <strong>Publisher:</strong> {fmtPublisher(m.publisher_id, m.publisher_name)}
                      </div>
                      <div>
                        <strong>Location:</strong>{' '}
                        {[m.city, m.region, m.country_code].filter(Boolean).join(', ') || '—'}
                      </div>
                      <div><strong>Venue type:</strong> {m.venue_type_id ?? '—'}</div>
                      <div><strong>Coords:</strong> {m.lat}, {m.lon}</div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          </MapContainer>
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
  mapWrap: { position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid #d1d5db' },
  map: { height: '100%', width: '100%' },
  updating: { position: 'absolute', top: 10, right: 10, zIndex: 1000, background: 'rgba(26,26,46,0.85)', color: '#fff', fontSize: '0.75rem', padding: '0.25rem 0.6rem', borderRadius: 4, pointerEvents: 'none' },
  popup: { fontSize: '0.8125rem', lineHeight: 1.5, minWidth: 180 },
  popupTitle: { fontWeight: 600, color: '#111827', marginBottom: '0.25rem' },
}
