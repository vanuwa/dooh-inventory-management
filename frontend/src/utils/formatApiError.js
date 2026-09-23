// Renders an upstream API error body as display text.
// Prefers messages[] ("prop: description" per line), then errors[], then message, then fallback.
export function formatApiError(errData, fallback) {
  if (Array.isArray(errData?.messages) && errData.messages.length > 0) {
    return errData.messages
      .map(m => [m.property_name, m.description ?? m.error_code].filter(Boolean).join(': '))
      .join('\n')
  }
  if (Array.isArray(errData?.errors) && errData.errors.length > 0) {
    return `${errData.message ?? fallback} — ${errData.errors.join(', ')}`
  }
  // a gateway-level 403/5xx may carry only {type} or a non-JSON body (parsed as {})
  return errData?.message ?? errData?.type ?? fallback
}
