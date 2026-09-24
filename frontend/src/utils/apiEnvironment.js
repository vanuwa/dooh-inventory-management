import { API_ENVIRONMENTS, DEFAULT_API_ENV } from '../constants/apiEnvironments.js'

// The selected environment itself is not scoped — it *is* the selection.
export const API_ENV_KEY = 'api_env'

// Unscoped keys written before the environment switcher existed. They all held
// production data, so a one-time migration moves them to ':production'.
const LEGACY_KEYS = ['access_token', 'refresh_token', 'dooh_recent_activity']

// Resolved by a call rather than a default parameter: merely *touching* localStorage
// throws where site data is blocked (Safari private mode, sandboxed iframe), and a
// default parameter is evaluated outside the try blocks below — which would blank the
// app at boot, the exact failure these guards exist to prevent.
function defaultStorage() {
  try {
    return localStorage
  } catch {
    return null
  }
}

export function isKnownApiEnv(name) {
  return API_ENVIRONMENTS.some(e => e.name === name)
}

// Namespaces a storage key per environment: tokens and cached entity IDs from one
// instance are meaningless on the other, so both sessions get their own slot.
export function scopedKey(key, env) {
  return `${key}:${env}`
}

// The chrome's environment identity: the text of the non-production accent strip, or
// null when the active environment is the default one and no strip is shown. Pure, so
// the "is this session visibly non-production?" decision is covered by the tests.
export function apiEnvBanner(env) {
  const active = API_ENVIRONMENTS.find(e => e.name === env)
  if (!active || active.name === DEFAULT_API_ENV) return null
  return `${active.label} environment — ${active.host}`
}

// Storage access is wrapped throughout: a blocked or cleared store (Safari private
// mode, disabled site data) must degrade to the default rather than break boot.
export function readApiEnv(storage = defaultStorage()) {
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
export function writeApiEnv(name, storage = defaultStorage()) {
  if (!isKnownApiEnv(name)) return
  try {
    storage.setItem(API_ENV_KEY, name)
  } catch {
    // ignore — the selection simply does not survive a reload
  }
}

// Per-environment values (tokens, history) go through these rather than localStorage
// directly: the first read happens in a useState initialiser during the very first
// render, where an unguarded throw would blank the app instead of degrading.
export function readScoped(key, env) {
  try {
    return defaultStorage().getItem(scopedKey(key, env))
  } catch {
    return null
  }
}

export function writeScoped(key, env, value) {
  try {
    defaultStorage().setItem(scopedKey(key, env), value)
  } catch {
    // ignore — the value simply does not survive a reload
  }
}

export function removeScoped(key, env) {
  try {
    defaultStorage().removeItem(scopedKey(key, env))
  } catch {
    // ignore — a store we cannot write to holds nothing to remove
  }
}

// Moves pre-switcher unscoped keys to ':production' so the change does not log
// anyone out. Idempotent: an already-scoped value is never overwritten, and the
// legacy key is removed either way so the migration cannot run twice.
export function migrateLegacyKeys(storage = defaultStorage()) {
  for (const key of LEGACY_KEYS) {
    try {
      const legacy = storage.getItem(key)
      if (legacy === null) continue
      const scoped = scopedKey(key, DEFAULT_API_ENV)
      if (storage.getItem(scoped) === null) {
        storage.setItem(scoped, legacy)
      }
      storage.removeItem(key)
    } catch {
      // ignore — a store we cannot read is a store with nothing to migrate
    }
  }
}
