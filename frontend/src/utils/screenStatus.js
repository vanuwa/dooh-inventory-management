// Everything this app decides about a DOOH screen's `status` lives here, as pure
// functions: vitest runs in the node environment in this repo, so a rule inside a
// component cannot be tested at all — a rule in this module can. The request-shaping
// helpers below live here for the same reason: they are the parts of the delete and the
// screens fetch whose regressions would otherwise be invisible. Rendering an upstream
// error body is not a status decision and lives in `utils/formatApiError.js`.
//
// Visibility rule for the file: every named rule helper is exported and tested directly,
// so which round a rule landed in is not visible in the export surface.
import { ACTIVE_BADGE_COLORS, INACTIVE_BADGE_COLORS } from '../constants/statusColors.js'
import { isBlank } from './format.js'

// Upstream's third status, spelled once: it is a filter option, a badge key, the value the
// soft delete writes and the option the create dialog removes.
export const DELETED_STATUS = 'deleted'

// `isBlank` counts `null`, `undefined`, `''` and whitespace-only as blank. Trimmed, because five of
// the ten required fields — player_id, venue_type_tax, country_code, city, allowed_content —
// are `@NotBlank` upstream, which rejects `"   "` as well. That rejection is bean validation:
// a 400 reported on the bare property name, with no `dooh_settings[i]` index even in a
// multi-row batch, so `labelBatchErrors` cannot tie it to a screen — exactly the
// unattributable failure the pre-checks exist to prevent. `softDeleteBody`'s filter
// deliberately does NOT use this; see the note at its call site.

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
  { value: DELETED_STATUS, label: 'Deleted only' },
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
// The green and the grey are the app-wide pair from `constants/statusColors.js`, shared with
// the binary `StatusBadge`; only the rose is a screen-status colour and lives here.
const INACTIVE_BADGE = { label: 'Inactive', ...INACTIVE_BADGE_COLORS }

const SCREEN_STATUS_BADGES = {
  active: { label: 'Active', ...ACTIVE_BADGE_COLORS },
  [DELETED_STATUS]: { label: 'Deleted', background: '#ffe4e6', color: '#9f1239' },
}

export function screenStatusBadge(status) {
  return SCREEN_STATUS_BADGES[status] || INACTIVE_BADGE
}

// The fields upstream refuses a screen without, in the order the edit dialog shows them.
//
// They are required twice over, though not equally: `placement-dooh-settings.json` marks all
// ten `required`, but it is draft-03 and its `dooh_settings.items` is a one-element *array*
// — tuple validation — so the schema only ever checks `dooh_settings[0]`. Rows 1..n are
// reached by `PlacementDoohDto`'s `@NotNull`/`@NotBlank` instead, which `@Valid @RequestBody`
// enforces for every element of the batch. Either way a row missing one of these cannot be
// updated at all — not by dropping the key (absent fails `@NotNull`) and not by keeping the
// stored string (`""` and `"   "` alike fail `@NotBlank`). Rows like that exist: the upstream
// test suite has helpers that "simulate legacy/pre-existing data where the FK is null".
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

// The required fields a row cannot supply. `isBlank` rather than the plain `null`/`''`
// softDeleteBody filters by, so a whitespace-only value counts as missing here even though
// softDeleteBody would have kept the key — see `isBlank`.
// Numeric 0 counts as supplied: `lat: 0` is a real coordinate, and `String(0).trim()` is '0'.
export function missingRequiredFields(screen) {
  return SOFT_DELETE_REQUIRED_FIELDS.filter(field => isBlank(screen?.[field]))
}

// `cpm` and `currency_code` require each other upstream (`validateCurrency`) in *both*
// directions, and the whole all-or-nothing batch dies on either: a floor price with no
// currency raises `placement.dooh.cpm.currency.required`, a currency with no floor price
// `placement.dooh.cpm.required`. Both are reachable here, because `cpm` is a Go pointer (an
// upstream NULL arrives as null and softDeleteBody drops it) while `currency_code` is a plain
// string (a stored value is kept). The pair is decidable from data already in hand, so decide
// it here rather than in a 400. The name reported is the half that is absent.
// Since SSP-1133 a write without the pair stores 1 USD and the backfill gave every screen both
// halves, so on the soft-delete path this guards only legacy rows the backfill has not reached.
// (The edit form needs no pair check: it makes both fields required.)
export function missingCurrencyPair(screen) {
  const hasCpm = !isBlank(screen?.cpm)
  const hasCurrency = !isBlank(screen?.currency_code)
  if (hasCpm && !hasCurrency) return ['currency_code']
  if (hasCurrency && !hasCpm) return ['cpm']
  return []
}

