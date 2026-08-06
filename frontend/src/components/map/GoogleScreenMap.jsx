import { useState, useEffect, useCallback } from 'react'
import { APIProvider, Map, InfoWindow, useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import { MarkerClusterer } from '@googlemaps/markerclusterer'
import ScreenPopupContent from './ScreenPopupContent.jsx'
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_MAP_ID,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  FIT_MAX_ZOOM,
} from '../../constants/mapConfig.js'

// Markers are created imperatively and handed to MarkerClusterer rather than
// rendered as React <AdvancedMarker> elements: with up to MAP_MARKER_CAP screens
// this avoids reconciling thousands of components on every load, mirroring the
// chunked/clustered approach used on the Leaflet side.
function ScreenMarkers({ markers, onSelect }) {
  const map = useMap()
  const markerLib = useMapsLibrary('marker')
  const coreLib = useMapsLibrary('core')

  useEffect(() => {
    if (!map || !markerLib || !coreLib || markers.length === 0) return

    const bounds = new coreLib.LatLngBounds()
    const gmarkers = markers.map(screen => {
      const position = { lat: screen.lat, lng: screen.lon }
      bounds.extend(position)
      const marker = new markerLib.AdvancedMarkerElement({ position })
      marker.addListener('click', () => onSelect(screen))
      return marker
    })

    const clusterer = new MarkerClusterer({ map, markers: gmarkers })

    map.fitBounds(bounds, 40)
    // fitBounds on a tight (or single-point) bounds can zoom in absurdly far —
    // clamp once the map settles.
    const clamp = map.addListener('idle', () => {
      if (map.getZoom() > FIT_MAX_ZOOM) map.setZoom(FIT_MAX_ZOOM)
      clamp.remove()
    })

    return () => {
      clamp.remove()
      clusterer.clearMarkers()
      clusterer.setMap(null)
      gmarkers.forEach(m => { m.map = null })
    }
  }, [map, markerLib, coreLib, markers, onSelect])

  return null
}

export default function GoogleScreenMap({ markers }) {
  const [selected, setSelected] = useState(null)
  const onSelect = useCallback(screen => setSelected(screen), [])

  // Drop the open InfoWindow when a new result set loads, so it can't point at
  // a screen that is no longer on the map.
  useEffect(() => { setSelected(null) }, [markers])

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <Map
        mapId={GOOGLE_MAPS_MAP_ID}
        defaultCenter={{ lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] }}
        defaultZoom={DEFAULT_ZOOM}
        gestureHandling="greedy"
        disableDefaultUI={false}
        style={s.map}
      >
        <ScreenMarkers markers={markers} onSelect={onSelect} />
        {selected && (
          <InfoWindow
            position={{ lat: selected.lat, lng: selected.lon }}
            onCloseClick={() => setSelected(null)}
          >
            <ScreenPopupContent screen={selected} />
          </InfoWindow>
        )}
      </Map>
    </APIProvider>
  )
}

const s = {
  map: { height: '100%', width: '100%' },
}
