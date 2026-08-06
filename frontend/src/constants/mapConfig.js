// Basemap configuration for the DOOH screens map.
//
// This is the single seam for basemaps. Two providers are supported: OpenStreetMap
// raster tiles via Leaflet (keyless) and Google Maps via the Maps JavaScript API
// (needs a browser key). To move OSM to a self-hosted Protomaps PMTiles basemap or
// a keyed provider (MapTiler/Stadia), change TILE_URL / TILE_ATTRIBUTION here.

// --- Provider-agnostic ---------------------------------------------------------

// Initial map view, shown until the map fits to the loaded screens
// (roughly centred on Europe).
export const DEFAULT_CENTER = [52.3, 5.3]
export const DEFAULT_ZOOM = 5

// Don't zoom in further than this when fitting to the loaded screens.
export const FIT_MAX_ZOOM = 16

// Max screens loaded onto the map in one go. Beyond this the map shows a
// "refine your filter" banner rather than loading an unbounded set (upstream
// has no viewport/bbox filter, so the whole filtered set loads at once).
export const MAP_MARKER_CAP = 2000

// --- OpenStreetMap / Leaflet ---------------------------------------------------

export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
export const MAX_ZOOM = 19

// --- Google Maps ---------------------------------------------------------------

// Baked in at build time (see frontend/Dockerfile + compose.yaml). A Maps browser
// key is necessarily visible to the client, so restrict it by HTTP referrer and
// API in the Google Cloud console.
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

// AdvancedMarker requires a cloud-based map style, i.e. a Map ID. DEMO_MAP_ID
// works for development; set VITE_GOOGLE_MAPS_MAP_ID to a real one for production.
export const GOOGLE_MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'

// Without a key the Google option is offered but disabled, rather than rendering
// a broken map.
export const GOOGLE_MAPS_AVAILABLE = Boolean(GOOGLE_MAPS_API_KEY)

// --- Provider registry ---------------------------------------------------------

export const MAP_PROVIDERS = [
  { id: 'osm', label: 'OpenStreetMap' },
  { id: 'google', label: 'Google Maps' },
]

// OSM is the default so Google map loads (which are billed per load) stay opt-in.
export const DEFAULT_MAP_PROVIDER = 'osm'

export const MAP_PROVIDER_IDS = MAP_PROVIDERS.map(p => p.id)
