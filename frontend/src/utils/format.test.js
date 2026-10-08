import { describe, it, expect } from 'vitest'
import { isBlank, fmtStreet, fmtNamedId, fmtNameOrId } from './format.js'

describe('isBlank', () => {
  it('counts null, undefined, empty and whitespace-only as blank', () => {
    expect(isBlank(null)).toBe(true)
    expect(isBlank(undefined)).toBe(true)
    expect(isBlank('')).toBe(true)
    expect(isBlank('   ')).toBe(true)
  })

  it('counts numeric zero and any text as present', () => {
    expect(isBlank(0)).toBe(false)
    expect(isBlank('0')).toBe(false)
    expect(isBlank(' a ')).toBe(false)
  })
})

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

describe('fmtNamedId', () => {
  it('renders "name (id)" when both are present', () => {
    expect(fmtNamedId('Acme', 42)).toBe('Acme (42)')
    expect(fmtNamedId('The Netherlands', 'NL')).toBe('The Netherlands (NL)')
  })

  it('falls back to the bare id when there is no name', () => {
    expect(fmtNamedId(null, 42)).toBe('42')
    expect(fmtNamedId('', 'NL')).toBe('NL')
    expect(fmtNamedId(undefined, 0)).toBe('0')
  })

  it('treats a whitespace-only name as absent', () => {
    expect(fmtNamedId('  ', 42)).toBe('42')
  })

  it('renders a dash for a name with no id, a blank id included', () => {
    expect(fmtNamedId('Acme', null)).toBe('—')
    expect(fmtNamedId('Acme', '')).toBe('—')
    expect(fmtNamedId('The Netherlands', '  ')).toBe('—')
  })

  it('renders a dash when neither is present', () => {
    expect(fmtNamedId(undefined, undefined)).toBe('—')
  })
})

describe('fmtNameOrId', () => {
  it('prefers the name when both are present', () => {
    expect(fmtNameOrId('Transit', 5)).toBe('Transit')
  })

  it('falls back to the id when there is no name', () => {
    expect(fmtNameOrId(null, 5)).toBe('5')
    expect(fmtNameOrId('', 5)).toBe('5')
    expect(fmtNameOrId(undefined, 0)).toBe('0')
  })

  it('treats a whitespace-only name as absent', () => {
    expect(fmtNameOrId('  ', 5)).toBe('5')
    expect(fmtNameOrId('  ', null)).toBe('—')
  })

  it('renders the name when there is no id', () => {
    expect(fmtNameOrId('Transit', null)).toBe('Transit')
  })

  it('renders a dash when neither is present', () => {
    expect(fmtNameOrId(null, undefined)).toBe('—')
    expect(fmtNameOrId('', '')).toBe('—')
  })
})
