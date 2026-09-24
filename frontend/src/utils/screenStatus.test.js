import { describe, it, expect } from 'vitest'
import { SCREEN_STATUS_OPTIONS, screenStatusBadge, softDeleteBody, labelBatchErrors } from './screenStatus.js'

// Modelled on a real PlacementDoohItem payload: the six plain Go strings arrive as ""
// when upstream holds NULL, the pointer fields arrive as null, and lat/lon/width are
// genuine zeroes that must survive the filter.
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
    address: '',
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
  it("contains the 'active' default the Screens tab lands on", () => {
    expect(SCREEN_STATUS_OPTIONS.map(o => o.value)).toContain('active')
  })

  it('offers only tokens the upstream status vocabulary defines', () => {
    const tokens = SCREEN_STATUS_OPTIONS.map(o => o.value).filter(Boolean)
    expect(tokens).toEqual(['active', 'inactive', 'deleted'])
  })

  it('has exactly one empty value — the absent-parameter "All"', () => {
    const empty = SCREEN_STATUS_OPTIONS.filter(o => o.value === '')
    expect(empty).toHaveLength(1)
    expect(empty[0].label).toBe('All')
  })

  it('labels every option', () => {
    for (const option of SCREEN_STATUS_OPTIONS) {
      expect(option.label).toBeTruthy()
    }
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
    for (const key of ['device_id', 'screen_img_url', 'region', 'zip', 'address', 'currency_code']) {
      expect(row).not.toHaveProperty(key)
    }
    expect(row).not.toHaveProperty('cpm')
    expect(row).not.toHaveProperty('height')
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

describe('labelBatchErrors', () => {
  const rows = [fixtureScreen(), fixtureScreen({ id: 4712, player_id: 'test-player-043' })]

  it('names the screen behind an indexed property', () => {
    const body = {
      messages: [{ property_name: 'dooh_settings[1].venue_type_tax', description: "taxonomy 'X' not found" }],
    }
    expect(labelBatchErrors(body, rows).messages[0].property_name)
      .toBe('screen 4712 (test-player-043) — venue_type_tax')
  })

  it('names the screen for an indexed property with no field suffix', () => {
    const body = { messages: [{ property_name: 'dooh_settings[0]', description: 'not found' }] }
    expect(labelBatchErrors(body, rows).messages[0].property_name).toBe('screen 4711 (test-player-042)')
  })

  it('passes a bare property through untouched (the single-row PUT is never indexed)', () => {
    const body = { messages: [{ property_name: 'venue_type_tax', description: 'not found' }] }
    expect(labelBatchErrors(body, rows).messages[0].property_name).toBe('venue_type_tax')
  })

  it('passes the hard-delete ids property through untouched', () => {
    const body = { messages: [{ property_name: 'ids', description: 'Unknown dooh setting id 7' }] }
    expect(labelBatchErrors(body, rows).messages[0].property_name).toBe('ids')
  })

  it('degrades to the original property name for an index with no matching row', () => {
    const body = { messages: [{ property_name: 'dooh_settings[9].cpm', description: 'bad' }] }
    expect(labelBatchErrors(body, rows).messages[0].property_name).toBe('dooh_settings[9].cpm')
    expect(labelBatchErrors(body, []).messages[0].property_name).toBe('dooh_settings[9].cpm')
  })

  it('keeps the description and the rest of the body', () => {
    const body = {
      type: 'ValidationException',
      messages: [{ property_name: 'dooh_settings[0].cpm', description: 'must be positive', error_code: 'x' }],
    }
    const out = labelBatchErrors(body, rows)
    expect(out.type).toBe('ValidationException')
    expect(out.messages[0]).toEqual({
      property_name: 'screen 4711 (test-player-042) — cpm',
      description: 'must be positive',
      error_code: 'x',
    })
  })

  it('does not mutate the body it is given', () => {
    const body = { messages: [{ property_name: 'dooh_settings[0].cpm', description: 'bad' }] }
    labelBatchErrors(body, rows)
    expect(body.messages[0].property_name).toBe('dooh_settings[0].cpm')
  })

  it('returns a body with no messages[] unchanged', () => {
    const body = { message: 'access denied' }
    expect(labelBatchErrors(body, rows)).toBe(body)
    expect(labelBatchErrors(null, rows)).toBe(null)
    expect(labelBatchErrors(undefined, rows)).toBe(undefined)
  })

  it('tolerates a message with no property_name', () => {
    const body = { messages: [{ error_code: 'access.denied' }] }
    expect(labelBatchErrors(body, rows).messages[0]).toEqual({ error_code: 'access.denied' })
  })
})
