import { API_ENVIRONMENTS, DEFAULT_API_ENV } from '../constants/apiEnvironments.js'

// The selected environment itself is not scoped — it *is* the selection.
export const API_ENV_KEY = 'api_env'

// Per-environment key names, exported so the modules that read and write them and the
// migration table below cannot drift apart: renaming one here renames it everywhere.
export const ACCESS_TOKEN_KEY = 'access_token'
export const REFRESH_TOKEN_KEY = 'refresh_token'
export const RECENT_ACTIVITY_KEY = 'dooh_recent_activity'

// Unscoped keys written before the environment switcher existed. They all held
// production data, so a one-time migration moves them to ':production'.
const LEGACY_KEYS = [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, RECENT_ACTIVITY_KEY]

// Stand-in for a store we cannot touch. Returning it rather than null keeps every
// helper below a plain try/catch around real storage exceptions, instead of reaching
// the fallback by dereferencing null and letting the TypeError be swallowed.
const NO_STORAGE = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

// Resolved by a call rather than a default parameter: merely *touching* localStorage
// throws where site data is blocked (Safari private mode, sandboxed iframe), and a
// default parameter is evaluated outside the try blocks below — which would blank the
// app at boot, the exact failure these guards exist to prevent.
function defaultStorage() {
  try {
    return localStorage
  } catch {
    return NO_STORAGE
  }
}

function findApiEnv(name) {
  return API_ENVIRONMENTS.find(e => e.name === name) ?? null
}

export function isKnownApiEnv(name) {
  return findApiEnv(name) !== null
}

// Namespaces a storage key per environment: tokens and cached entity IDs from one
// instance are meaningless on the other, so both sessions get their own slot.
export function scopedKey(key, env) {
  return `${key}:${env}`
}

// The active environment's upstream host, or null when the name is unknown. The one
// lookup for it: the login form's hint and the accent strip below both render it.
export function apiEnvHost(env) {
  return findApiEnv(env)?.host ?? null
}

// The chrome's environment identity: the text of the non-production accent strip, or
// null when the active environment is the default one and no strip is shown. Pure, so
// the "is this session visibly non-production?" decision is covered by the tests.
export function apiEnvBanner(env) {
  const active = findApiEnv(env)
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
export function readScoped(key, env, storage = defaultStorage()) {
  try {
    return storage.getItem(scopedKey(key, env))
  } catch {
    return null
  }
}

export function writeScoped(key, env, value, storage = defaultStorage()) {
  try {
    storage.setItem(scopedKey(key, env), value)
  } catch {
    // ignore — the value simply does not survive a reload
  }
}

export function removeScoped(key, env, storage = defaultStorage()) {
  try {
    storage.removeItem(scopedKey(key, env))
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
