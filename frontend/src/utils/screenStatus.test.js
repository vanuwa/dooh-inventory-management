import { describe, it, expect } from 'vitest'
import {
  SCREEN_STATUS_OPTIONS,
  DEFAULT_SCREEN_STATUS_FILTER,
  SOFT_DELETE_REQUIRED_FIELDS,
  screensQuery,
  screenStatusBadge,
  softDeleteBody,
  missingRequiredFields,
  partitionSoftDeletable,
  deleteRequest,
  missingCurrencyPair,
  outOfRangeFields,
  DELETED_STATUS,
} from './screenStatus.js'

// Modelled on a real PlacementDoohItem payload: the seven nullable plain Go strings arrive
// as "" when upstream holds NULL, every nullable numeric arrives as null, and lat/lon/width
// are genuine zeroes that must survive the filter.
function fixtureScreen(overrides = {}) {
  return {
    id: 4711,
    publisher_id: 12,
    placement_id: 34,
    player_id: 'test-player-042',
    status: 'active',
    device_id: '',
    screen_img_url: '',
    orientation: 'landscape',
    resolution_width: 1920,
    resolution_height: 1080,
    venue_type_id: 101,
    venue_type_tax: 'openooh_v1_1',
    lat: 0,
    lon: 0,
    country_code: 'NL',
    region: '',
    city: 'Amsterdam',
    zip: '',
    street: '',
    street_number: '',
    width: 0,
    height: null,
    min_duration: null,
    max_duration: null,
    avg_weekly_audience: null,
    cpm: null,
    currency_code: '',
    allowed_content: 'all',
    ...overrides,
  }
}

describe('SCREEN_STATUS_OPTIONS', () => {
  it('is the four-option table the Screens filter renders, All first', () => {
    expect(SCREEN_STATUS_OPTIONS).toEqual([
      { value: '', label: 'All' },
      { value: 'active', label: 'Active only' },
      { value: 'inactive', label: 'Inactive only' },
      { value: 'deleted', label: 'Deleted only' },
    ])
  })

  it('has exactly one empty value — the absent-parameter "All"', () => {
    expect(SCREEN_STATUS_OPTIONS.filter(o => o.value === '')).toHaveLength(1)
  })

  it('lands on an option the table actually offers', () => {
    expect(SCREEN_STATUS_OPTIONS.map(o => o.value)).toContain(DEFAULT_SCREEN_STATUS_FILTER)
    expect(DEFAULT_SCREEN_STATUS_FILTER).toBe('active')
  })
})

describe('screensQuery', () => {
  const base = { page: 2, limit: 20 }

  it('always carries page and limit', () => {
    expect(screensQuery({ ...base, search: '', status: '' })).toBe('?page=2&limit=20')
  })

  it('omits status entirely for "All" — an empty &status= is a 400 upstream', () => {
    const query = screensQuery({ ...base, search: 'Amsterdam', status: '' })
    expect(query).not.toContain('status')
    expect(query).toBe('?page=2&limit=20&search=Amsterdam')
  })

  it('appends each concrete status token', () => {
    for (const status of ['active', 'inactive', 'deleted']) {
      expect(screensQuery({ ...base, search: '', status })).toBe(`?page=2&limit=20&status=${status}`)
    }
  })

  it('encodes the search term', () => {
    expect(screensQuery({ ...base, search: 'a&b c', status: 'active' }))
      .toBe('?page=2&limit=20&search=a%26b%20c&status=active')
  })

  it('omits an empty search', () => {
    expect(screensQuery({ ...base, search: '', status: 'active' })).toBe('?page=2&limit=20&status=active')
  })
})

