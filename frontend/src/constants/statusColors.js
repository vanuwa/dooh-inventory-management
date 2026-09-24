// The green/grey pair every status badge in the app renders, in one neutral place so the
// generic binary `StatusBadge` (publishers, placements, users, the appnexus flag) and the
// three-state `screenStatusBadge` cannot drift apart — and so neither has to depend on the
// other's module. The screen-only rose "Deleted" pair stays in `utils/screenStatus.js`.
export const ACTIVE_BADGE_COLORS = { background: '#dcfce7', color: '#15803d' }
export const INACTIVE_BADGE_COLORS = { background: '#f3f4f6', color: '#6b7280' }
