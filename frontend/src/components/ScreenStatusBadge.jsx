import { screenStatusBadge } from '../utils/screenStatus.js'

// A screen's `status` is a three-state string, not a boolean, so it gets its own badge
// beside the binary `StatusBadge` — shaped like `JobStatusBadge`, the app's other
// multi-state badge. The colours are a status decision and live in `utils/screenStatus.js`,
// where they are unit-tested.
export default function ScreenStatusBadge({ status }) {
  const { label, background, color } = screenStatusBadge(status)
  return (
    <span style={{ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.8rem', fontWeight: 500, background, color }}>
      {label}
    </span>
  )
}