describe('screenStatusBadge', () => {
  it('renders active in green', () => {
    expect(screenStatusBadge('active')).toEqual({ label: 'Active', background: '#dcfce7', color: '#15803d' })
  })

  it('renders deleted in rose', () => {
    expect(screenStatusBadge('deleted')).toEqual({ label: 'Deleted', background: '#ffe4e6', color: '#9f1239' })
  })

  it('renders inactive, null, undefined and an unknown status as grey Inactive', () => {
    const inactive = { label: 'Inactive', background: '#f3f4f6', color: '#6b7280' }
    expect(screenStatusBadge('inactive')).toEqual(inactive)
    expect(screenStatusBadge(null)).toEqual(inactive)
    expect(screenStatusBadge(undefined)).toEqual(inactive)
    expect(screenStatusBadge('something-else')).toEqual(inactive)
  })
})

describe('softDeleteBody', () => {
  it('flips every row to deleted', () => {
    const body = softDeleteBody([fixtureScreen(), fixtureScreen({ id: 4712, status: 'inactive' })])
    expect(body.dooh_settings.map(r => r.status)).toEqual(['deleted', 'deleted'])
  })

  it('keeps id, player_id and numeric zeroes', () => {
    const [row] = softDeleteBody([fixtureScreen()]).dooh_settings
    expect(row.id).toBe(4711)
    expect(row.player_id).toBe('test-player-042')
    expect(row.lat).toBe(0)
    expect(row.lon).toBe(0)
    expect(row.width).toBe(0)
  })

  it('drops the empty strings our proxy sends for NULL columns, and null pointers', () => {
    const [row] = softDeleteBody([fixtureScreen()]).dooh_settings
    for (const key of ['device_id', 'screen_img_url', 'region', 'zip', 'street', 'street_number', 'currency_code']) {
      expect(row).not.toHaveProperty(key)
    }
    expect(row).not.toHaveProperty('cpm')
    expect(row).not.toHaveProperty('height')
  })

  it('drops a NULL required column too — such a row is blocked before it is ever sent', () => {
    const [row] = softDeleteBody([fixtureScreen({ lat: null, country_code: '' })]).dooh_settings
    expect(row).not.toHaveProperty('lat')
    expect(row).not.toHaveProperty('country_code')
    // and that is exactly why partitionSoftDeletable has to stop the row first
    expect(missingRequiredFields(fixtureScreen({ lat: null, country_code: '' }))).toEqual(['lat', 'country_code'])
  })

  it('never sends publisher_id or placement_id — upstream sets both from the path', () => {
    // a NULL publisher_id reaches us as 0 through the Go int64, which is neither null nor ''
    const rows = softDeleteBody([fixtureScreen(), fixtureScreen({ id: 4712, publisher_id: 0, placement_id: 0 })]).dooh_settings
    for (const row of rows) {
      expect(row).not.toHaveProperty('publisher_id')
      expect(row).not.toHaveProperty('placement_id')
    }
    // the rest of the row is untouched by the drop
    expect(rows[0].id).toBe(4711)
    expect(rows[0].player_id).toBe('test-player-042')
  })

  it('drops an empty street pair and keeps a legacy street that has no number', () => {
    const [empty, legacy] = softDeleteBody([
      fixtureScreen(),
      fixtureScreen({ id: 4712, street: 'Damrak 1-5, 1012 LG Amsterdam' }),
    ]).dooh_settings
    expect(empty).not.toHaveProperty('street')
    expect(empty).not.toHaveProperty('street_number')
    expect(legacy.street).toBe('Damrak 1-5, 1012 LG Amsterdam')
    expect(legacy).not.toHaveProperty('street_number')
  })

  it('keeps a set value in a field that is usually empty', () => {
    const [row] = softDeleteBody([fixtureScreen({ region: 'NH', cpm: 1.5, currency_code: 'EUR' })]).dooh_settings
    expect(row.region).toBe('NH')
    expect(row.cpm).toBe(1.5)
    expect(row.currency_code).toBe('EUR')
  })

  it('does not mutate its input', () => {
    const screen = fixtureScreen()
    const before = JSON.stringify(screen)
    softDeleteBody([screen])
    expect(JSON.stringify(screen)).toBe(before)
    expect(screen.status).toBe('active')
  })

  it('returns an empty batch for an empty selection', () => {
    expect(softDeleteBody([])).toEqual({ dooh_settings: [] })
  })
})

