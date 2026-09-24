// Everything this app decides about a DOOH screen's `status` lives here, as pure
// functions: vitest runs in the node environment in this repo, so a rule inside a
// component cannot be tested at all — a rule in this module can.

// The Screens status filter, in display order.
//
// The empty "All" value is load-bearing: PlacementDetail only appends `&status=` when
// the value is truthy, so "All" sends *no* status parameter and inherits upstream's own
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

// Grey "Inactive" is the fall-through, not a mapped case: it reproduces today's
// rendering for `inactive`, for a null status and for an unmapped one, so only
// genuinely deleted rows change appearance. Rose rather than the delete button's
// #dc2626, so a grid of deleted rows does not read as a grid of errors.
const INACTIVE_BADGE = { label: 'Inactive', background: '#f3f4f6', color: '#6b7280' }

const SCREEN_STATUS_BADGES = {
  active: { label: 'Active', background: '#dcfce7', color: '#15803d' },
  deleted: { label: 'Deleted', background: '#ffe4e6', color: '#9f1239' },
}

export function screenStatusBadge(status) {
  return SCREEN_STATUS_BADGES[status] || INACTIVE_BADGE
}

// Body for the soft delete: the selected rows, flipped to `status: 'deleted'`.
//
// Keys whose value is null or '' are dropped, exactly as the edit dialog's save does,
// and for the same reason: upstream's PUT is a full overwrite — applyScreenFields writes
// every column it is handed unconditionally, so an absent key becomes NULL while an
// empty-string key becomes ''. Six fields (device_id, screen_img_url, region, zip,
// address, currency_code) are plain non-omitempty Go strings in PlacementDoohItem, so a
// NULL upstream already reaches us as "". Copying a row whole would therefore rewrite up
// to six NULL columns as '' on every soft delete, across up to 1000 rows, each landing in
// that row's UPDATE history diff. Dropping empty keys is the round-trip-faithful option.
//
// Numeric zero survives on purpose: lat: 0 / lon: 0 is a valid coordinate and width: 0 is
// storable, so the test is `!= null && !== ''`, never truthiness.
//
// Never mutates its input — the caller's rows are the dialog's live selection snapshot.
export function softDeleteBody(screens) {
  const rows = (screens || []).map(screen => {
    const row = Object.fromEntries(
      Object.entries(screen).filter(([, v]) => v != null && v !== '')
    )
    row.status = 'deleted'
    return row
  })
  return { dooh_settings: rows }
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
// Every other property name passes through untouched, which covers both the single-row PUT
// (upstream does not index a one-element batch) and the hard-delete `ids` errors. An index
// with no matching row degrades to the original property name rather than throwing.
export function labelBatchErrors(errData, sentScreens) {
  if (!Array.isArray(errData?.messages)) return errData
  const screens = sentScreens || []
  return {
    ...errData,
    messages: errData.messages.map(m => {
      const match = INDEXED_PROPERTY.exec(m?.property_name ?? '')
      if (!match) return m
      const screen = screens[Number(match[1])]
      if (!screen) return m
      const label = `screen ${screen.id} (${screen.player_id})`
      return { ...m, property_name: match[2] ? `${label} — ${match[2]}` : label }
    }),
  }
}
