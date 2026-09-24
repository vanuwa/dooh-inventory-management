import { screenStatusBadge } from '../utils/screenStatus.js'

const badge = {
  display: 'inline-block',
  padding: '0.2rem 0.6rem',
  borderRadius: 999,
  fontSize: '0.8rem',
  fontWeight: 500,
}

export function StatusBadge({ active, labels = ['Active', 'Inactive'] }) {
  const style = active
    ? { ...badge, background: '#dcfce7', color: '#15803d' }
    : { ...badge, background: '#f3f4f6', color: '#6b7280' }
  return <span style={style}>{active ? labels[0] : labels[1]}</span>
}

// A screen's `status` is a three-state string, not a boolean, so it gets its own badge
// beside the binary one above (whose six call sites all pass booleans). It lives in this
// file to reuse the module-level `badge` base style, which is deliberately not exported.
export function ScreenStatusBadge({ status }) {
  const { label, background, color } = screenStatusBadge(status)
  return <span style={{ ...badge, background, color }}>{label}</span>
}