describe('missingRequiredFields', () => {
  it('reports nothing for a complete row', () => {
    expect(missingRequiredFields(fixtureScreen())).toEqual([])
  })

  it('treats a numeric zero as supplied — lat 0 is a real coordinate', () => {
    expect(missingRequiredFields(fixtureScreen({ lat: 0, lon: 0 }))).toEqual([])
  })

  it('reports a NULL numeric column, which the proxy now sends as null', () => {
    expect(missingRequiredFields(fixtureScreen({ lat: null, venue_type_id: null })))
      .toEqual(['venue_type_id', 'lat'])
  })

  it('reports the empty string our proxy sends for a NULL required string column', () => {
    expect(missingRequiredFields(fixtureScreen({ country_code: '', city: '', allowed_content: '', venue_type_tax: '' })))
      .toEqual(['venue_type_tax', 'country_code', 'city', 'allowed_content'])
  })

  it('reports a whitespace-only value in a @NotBlank field', () => {
    expect(missingRequiredFields(fixtureScreen({ city: '   ', venue_type_tax: '\t', player_id: ' ' })))
      .toEqual(['player_id', 'venue_type_tax', 'city'])
  })

  it('covers exactly the ten fields upstream marks required', () => {
    expect(SOFT_DELETE_REQUIRED_FIELDS).toEqual([
      'player_id', 'resolution_width', 'resolution_height', 'venue_type_id', 'venue_type_tax',
      'lat', 'lon', 'country_code', 'city', 'allowed_content',
    ])
  })
})

describe('partitionSoftDeletable', () => {
  it('keeps complete rows and blocks incomplete ones, with what each is missing', () => {
    const good = fixtureScreen()
    const bad = fixtureScreen({ id: 4712, city: '' })
    const { deletable, blocked } = partitionSoftDeletable([good, bad])
    expect(deletable).toEqual([good])
    expect(blocked).toEqual([{ row: bad, missing: ['city'] }])
  })

  it('blocks nothing when every row is complete', () => {
    const { deletable, blocked } = partitionSoftDeletable([fixtureScreen(), fixtureScreen({ id: 4712 })])
    expect(deletable).toHaveLength(2)
    expect(blocked).toEqual([])
  })

  it('blocks a whitespace-only required field, which @NotBlank rejects with an unattributable 400', () => {
    const bad = fixtureScreen({ id: 4713, allowed_content: '  ' })
    expect(partitionSoftDeletable([bad]).blocked).toEqual([{ row: bad, missing: ['allowed_content'] }])
  })

  it('blocks either half of the cpm/currency_code pair, naming the absent one', () => {
    const noCurrency = fixtureScreen({ id: 4714, cpm: 2.5 })
    const noCpm = fixtureScreen({ id: 4715, currency_code: 'EUR' })
    expect(partitionSoftDeletable([noCurrency]).blocked).toEqual([{ row: noCurrency, missing: ['currency_code'] }])
    expect(partitionSoftDeletable([noCpm]).blocked).toEqual([{ row: noCpm, missing: ['cpm'] }])
  })

  it('allows both halves set and both halves absent', () => {
    const both = fixtureScreen({ id: 4716, cpm: 2.5, currency_code: 'EUR' })
    const neither = fixtureScreen({ id: 4717 })
    expect(partitionSoftDeletable([both, neither]).blocked).toEqual([])
  })

  // The bean-validation bounds on PlacementDoohDto fail exactly like @NotNull/@NotBlank: at
  // @Valid time, as a 400 on the bare property name, naming no screen, that takes the whole
  // batch with it.
  it('blocks a lat outside the WGS84 bounds, naming lat', () => {
    const tooHigh = fixtureScreen({ id: 4718, lat: 90.5 })
    const tooLow = fixtureScreen({ id: 4719, lat: -91 })
    expect(partitionSoftDeletable([tooHigh]).blocked).toEqual([{ row: tooHigh, missing: ['lat'] }])
    expect(partitionSoftDeletable([tooLow]).blocked).toEqual([{ row: tooLow, missing: ['lat'] }])
  })

  it('blocks a lon outside the WGS84 bounds, naming lon', () => {
    const bad = fixtureScreen({ id: 4720, lon: 180.1 })
    expect(partitionSoftDeletable([bad]).blocked).toEqual([{ row: bad, missing: ['lon'] }])
  })

  it('blocks a player_id longer than @Size(max = 255)', () => {
    const bad = fixtureScreen({ id: 4721, player_id: 'p'.repeat(256) })
    expect(partitionSoftDeletable([bad]).blocked).toEqual([{ row: bad, missing: ['player_id'] }])
  })

  it('blocks a negative cpm, which @DecimalMin("0.0") rejects', () => {
    const bad = fixtureScreen({ id: 4722, cpm: -0.01, currency_code: 'EUR' })
    expect(partitionSoftDeletable([bad]).blocked).toEqual([{ row: bad, missing: ['cpm'] }])
  })

  it('blocks a street or street_number longer than its @Size, naming the field', () => {
    const longStreet = fixtureScreen({ id: 4725, street: 's'.repeat(1025) })
    const longNumber = fixtureScreen({ id: 4726, street: 'Damrak', street_number: '1'.repeat(33) })
    expect(partitionSoftDeletable([longStreet]).blocked).toEqual([{ row: longStreet, missing: ['street'] }])
    expect(partitionSoftDeletable([longNumber]).blocked).toEqual([{ row: longNumber, missing: ['street_number'] }])
  })

  it('allows values at and inside the bounds — both @DecimalMin and @DecimalMax are inclusive', () => {
    const edges = fixtureScreen({ id: 4723, lat: 90, lon: -180, cpm: 0, currency_code: 'EUR' })
    const inside = fixtureScreen({ id: 4724, lat: 52.37, lon: 4.89, player_id: 'p'.repeat(255) })
    expect(partitionSoftDeletable([edges, inside]).blocked).toEqual([])
  })
})

