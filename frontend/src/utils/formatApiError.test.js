import { describe, it, expect } from 'vitest'
import { formatApiError, labelBatchErrors } from './formatApiError.js'

describe('formatApiError', () => {
  it('renders one line per messages[] entry', () => {
    const body = {
      type: 'ValidationException',
      messages: [
        { property_name: 'ids', description: 'Unknown dooh setting id 7' },
        { property_name: 'ids', description: 'Unknown dooh setting id 9' },
      ],
    }
    expect(formatApiError(body, 'F')).toBe('ids: Unknown dooh setting id 7\nids: Unknown dooh setting id 9')
  })

  it('falls back to error_code when description is missing', () => {
    const body = { messages: [{ property_name: 'ids', error_code: 'placement.dooh.unknown' }] }
    expect(formatApiError(body, 'F')).toBe('ids: placement.dooh.unknown')
  })

  it('falls back to error_code when description is an empty string', () => {
    const body = { messages: [{ property_name: 'ids', description: '', error_code: 'placement.dooh.unknown' }] }
    expect(formatApiError(body, 'F')).toBe('ids: placement.dooh.unknown')
  })

  it('renders an entry that carries only an error_code', () => {
    expect(formatApiError({ messages: [{ error_code: 'access.denied' }] }, 'F')).toBe('access.denied')
  })

  it('uses the fallback when a messages[] entry carries nothing renderable', () => {
    expect(formatApiError({ messages: [{}] }, 'Delete failed (403)')).toBe('Delete failed (403)')
  })

  it('uses the fallback for an empty messages[]', () => {
    expect(formatApiError({ messages: [] }, 'Delete failed (403)')).toBe('Delete failed (403)')
  })

  it('drops unrenderable entries but keeps the renderable ones', () => {
    const body = { messages: [{}, { property_name: 'ids', description: 'bad' }] }
    expect(formatApiError(body, 'F')).toBe('ids: bad')
  })

  it('uses message when there is no messages[]', () => {
    expect(formatApiError({ message: 'exactly one ids parameter is required' }, 'F'))
      .toBe('exactly one ids parameter is required')
  })

  it('uses the fallback for an empty message', () => {
    expect(formatApiError({ message: '' }, 'Delete failed (400)')).toBe('Delete failed (400)')
  })

  it('never shows a bare exception type', () => {
    expect(formatApiError({ type: 'ValidationException' }, 'Delete failed (403)')).toBe('Delete failed (403)')
  })

  it('uses the fallback for an empty body', () => {
    expect(formatApiError({}, 'Delete failed (403)')).toBe('Delete failed (403)')
  })

  it('uses the fallback for null / undefined', () => {
    expect(formatApiError(null, 'Delete failed (403)')).toBe('Delete failed (403)')
    expect(formatApiError(undefined, 'Delete failed (403)')).toBe('Delete failed (403)')
  })
})

// labelBatchErrors reads only `id` and `player_id` off the rows it is handed.
describe('labelBatchErrors', () => {
  const rows = [{ id: 4711, player_id: 'test-player-042' }, { id: 4712, player_id: 'test-player-043' }]

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

  it('passes a property with no dooh_settings[i] prefix through untouched', () => {
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

  it('names a screen with no player_id without empty parentheses', () => {
    const body = { messages: [{ property_name: 'dooh_settings[0].cpm', description: 'bad' }] }
    expect(labelBatchErrors(body, [{ id: 4711, player_id: '' }]).messages[0].property_name)
      .toBe('screen 4711 — cpm')
  })

  it('renders through formatApiError, the only way it is ever used', () => {
    const body = {
      messages: [
        { property_name: 'dooh_settings[1].venue_type_tax', description: "taxonomy 'X' not found" },
        { property_name: 'dooh_settings[0]', description: 'DOOH setting not found with id 4711' },
      ],
    }
    expect(formatApiError(labelBatchErrors(body, rows), 'Delete failed (400)')).toBe(
      "screen 4712 (test-player-043) — venue_type_tax: taxonomy 'X' not found\n" +
      'screen 4711 (test-player-042): DOOH setting not found with id 4711'
    )
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
