import { describe, it, expect } from 'vitest'
import { fmtStreet } from './format.js'

describe('fmtStreet', () => {
  it('renders a street with no number', () => {
    expect(fmtStreet('Main Street 12a, Amsterdam', '')).toBe('Main Street 12a, Amsterdam')
    expect(fmtStreet('Main Street', null)).toBe('Main Street')
  })

  it('joins street and number with a space', () => {
    expect(fmtStreet('Main Street', '12a')).toBe('Main Street 12a')
  })

  it('renders a number with no street', () => {
    expect(fmtStreet('', '12a')).toBe('12a')
    expect(fmtStreet(undefined, '12a')).toBe('12a')
  })

  it('renders a dash when both are blank', () => {
    expect(fmtStreet('', '')).toBe('—')
    expect(fmtStreet(null, undefined)).toBe('—')
  })

  it('trims whitespace and treats whitespace-only parts as blank', () => {
    expect(fmtStreet('  Main Street  ', '  12a ')).toBe('Main Street 12a')
    expect(fmtStreet('   ', '12a')).toBe('12a')
    expect(fmtStreet('  ', ' ')).toBe('—')
  })
})