describe('deleteRequest', () => {
  const rows = [fixtureScreen(), fixtureScreen({ id: 4712, player_id: 'test-player-043' })]
  const ctx = { publisherId: 42, placementId: 101 }

  it('sends the checked rows as a soft-delete PUT body, not the ids', () => {
    const { path, options } = deleteRequest({ rows, hardDelete: false, ...ctx })
    expect(path).toBe('/publishers/42/placements/101/dooh-settings')
    expect(options.method).toBe('PUT')
    const body = JSON.parse(options.body)
    expect(body.dooh_settings.map(r => r.id)).toEqual([4711, 4712])
    expect(body.dooh_settings.map(r => r.status)).toEqual(['deleted', 'deleted'])
  })

  it('builds the body from the rows it is handed and nothing else', () => {
    const { options } = deleteRequest({ rows: [rows[1]], hardDelete: false, ...ctx })
    expect(JSON.parse(options.body).dooh_settings.map(r => r.id)).toEqual([4712])
  })

  it('sends only the ids as a hard-delete DELETE selector, with no body', () => {
    const { path, options } = deleteRequest({ rows, hardDelete: true, ...ctx })
    expect(path).toBe('/publishers/42/placements/101/dooh-settings?ids=4711,4712')
    expect(options.method).toBe('DELETE')
    expect(options.body).toBeUndefined()
  })
})

describe('missingCurrencyPair', () => {
  it('reports nothing when both halves are set or both are absent', () => {
    expect(missingCurrencyPair(fixtureScreen({ cpm: 2.5, currency_code: 'EUR' }))).toEqual([])
    expect(missingCurrencyPair(fixtureScreen({ cpm: null, currency_code: '' }))).toEqual([])
  })

  it('names the absent half in either direction', () => {
    expect(missingCurrencyPair(fixtureScreen({ cpm: 2.5, currency_code: '' }))).toEqual(['currency_code'])
    expect(missingCurrencyPair(fixtureScreen({ cpm: null, currency_code: 'EUR' }))).toEqual(['cpm'])
  })

  it('treats a whitespace-only currency_code as absent', () => {
    expect(missingCurrencyPair(fixtureScreen({ cpm: 2.5, currency_code: '   ' }))).toEqual(['currency_code'])
  })
})

