import { API_ENVIRONMENTS, DEFAULT_API_ENV } from '../constants/apiEnvironments.js'

// The selected environment itself is not scoped — it *is* the selection.
const API_ENV_KEY = 'api_env'

// Unscoped keys written before the environment switcher existed. They all held
// production data, so a one-time migration moves them to ':production'.
const LEGACY_KEYS = ['access_token', 'refresh_token', 'dooh_recent_activity']

export function isKnownApiEnv(name) {
  return API_ENVIRONMENTS.some(e => e.name === name)
}

// Namespaces a storage key per environment: tokens and cached entity IDs from one
// instance are meaningless on the other, so both sessions get their own slot.
export function scopedKey(key, env) {
  return `${key}:${env}`
}

// Storage access is wrapped throughout: a blocked or cleared store (Safari private
// mode, disabled site data) must degrade to the default rather than break boot.
export function readApiEnv(storage = localStorage) {
  try {
    const name = storage.getItem(API_ENV_KEY)
    if (isKnownApiEnv(name)) return name
  } catch {
    // ignore — fall through to the default
  }
  return DEFAULT_API_ENV
}

// Unknown names are ignored rather than persisted: the proxy answers 400 for an
// unconfigured environment, so storing one would wedge every later request.
export function writeApiEnv(name, storage = localStorage) {
  if (!isKnownApiEnv(name)) return
  try {
    storage.setItem(API_ENV_KEY, name)
  } catch {
    // ignore — the selection simply does not survive a reload
  }
}

// Moves pre-switcher unscoped keys to ':production' so the change does not log
// anyone out. Idempotent: an already-scoped value is never overwritten, and the
// legacy key is removed either way so the migration cannot run twice.
export function migrateLegacyKeys(storage = localStorage) {
  for (const key of LEGACY_KEYS) {
    try {
      const legacy = storage.getItem(key)
      if (legacy === null || legacy === undefined) continue
      const scoped = scopedKey(key, DEFAULT_API_ENV)
      if (storage.getItem(scoped) === null || storage.getItem(scoped) === undefined) {
        storage.setItem(scoped, legacy)
      }
      storage.removeItem(key)
    } catch {
      // ignore — a store we cannot read is a store with nothing to migrate
    }
  }
}
