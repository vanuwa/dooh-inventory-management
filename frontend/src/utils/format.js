// Shared display formatters for screen/publisher data.

// "Name (id)" when a name is present, otherwise the bare id; dash when unknown.
export function fmtPublisher(id, name) {
  if (id == null) return '—'
  return name ? `${name} (${id})` : String(id)
}