// `PlacementDoohDto` carries six bounds beside its `@NotNull`/`@NotBlank` set, and they fail the
// same way: they are bean-validation constraints, so they run at `@Valid @RequestBody` time, before
// the controller body, and come back as a 400 reported on the bare property name (`lat`, `street`)
// — bean-validation errors never carry the `dooh_settings[i]` index, even in a multi-row batch — so
// `labelBatchErrors` cannot tie one to a screen, and it kills the whole all-or-nothing batch. The
// values are copied from `PlacementDoohDto` / `DoohScreenFields` (both @DecimalMin and @DecimalMax
// are inclusive by default, so exactly ±90 / ±180 / 0.0 pass; @Size is inclusive too):
//
//   lat            @DecimalMin("-90.0")  @DecimalMax("90.0")
//   lon            @DecimalMin("-180.0") @DecimalMax("180.0")
//   player_id      @Size(max = 255)
//   cpm            @DecimalMin("0.0")
//   street         @Size(max = MAX_STREET_LENGTH)         1024 (SSP-1134)
//   street_number  @Size(max = MAX_STREET_NUMBER_LENGTH)  32   (SSP-1134)
//
// Rows that violate the first four are not hypothetical: `BulkUploadPlacementDoohDtoBase` carries
// no bean-validation annotations at all, so an xlsx-written row predating SSP-1117's shared
// `validateSharedRules` can hold an out-of-range coordinate, a negative cpm or an over-length
// player_id. One such row takes the whole PUT down, so — like the currency pair — decide it here
// from data already in hand rather than in an unattributable 400. The street bounds equal the
// column widths, so a stored row cannot exceed them; those two only matter in the edit form.
//
// Only *present* values are tested: an absent lat/lon/player_id is `missingRequiredFields`'s call,
// and an absent cpm, street or street_number is legal. A non-numeric lat, lon or cpm fails the
// bounds test and is reported here too — the Go proxy types those three as numbers, so it cannot
// occur, and upstream's Jackson would reject it just as flatly.
//
// Exported so the edit form's validation message quotes these values rather than a copy.
export const MAX_PLAYER_ID_LENGTH = 255
export const LAT_BOUNDS = [-90, 90]
export const LON_BOUNDS = [-180, 180]
export const MAX_STREET_LENGTH = 1024
export const MAX_STREET_NUMBER_LENGTH = 32

export function outOfRangeFields(screen) {
  const outOfRange = []
  const inBounds = (value, [min, max]) => Number(value) >= min && Number(value) <= max
  if (!isBlank(screen?.lat) && !inBounds(screen.lat, LAT_BOUNDS)) outOfRange.push('lat')
  if (!isBlank(screen?.lon) && !inBounds(screen.lon, LON_BOUNDS)) outOfRange.push('lon')
  if (String(screen?.player_id ?? '').length > MAX_PLAYER_ID_LENGTH) outOfRange.push('player_id')
  if (!isBlank(screen?.cpm) && Number(screen.cpm) < 0) outOfRange.push('cpm')
  if (String(screen?.street ?? '').length > MAX_STREET_LENGTH) outOfRange.push('street')
  if (String(screen?.street_number ?? '').length > MAX_STREET_NUMBER_LENGTH) outOfRange.push('street_number')
  return outOfRange
}

// The bean bound above only catches a negative CPM; upstream's `validatePositive` rejects 0 as
// well (`placement.dooh.field.positive`). That error is indexed, so attributable, and the SSP-1133
// backfill left no cpm-0 rows for the soft delete to carry — so only the edit form runs this, to
// mark the field before sending. A blank CPM is legal and is not flagged.
export function nonPositiveCpm(screen) {
  return !isBlank(screen?.cpm) && Number(screen.cpm) <= 0
}

