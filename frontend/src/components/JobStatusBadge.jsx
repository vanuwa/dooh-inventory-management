const map = {
  JOB_COMPLETED:             { background: '#22c55e', color: '#fff' },
  JOB_COMPLETED_WITH_ERRORS: { background: '#f97316', color: '#fff' },
  JOB_FAILED:                { background: '#ef4444', color: '#fff' },
  JOB_RUNNING:               { background: '#3b82f6', color: '#fff' },
  JOB_PENDING:               { background: '#eab308', color: '#fff' },
}

export default function JobStatusBadge({ status }) {
  return (
    <span style={{ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600, ...(map[status] ?? { background: '#6b7280', color: '#fff' }) }}>
      {status || '—'}
    </span>
  )
}
