// Everything this app decides about a DOOH screen's `status` lives here, as pure
// functions: vitest runs in the node environment in this repo, so a rule inside a
// component cannot be tested at all — a rule in this module can. The request-shaping
// helpers below live here for the same reason: they are the parts of the delete and the
// screens fetch whose regressions would otherwise be invisible.

// The Screens status filter, in display order.
//
// The empty "All" value is load-bearing: `screensQuery` only appends `status` when the
// value is truthy, so "All" sends *no* status parameter and inherits upstream's own
// default, which is the deny-list `status_id IS NULL OR status_id <> 3`. Two
// consequences, both by design:
//   - "All" therefore excludes deleted rows; they are reached through "Deleted only".
//   - rows carrying a NULL or unmapped status_id keep listing exactly as they do today,
//     which an explicit active,inactive,deleted allow-list would have hidden with no
//     option able to ask for them back.
export const SCREEN_STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active only' },
  { value: 'inactive', label: 'Inactive only' },
  { value: 'deleted', label: 'Deleted only' },
]

// The filter value the Screens tab lands on. Exported so the default and the option table
// cannot drift apart unnoticed.
export const DEFAULT_SCREEN_STATUS_FILTER = 'active'

// Query string for a page of the Screens grid. `status` is appended only when it is
// truthy, which is what makes "All" mean "no parameter" — an empty `&status=` would be
// rejected upstream with a 400, and the screens fetch has no `res.ok` check, so the only
// symptom would be a bare "Failed to load screens."
export function screensQuery({ page, limit, search, status }) {
  let query = `?page=${page}&limit=${limit}`
  if (search) query += `&search=${encodeURIComponent(search)}`
  if (status) query += `&status=${encodeURIComponent(status)}`
  return query
}

// Grey "Inactive" is the fall-through, not a mapped case: it reproduces today's
// rendering for `inactive`, for a null status and for an unmapped one, so only
// genuinely deleted rows change appearance. Rose rather than the delete button's
// #dc2626, so a grid of deleted rows does not read as a grid of errors.
//
// `StatusBadge.jsx` renders both this badge and the older binary one from these colours,
// so the hexes live here only.
const INACTIVE_BADGE = { label: 'Inactive', background: '#f3f4f6', color: '#6b7280' }

const SCREEN_STATUS_BADGES = {
  active: { label: 'Active', background: '#dcfce7', color: '#15803d' },
  deleted: { label: 'Deleted', background: '#ffe4e6', color: '#9f1239' },
}

export function screenStatusBadge(status) {
  return SCREEN_STATUS_BADGES[status] || INACTIVE_BADGE
}

// The fields upstream refuses a screen without, in the order the edit dialog shows them.
//
// They are required twice over: `placement-dooh-settings.json` marks all ten `required`
// (checked before binding), and `PlacementDoohDto` carries `@NotNull`/`@NotBlank` on every
// one of them, which `@Valid @RequestBody` enforces for *every* element of the batch. So a
// row missing any of these cannot be updated at all — not by dropping the key (absent
// fails `@NotNull`) and not by keeping the empty string (`""` fails `@NotBlank`). Rows like
// that exist: the upstream test suite has helpers that "simulate legacy/pre-existing data
// where the FK is null".
export const SOFT_DELETE_REQUIRED_FIELDS = [
  'player_id',
  'resolution_width',
  'resolution_height',
  'venue_type_id',
  'venue_type_tax',
  'lat',
  'lon',
  'country_code',
  'city',
  'allowed_content',
]

// The required fields a row cannot supply, using the same `null`/`''` test softDeleteBody
// filters by — so anything this reports is exactly what that body would have omitted.
// Numeric 0 counts as supplied: `lat: 0` is a real coordinate.
export function missingRequiredFields(screen) {
  return SOFT_DELETE_REQUIRED_FIELDS.filter(field => {
    const value = screen?.[field]
    return value == null || value === ''
  })
}

// Splits a selection into the rows the soft delete can carry and the rows it cannot.
// Rows in `blocked` have to go through the permanent delete instead, which validates
// nothing.
export function partitionSoftDeletable(rows) {
  const deletable = []
  const blocked = []
  for (const row of rows) {
    const missing = missingRequiredFields(row)
    if (missing.length === 0) deletable.push(row)
    else blocked.push({ row, missing })
  }
  return { deletable, blocked }
}

