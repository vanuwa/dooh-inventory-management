import { RECENT_ACTIVITY_KEY, readApiEnv, readScoped, writeScoped } from '../utils/apiEnvironment.js'

const MAX_ITEMS = 10

export function useRecentActivity() {
  // The environment is resolved per call, never at module scope: entries embed
  // publisher and placement IDs, which mean different records on each instance, so a
  // stale key would show one environment's history while browsing the other.
  function getItems() {
    try {
      return JSON.parse(readScoped(RECENT_ACTIVITY_KEY, readApiEnv()) || '[]')
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
    writeScoped(RECENT_ACTIVITY_KEY, readApiEnv(), JSON.stringify(items.slice(0, MAX_ITEMS)))
  }

  return { recordVisit, getItems }
}
