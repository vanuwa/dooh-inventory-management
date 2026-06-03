const _th = { padding: '0.75rem 1rem', background: '#f9fafb', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }
const _td = { padding: '0.75rem 1rem', fontSize: '0.9rem', color: '#111827', borderBottom: '1px solid #f3f4f6' }

export const tableStyles = {
  tableWrapper: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden' },
  th: _th,
  thCompact: { ..._th, whiteSpace: 'nowrap', minWidth: 110 },
  td: _td,
  tdCompact: { ..._td, fontSize: '0.875rem', whiteSpace: 'nowrap' },
  rowAlt: { background: '#fafafa' },
  pagination: { display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' },
  pageBtn: { padding: '0.375rem 0.875rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8125rem' },
  pageInfo: { fontSize: '0.875rem', color: '#6b7280' },
}
