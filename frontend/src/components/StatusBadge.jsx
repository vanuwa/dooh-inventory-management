const badge = {
  display: 'inline-block',
  padding: '0.2rem 0.6rem',
  borderRadius: 999,
  fontSize: '0.8rem',
  fontWeight: 500,
}

export function StatusBadge({ active }) {
  const style = active
    ? { ...badge, background: '#dcfce7', color: '#15803d' }
    : { ...badge, background: '#f3f4f6', color: '#6b7280' }
  return <span style={style}>{active ? 'Active' : 'Inactive'}</span>
}
