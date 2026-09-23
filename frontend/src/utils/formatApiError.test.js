import { describe, it, expect } from 'vitest'
import { formatApiError } from './formatApiError.js'

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
