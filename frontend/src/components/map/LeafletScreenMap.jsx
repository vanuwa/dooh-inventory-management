import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import ScreenPopupContent from './ScreenPopupContent.jsx'
import {
  TILE_URL,
  TILE_ATTRIBUTION,
  MAX_ZOOM,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  FIT_MAX_ZOOM,
} from '../../constants/mapConfig.js'

// Leaflet + markercluster ship their own stylesheets; the map cannot render
// without them. This is a deliberate exception to the app's "no CSS files"
// convention (see the styling note in CLAUDE.md) — these are vendor styles,
// not app styles. They live here rather than in ScreenMap so that picking the
// Google provider doesn't pull in Leaflet's chunk at all.
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
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: FIT_MAX_ZOOM })
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

export default function LeafletScreenMap({ markers, loadId, height }) {
  return (
    <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={s.map} scrollWheelZoom>
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={MAX_ZOOM} />
      <FitBounds points={markers} />
      <ResizeHandler trigger={height} />
      <MarkerClusterGroup key={loadId} chunkedLoading>
        {markers.map((m, i) => (
          <Marker key={m.screen_id || `idx-${i}`} position={[m.lat, m.lon]}>
            <Popup>
              <ScreenPopupContent screen={m} />
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  )
}

const s = {
  map: { height: '100%', width: '100%' },
}
