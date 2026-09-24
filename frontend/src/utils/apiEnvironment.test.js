import { describe, it, expect } from 'vitest'
import {
  apiEnvBanner,
  isKnownApiEnv,
  scopedKey,
  readApiEnv,
  writeApiEnv,
  migrateLegacyKeys,
} from './apiEnvironment.js'
import { DEFAULT_API_ENV } from '../constants/apiEnvironments.js'

// vitest runs in the node environment here (no jsdom), so there is no localStorage
// global — hence the optional storage argument on the three storage helpers.
function stubStorage(initial = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value) },
    removeItem: key => { delete data[key] },
  }
}

function throwingStorage() {
  return {
    getItem: () => { throw new Error('access denied') },
    setItem: () => { throw new Error('access denied') },
    removeItem: () => { throw new Error('access denied') },
  }
}

describe('isKnownApiEnv', () => {
  it('accepts the configured environments', () => {
    expect(isKnownApiEnv('production')).toBe(true)
    expect(isKnownApiEnv('acceptance')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isKnownApiEnv('alpha')).toBe(false)
    expect(isKnownApiEnv('')).toBe(false)
    expect(isKnownApiEnv(null)).toBe(false)
    expect(isKnownApiEnv(undefined)).toBe(false)
  })
})

describe('DEFAULT_API_ENV', () => {
  it('is one of the configured environments', () => {
    // If it ever drifts the proxy answers 400 for every request and the accent
    // strip is suppressed, because every environment then looks like the default.
    expect(isKnownApiEnv(DEFAULT_API_ENV)).toBe(true)
  })
})

describe('apiEnvBanner', () => {
  it('names a non-default environment and its host', () => {
    expect(apiEnvBanner('acceptance')).toBe('Acceptance environment — api.360yielddev.com')
  })

  it('returns null for the default environment, so no strip is shown', () => {
    expect(apiEnvBanner(DEFAULT_API_ENV)).toBeNull()
  })

  it('returns null for an unknown environment', () => {
    expect(apiEnvBanner('bogus')).toBeNull()
    expect(apiEnvBanner(undefined)).toBeNull()
  })
})

describe('scopedKey', () => {
  it('suffixes the key with the environment', () => {
    expect(scopedKey('access_token', 'acceptance')).toBe('access_token:acceptance')
    expect(scopedKey('dooh_recent_activity', 'production')).toBe('dooh_recent_activity:production')
  })
})

describe('readApiEnv', () => {
  it('returns a stored known value', () => {
    expect(readApiEnv(stubStorage({ api_env: 'acceptance' }))).toBe('acceptance')
  })

  it('falls back to production for a stored unknown value', () => {
    expect(readApiEnv(stubStorage({ api_env: 'bogus' }))).toBe('production')
  })

  it('falls back to production when nothing is stored', () => {
    expect(readApiEnv(stubStorage())).toBe('production')
  })

  it('falls back to production when storage throws', () => {
    expect(readApiEnv(throwingStorage())).toBe('production')
  })
})

describe('writeApiEnv', () => {
  it('persists a known name', () => {
    const storage = stubStorage()
    writeApiEnv('acceptance', storage)
    expect(storage.data.api_env).toBe('acceptance')
  })

  it('ignores an unknown name and leaves the stored value alone', () => {
    const storage = stubStorage({ api_env: 'acceptance' })
    writeApiEnv('bogus', storage)
    expect(storage.data.api_env).toBe('acceptance')
  })

  it('does not throw when storage throws', () => {
    expect(() => writeApiEnv('acceptance', throwingStorage())).not.toThrow()
  })
})

describe('migrateLegacyKeys', () => {
  it('moves the unscoped tokens to :production and removes the originals', () => {
    const storage = stubStorage({ access_token: 'a1', refresh_token: 'r1' })
    migrateLegacyKeys(storage)
    expect(storage.data['access_token:production']).toBe('a1')
    expect(storage.data['refresh_token:production']).toBe('r1')
    expect(storage.getItem('access_token')).toBeNull()
    expect(storage.getItem('refresh_token')).toBeNull()
  })

  it('moves the unscoped recent-activity history to :production', () => {
    const history = JSON.stringify([{ url: '/publishers/1', pageType: 'publisher' }])
    const storage = stubStorage({ dooh_recent_activity: history })
    migrateLegacyKeys(storage)
    expect(storage.data['dooh_recent_activity:production']).toBe(history)
    expect(storage.getItem('dooh_recent_activity')).toBeNull()
  })

  it('is a no-op on a second call', () => {
    const storage = stubStorage({ access_token: 'a1', refresh_token: 'r1' })
    migrateLegacyKeys(storage)
    storage.setItem('access_token:production', 'a2')
    migrateLegacyKeys(storage)
    expect(storage.data['access_token:production']).toBe('a2')
    expect(storage.getItem('access_token')).toBeNull()
  })

  it('never overwrites an existing scoped key', () => {
    const storage = stubStorage({ access_token: 'legacy', 'access_token:production': 'current' })
    migrateLegacyKeys(storage)
    expect(storage.data['access_token:production']).toBe('current')
    expect(storage.getItem('access_token')).toBeNull()
  })

  it('leaves scoped keys for other environments untouched', () => {
    const storage = stubStorage({ access_token: 'a1', 'access_token:acceptance': 'acc' })
    migrateLegacyKeys(storage)
    expect(storage.data['access_token:production']).toBe('a1')
    expect(storage.data['access_token:acceptance']).toBe('acc')
  })

  it('does nothing when there is nothing to migrate', () => {
    const storage = stubStorage()
    migrateLegacyKeys(storage)
    expect(storage.data).toEqual({})
  })

  it('does not throw when storage throws', () => {
    expect(() => migrateLegacyKeys(throwingStorage())).not.toThrow()
  })
})

// The default storage argument is resolved inside a try/catch, so a context where
// merely touching localStorage throws (blocked site data, sandboxed iframe — here,
// the node test environment, which has no localStorage global) degrades to the
// default instead of throwing at module scope and blanking the app at boot.
describe('default storage', () => {
  it('readApiEnv falls back to production without throwing', () => {
    expect(readApiEnv()).toBe(DEFAULT_API_ENV)
  })

  it('writeApiEnv does not throw', () => {
    expect(() => writeApiEnv('acceptance')).not.toThrow()
  })

  it('migrateLegacyKeys does not throw', () => {
    expect(() => migrateLegacyKeys()).not.toThrow()
  })
})
