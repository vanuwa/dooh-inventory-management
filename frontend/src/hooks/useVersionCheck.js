import { useState, useEffect } from 'react'

const CURRENT_COMMIT = import.meta.env.VITE_GIT_COMMIT
const POLL_MS = 5 * 60 * 1000

export function useVersionCheck() {
  const [isOutdated, setIsOutdated] = useState(false)

  useEffect(() => {
    if (!CURRENT_COMMIT || CURRENT_COMMIT === 'unknown') return

    async function check() {
      try {
        const res = await fetch(
          'https://api.github.com/repos/vanuwa/dooh-inventory-management/commits/main',
          { headers: { Accept: 'application/vnd.github.sha' } }
        )
        if (!res.ok) return
        const latest = (await res.text()).trim()
        setIsOutdated(latest !== CURRENT_COMMIT)
      } catch {
        // network error — ignore silently
      }
    }

    check()
    const id = setInterval(check, POLL_MS)
    return () => clearInterval(id)
  }, [])

  return isOutdated
}
