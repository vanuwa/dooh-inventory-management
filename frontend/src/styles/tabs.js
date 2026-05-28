const tabBase = { padding: '0.5rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', marginBottom: -2 }

export const tabStyles = {
  tabBar:   { display: 'flex', marginBottom: '1.5rem', borderBottom: '2px solid #e5e7eb' },
  tab:      { ...tabBase, color: '#6b7280', fontWeight: 500, borderBottom: '2px solid transparent' },
  tabActive: { ...tabBase, color: '#1a1a2e', fontWeight: 600, borderBottom: '2px solid #1a1a2e' },
}
