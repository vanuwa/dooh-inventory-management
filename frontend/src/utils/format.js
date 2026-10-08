// Shared display formatters for screen/publisher data.

// "Name (id)" when a name is present, otherwise the bare id; dash when unknown.
export function fmtPublisher(id, name) {
  if (id == null) return '—'
  return name ? `${name} (${id})` : String(id)
}

// "street number" with blank parts dropped; dash when both are blank. Legacy (pre-SSP-1134) rows
// carry their whole old address in `street` with no number.
export function fmtStreet(street, number) {
  const text = [street, number].map(v => String(v ?? '').trim()).filter(Boolean).join(' ')
  return text || '—'
}
