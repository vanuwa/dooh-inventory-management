// Renders an upstream API error body as display text.
// Prefers messages[] ("prop: description" per line), then message, then the caller's fallback.
// Never returns an empty string: callers render the result conditionally, so an empty
// result would leave the user with no feedback at all.
export function formatApiError(errData, fallback) {
  if (Array.isArray(errData?.messages)) {
    const lines = errData.messages
      .map(m => [m.property_name, m.description || m.error_code].filter(Boolean).join(': '))
      .filter(Boolean)
    if (lines.length > 0) return lines.join('\n')
  }
  // a gateway-level 403/5xx may carry only {type} or a non-JSON body (parsed as {})
  return errData?.message || fallback
}