// Body for the soft delete: the selected rows, flipped to `status: 'deleted'`.
//
// Keys whose value is null or '' are dropped, exactly as the edit dialog's save does,
// and for the same reason: upstream's PUT is a full overwrite — `applyScreenFields` writes
// every column it is handed unconditionally (and `updateAll` writes `player_id` and
// `device_id` beside it), so an absent key becomes NULL while an empty-string key becomes
// ''. Six *nullable* string columns — device_id, screen_img_url, region, zip, address,
// currency_code — are plain non-omitempty Go strings in `PlacementDoohItem`, so an upstream
// NULL already reaches us as "". (Seven other strings are non-omitempty too; those six are
// the ones that are nullable upstream, which is what makes them lossy.) Copying a row whole
// would therefore rewrite up to six NULL columns as '' on every soft delete, across up to
// 1000 rows, each landing in that row's UPDATE history diff. Dropping empty keys is the
// round-trip-faithful option.
//
// Every nullable *numeric* column is a pointer in `PlacementDoohItem` and arrives as null,
// so the same rule covers them: lat, lon, resolution_width, resolution_height,
// venue_type_id, width, height, min_duration, max_duration, avg_weekly_audience and cpm.
// Numeric zero survives on purpose — lat: 0 / lon: 0 is a real coordinate and width: 0 is
// storable — so the test is `!= null && !== ''`, never truthiness.
//
// This shapes the body only; whether a row *can* be sent is `partitionSoftDeletable`.
//
// Never mutates its input — the caller's rows are the dialog's live selection snapshot.
export function softDeleteBody(screens) {
  const rows = screens.map(screen => {
    const row = Object.fromEntries(
      Object.entries(screen).filter(([, v]) => v != null && v !== '')
    )
    row.status = 'deleted'
    return row
  })
  return { dooh_settings: rows }
}

// The one place the two delete modes diverge, lifted out of the dialog so the branch is
// testable: the soft delete is a PUT carrying the checked rows, the permanent one a DELETE
// carrying only their ids. `rows` is always the *checked* subset — passing the full listing
// would soft-delete rows the user never ticked while `onDeleted` reported only the ticked
// ones, and the refetch would hide it.
export function deleteRequest({ rows, hardDelete, publisherId, placementId }) {
  const path = `/publishers/${publisherId}/placements/${placementId}/dooh-settings`
  if (hardDelete) {
    return { path: `${path}?ids=${rows.map(row => row.id).join(',')}`, options: { method: 'DELETE' } }
  }
  return { path, options: { method: 'PUT', body: JSON.stringify(softDeleteBody(rows)) } }
}

// `dooh_settings[7].venue_type_tax` or `dooh_settings[7]`
const INDEXED_PROPERTY = /^dooh_settings\[(\d+)\](?:\.(.+))?$/

// Upstream keys batch validation errors by the row's index in the array we sent, never by
// id or player_id — useless to a user deciding which row to uncheck. The index is
// deterministic (it is the position in the array softDeleteBody built from the same rows),
// so rewrite it into something nameable before formatApiError renders it:
//
//   dooh_settings[7].venue_type_tax  ->  screen 4711 (test-player-042) — venue_type_tax
//
// Upstream indexes a one-element batch too for `placement.dooh.id.required`,
// `placement.dooh.duplicate.id` and `placement.dooh.unknown`, so the single-screen edit
// save labels its body through here as well. Every other property name passes through
// untouched, which covers the hard-delete `ids` errors. An index with no matching row
// degrades to the original property name rather than throwing.
export function labelBatchErrors(errData, sentScreens) {
  if (!Array.isArray(errData?.messages)) return errData
  return {
    ...errData,
    messages: errData.messages.map(m => {
      const match = INDEXED_PROPERTY.exec(m?.property_name ?? '')
      if (!match) return m
      const screen = sentScreens[Number(match[1])]
      if (!screen) return m
      // player_id is required upstream but a legacy row can still be missing it, and
      // "screen 4711 ()" reads like a bug rather than like a blank field.
      const label = screen.player_id ? `screen ${screen.id} (${screen.player_id})` : `screen ${screen.id}`
      return { ...m, property_name: match[2] ? `${label} — ${match[2]}` : label }
    }),
  }
}
