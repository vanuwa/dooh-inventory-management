import { readApiEnv, scopedKey } from '../utils/apiEnvironment.js'

const STORAGE_KEY = 'dooh_recent_activity'
const MAX_ITEMS = 10

// Resolved per call, never at module scope: entries embed publisher and placement
// IDs, which mean different records on each instance, so a stale key would show
// one environment's history while browsing the other.
function storageKey() {
  return scopedKey(STORAGE_KEY, readApiEnv())
}

export function useRecentActivity() {
  function getItems() {
    try {
      return JSON.parse(localStorage.getItem(storageKey()) || '[]')
    } catch {
      return []
    }
  }

  // entry: { url, pageType, publisher: {name, id}, placement?: {name, id} }
  function recordVisit(entry) {
    const items = getItems()
    const existing = items.findIndex(item => item.url === entry.url)
    if (existing !== -1) items.splice(existing, 1)
    items.unshift({ ...entry, visitedAt: Date.now() })
    localStorage.setItem(storageKey(), JSON.stringify(items.slice(0, MAX_ITEMS)))
  }

  return { recordVisit, getItems }
}