// Splits a selection into the rows the soft delete can carry and the rows it cannot. A row in
// `blocked` has to be unticked (or repaired through the edit dialog); the permanent delete is not
// an escape hatch for it, because that purges the whole ticked selection rather than the blocked
// rows alone. `missing` names the offending fields whatever the rule was — absent, blank, half a
// cpm/currency pair or out of range — since the user's move is the same for all of them.
export function partitionSoftDeletable(rows) {
  const deletable = []
  const blocked = []
  for (const row of rows) {
    const missing = [...missingRequiredFields(row), ...missingCurrencyPair(row), ...outOfRangeFields(row)]
    if (missing.length === 0) deletable.push(row)
    else blocked.push({ row, missing })
  }
  return { deletable, blocked }
}

// The two keys upstream fills in from the path itself, so an update body must never carry
// them. `ApiPlacementDoohSettingsServiceImpl.updateAll` does
// `item.setPlacementId(placementId); item.setPublisherId(actualPublisherId)` before it
// converts, `applyDtoFields` never writes the entity's publisher association on the update
// path, `validateAll` falls back to the path's placement id when the key is absent, and the
// JSON schema marks both `required: false`. Dropping them is therefore lossless.
//
// Sending them is not. `PlacementDoohValidatorImpl.validate` compares any *non-null* value
// against the path's owner, and `placement_dooh.publisher_id` is nullable in production (the
// upstream notes record drifted rows and dangling placements as known to exist), where our
// proxy decodes a NULL int64 into `0`. `"publisher_id": 0` is neither null nor '', so it
// would survive the filter below and raise `placement.dooh.publisher.id.mismatch` — killing
// the whole all-or-nothing batch on precisely the rows a delete exists to clear. A merely
// drifted, non-null value fails the same way. `placement_id` has the identical shape.
export const PATH_OWNED_KEYS = ['publisher_id', 'placement_id']

// Body for the soft delete: the selected rows, flipped to `status: 'deleted'`.
//
// Keys whose value is null or '' are dropped, exactly as the edit dialog's save does,
// and for the same reason: upstream's PUT is a full overwrite — `applyScreenFields` writes
// every column it is handed unconditionally (and `updateAll` writes `player_id` and
// `device_id` beside it), so an absent key becomes NULL while an empty-string key becomes
// ''. Seven *nullable* string columns — device_id, screen_img_url, region, zip, street,
// street_number, currency_code — are plain non-omitempty Go strings in `PlacementDoohItem`, so
// an upstream NULL already reaches us as "". (Seven other strings are non-omitempty too; those
// seven are the ones that are nullable upstream, which is what makes them lossy.) Copying a row
// whole would therefore rewrite up to seven NULL columns as '' on every soft delete, across up to
// 1000 rows, each landing in that row's UPDATE history diff. Dropping empty keys is the
// round-trip-faithful option.
//
// Every nullable *numeric* column is a pointer in `PlacementDoohItem` and arrives as null,
// so the same rule covers them: lat, lon, resolution_width, resolution_height,
// venue_type_id, width, height, min_duration, max_duration, avg_weekly_audience and cpm.
// Numeric zero survives on purpose — lat: 0 / lon: 0 is a real coordinate and width: 0 is
// storable — so the test is `!= null && !== ''`, never truthiness.
//
// `PATH_OWNED_KEYS` are dropped whatever they hold, for the reason given above them.
//
// This shapes the body only; whether a row *can* be sent is `partitionSoftDeletable`.
//
// Never mutates its input — the caller's rows are the dialog's live selection snapshot.
export function softDeleteBody(screens) {
  const rows = screens.map(screen => {
    const row = Object.fromEntries(
      // Deliberately NOT `isBlank`: trimming here would turn stored whitespace in a nullable,
      // non-required column into a NULL write, which is the very loss this filter avoids.
      Object.entries(screen).filter(([k, v]) => !PATH_OWNED_KEYS.includes(k) && v != null && v !== '')
    )
    row.status = DELETED_STATUS
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
