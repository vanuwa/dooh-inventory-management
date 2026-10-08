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

// `dooh_settings[7].venue_type_tax` or `dooh_settings[7]`
const INDEXED_PROPERTY = /^dooh_settings\[(\d+)\](?:\.(.+))?$/

// Upstream keys batch validation errors by the row's index in the array we sent, never by
// id or player_id — useless to a user deciding which row to uncheck. The index is
// deterministic (it is the position in the array softDeleteBody built from the same rows),
// so rewrite it into something nameable before formatApiError renders it:
//
//   dooh_settings[7].venue_type_tax  ->  screen 4711 (test-player-042) — venue_type_tax
//
// Upstream indexes a one-element batch too for `placement.dooh.id.required`,
// `placement.dooh.duplicate.id` and `placement.dooh.unknown`, so the single-screen edit
// save labels its body through here as well. Every other property name passes through
// untouched, which covers the hard-delete `ids` errors. An index with no matching row
// degrades to the original property name rather than throwing.
//
// It rewrites *validator* errors only. A bean-validation error (`@NotBlank`, `@Size`,
// `@DecimalMin`, …) comes back as a 400 on the bare property name (`city`, `street`) with no
// `dooh_settings[i]` index even in a multi-row batch, so there is no screen to name — which
// is why `partitionSoftDeletable` blocks those rows before they are ever sent.
export function labelBatchErrors(errData, sentScreens) {
  if (!Array.isArray(errData?.messages)) return errData
  return {
    ...errData,
    messages: errData.messages.map(m => {
      const match = INDEXED_PROPERTY.exec(m?.property_name ?? '')
      if (!match) return m
      const screen = sentScreens[Number(match[1])]
      if (!screen) return m
      // player_id is required upstream but a legacy row can still be missing it, and
      // "screen 4711 ()" reads like a bug rather than like a blank field.
      const label = screen.player_id ? `screen ${screen.id} (${screen.player_id})` : `screen ${screen.id}`
      return { ...m, property_name: match[2] ? `${label} — ${match[2]}` : label }
    }),
  }
}
