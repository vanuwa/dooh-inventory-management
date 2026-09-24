import { screenStatusBadge } from '../utils/screenStatus.js'

const badge = {
  display: 'inline-block',
  padding: '0.2rem 0.6rem',
  borderRadius: 999,
  fontSize: '0.8rem',
  fontWeight: 500,
}

// The binary badge takes its colours from the same palette as the screen-status one, so the
// green and the grey are defined in a single place; only the labels are the caller's.
export function StatusBadge({ active, labels = ['Active', 'Inactive'] }) {
  const { background, color } = screenStatusBadge(active ? 'active' : 'inactive')
  return <span style={{ ...badge, background, color }}>{active ? labels[0] : labels[1]}</span>
}

// A screen's `status` is a three-state string, not a boolean, so it gets its own badge
// beside the binary one above (whose six call sites all pass booleans). It lives in this
// file to reuse the module-level `badge` base style, which is deliberately not exported.
export function ScreenStatusBadge({ status }) {
  const { label, background, color } = screenStatusBadge(status)
  return <span style={{ ...badge, background, color }}>{label}</span>
}
