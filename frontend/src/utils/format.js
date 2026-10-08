// Shared display formatters for screen/publisher data.

const isBlank = v => v == null || v === ''

// "Name (id)" when a name is present, otherwise the bare id; dash when the id is unknown,
// since a name alone cannot be looked up. Used for publisher, placement and country.
export function fmtNamedId(id, name) {
  if (isBlank(id)) return '—'
  return name ? `${name} (${id})` : String(id)
}

export const fmtPublisher = fmtNamedId

// The name alone, falling back to the id, then a dash — for venue type and taxonomy,
// where the name is what an operator reads and the id adds little.
export function fmtNameOrId(name, id) {
  if (!isBlank(name)) return String(name)
  return isBlank(id) ? '—' : String(id)
}

// "street number" with blank parts dropped; dash when both are blank. Legacy (pre-SSP-1134) rows
// carry their whole old address in `street` with no number.
export function fmtStreet(street, number) {
  const text = [street, number].map(v => String(v ?? '').trim()).filter(Boolean).join(' ')
  return text || '—'
}
