// Basemap configuration for the DOOH screens map.
//
// This is the single seam for the basemap. The PoC uses OpenStreetMap's public
// raster tiles (no API key, POIs baked into the imagery). To move to a
// self-hosted Protomaps PMTiles basemap or a keyed provider (MapTiler/Stadia)
// in production, change TILE_URL / TILE_ATTRIBUTION here — no map code changes.
export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
export const MAX_ZOOM = 19

// Initial map view, shown until FitBounds zooms to the loaded screens
// (roughly centred on Europe).
export const DEFAULT_CENTER = [52.3, 5.3]
export const DEFAULT_ZOOM = 5

// Max screens loaded onto the map in one go. Beyond this the map shows a
// "refine your filter" banner rather than loading an unbounded set (upstream
// has no viewport/bbox filter, so the whole filtered set loads at once).
export const MAP_MARKER_CAP = 2000
