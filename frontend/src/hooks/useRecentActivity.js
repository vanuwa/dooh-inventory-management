const STORAGE_KEY = 'dooh_recent_activity'
const MAX_ITEMS = 10

export function useRecentActivity() {
  function getItems() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)))
  }

  return { recordVisit, getItems }
}
