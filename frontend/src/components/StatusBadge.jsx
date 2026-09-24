import { ACTIVE_BADGE_COLORS, INACTIVE_BADGE_COLORS } from '../constants/statusColors.js'

const badge = {
  display: 'inline-block',
  padding: '0.2rem 0.6rem',
  borderRadius: 999,
  fontSize: '0.8rem',
  fontWeight: 500,
}

// The binary badge: publishers, placements, publisher users and the appnexus Enabled flag.
// A screen's three-state `status` has its own badge in `ScreenStatusBadge.jsx`; both take
// their green and grey from `constants/statusColors.js`, so neither depends on the other.
export function StatusBadge({ active, labels = ['Active', 'Inactive'] }) {
  const { background, color } = active ? ACTIVE_BADGE_COLORS : INACTIVE_BADGE_COLORS
  return <span style={{ ...badge, background, color }}>{active ? labels[0] : labels[1]}</span>
}
