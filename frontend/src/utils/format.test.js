import { describe, it, expect } from 'vitest'
import { fmtStreet, fmtNamedId, fmtPublisher, fmtNameOrId } from './format.js'

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
    expect(fmtNamedId(42, 'Acme')).toBe('Acme (42)')
    expect(fmtNamedId('NL', 'The Netherlands')).toBe('The Netherlands (NL)')
  })

  it('falls back to the bare id when there is no name', () => {
    expect(fmtNamedId(42, null)).toBe('42')
    expect(fmtNamedId('NL', '')).toBe('NL')
    expect(fmtNamedId(0, undefined)).toBe('0')
  })

  it('renders a dash for a name with no id', () => {
    expect(fmtNamedId(null, 'Acme')).toBe('—')
    expect(fmtNamedId('', 'The Netherlands')).toBe('—')
  })

  it('renders a dash when neither is present', () => {
    expect(fmtNamedId(undefined, undefined)).toBe('—')
  })
})

describe('fmtPublisher', () => {
  it('behaves as before', () => {
    expect(fmtPublisher(347, 'Acme')).toBe('Acme (347)')
    expect(fmtPublisher(347, null)).toBe('347')
    expect(fmtPublisher(null, 'Acme')).toBe('—')
    expect(fmtPublisher(undefined, undefined)).toBe('—')
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

  it('renders the name when there is no id', () => {
    expect(fmtNameOrId('Transit', null)).toBe('Transit')
  })

  it('renders a dash when neither is present', () => {
    expect(fmtNameOrId(null, undefined)).toBe('—')
    expect(fmtNameOrId('', '')).toBe('—')
  })
})