// Exported in its own right because the single-screen edit dialog runs it too: the same six
// bean-validation bounds fail the same unattributable way on a one-row PUT.
describe('outOfRangeFields', () => {
  it('reports nothing for a row inside every bound', () => {
    expect(outOfRangeFields(fixtureScreen())).toEqual([])
  })

  it('reports a lat or lon outside the WGS84 bounds', () => {
    expect(outOfRangeFields(fixtureScreen({ lat: 999 }))).toEqual(['lat'])
    expect(outOfRangeFields(fixtureScreen({ lon: -181 }))).toEqual(['lon'])
  })

  it('reports a player_id longer than @Size(max = 255)', () => {
    expect(outOfRangeFields(fixtureScreen({ player_id: 'x'.repeat(256) }))).toEqual(['player_id'])
    expect(outOfRangeFields(fixtureScreen({ player_id: 'x'.repeat(255) }))).toEqual([])
  })

  it('reports a negative cpm and accepts zero, both @DecimalMin("0.0") being inclusive', () => {
    expect(outOfRangeFields(fixtureScreen({ cpm: -0.01, currency_code: 'EUR' }))).toEqual(['cpm'])
    expect(outOfRangeFields(fixtureScreen({ cpm: 0, currency_code: 'EUR' }))).toEqual([])
  })

  it('reports a street longer than @Size(max = 1024) and a street_number longer than @Size(max = 32)', () => {
    expect(outOfRangeFields(fixtureScreen({ street: 's'.repeat(1025) }))).toEqual(['street'])
    expect(outOfRangeFields(fixtureScreen({ street_number: '1'.repeat(33) }))).toEqual(['street_number'])
  })

  it('accepts a street of exactly 1024 and a street_number of exactly 32 — @Size is inclusive', () => {
    expect(outOfRangeFields(fixtureScreen({ street: 's'.repeat(1024), street_number: '1'.repeat(32) }))).toEqual([])
  })

  it('accepts an absent street and street_number — neither is required', () => {
    expect(outOfRangeFields(fixtureScreen({ street: undefined, street_number: undefined }))).toEqual([])
    expect(outOfRangeFields(fixtureScreen({ street: null, street_number: null }))).toEqual([])
  })

  it('accepts the exact bounds — @DecimalMin and @DecimalMax are inclusive', () => {
    expect(outOfRangeFields(fixtureScreen({ lat: 90, lon: 180 }))).toEqual([])
    expect(outOfRangeFields(fixtureScreen({ lat: -90, lon: -180 }))).toEqual([])
  })

  it('reads the strings the edit dialog holds, not just coerced numbers', () => {
    expect(outOfRangeFields({ lat: '999', lon: '0' })).toEqual(['lat'])
    expect(outOfRangeFields({ lat: '52.37', lon: '4.89' })).toEqual([])
  })

  it('reports every field it can, so the form can mark them all at once', () => {
    expect(outOfRangeFields({
      lat: 91, lon: 181, player_id: 'x'.repeat(256), cpm: -1, street: 's'.repeat(1025), street_number: '1'.repeat(33),
    })).toEqual(['lat', 'lon', 'player_id', 'cpm', 'street', 'street_number'])
  })

  it('ignores an absent or blank value — that is missingRequiredFields\' call', () => {
    expect(outOfRangeFields({})).toEqual([])
    expect(outOfRangeFields({ lat: '', lon: null, cpm: '   ' })).toEqual([])
  })
})

describe('DELETED_STATUS', () => {
  it('is the one spelling the filter, the badge and the soft-delete body share', () => {
    expect(DELETED_STATUS).toBe('deleted')
    expect(SCREEN_STATUS_OPTIONS.map(o => o.value)).toContain(DELETED_STATUS)
    expect(screenStatusBadge(DELETED_STATUS).label).toBe('Deleted')
    expect(softDeleteBody([fixtureScreen()]).dooh_settings[0].status).toBe(DELETED_STATUS)
  })
})
