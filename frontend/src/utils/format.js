// Shared display formatters for screen/publisher data.

// Whitespace-only counts as blank, as in `fmtStreet`, so a padded name never renders as an
// empty-looking cell. Shared with the screen validation rules in `screenStatus.js`, which trim
// for an upstream reason of their own (see the note at its import there).
export const isBlank = v => v == null || String(v).trim() === ''

// Both helpers below take (name, id), the order they render in.

// "Name (id)" when a name is present, otherwise the bare id; dash when the id is unknown,
// since a name alone cannot be looked up. Used for publisher, placement and country.
export function fmtNamedId(name, id) {
  if (isBlank(id)) return '—'
  return isBlank(name) ? String(id) : `${name} (${id})`
}

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
