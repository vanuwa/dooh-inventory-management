import { useState, useEffect } from 'react'
import { apiFetch } from '../api.js'
import JobStatusBadge from './JobStatusBadge.jsx'

export default function BulkUploadJobsTab({ publisherId }) {
  const [jobs, setJobs] = useState([])
  const [jobsTotal, setJobsTotal] = useState(0)
  const [jobsPage, setJobsPage] = useState(1)
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobsError, setJobsError] = useState('')
  const [refreshTick, setRefreshTick] = useState(0)
  const jobsLimit = 20

  const [uploadFile, setUploadFile] = useState(null)
  const [uploadResult, setUploadResult] = useState(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    setJobsLoading(true)
    setJobsError('')
    const controller = new AbortController()
    apiFetch(`/publishers/${publisherId}/bulk-upload-jobs?page=${jobsPage}&limit=${jobsLimit}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        setJobs(data.jobs ?? [])
        setJobsTotal(data.total ?? 0)
        setJobsLoading(false)
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        if (err.message !== 'Unauthorized') setJobsError('Failed to load bulk upload jobs.')
        setJobsLoading(false)
      })
    return () => controller.abort()
  }, [publisherId, jobsPage, refreshTick])

  async function handleCreateJob(e) {
    e.preventDefault()
    if (!uploadFile) return
    setUploading(true)
    setUploadResult(null)
    const formData = new FormData()
    formData.append('body', JSON.stringify({ job_type: 'PLACEMENT_DOOH', owner_object_id: parseInt(publisherId, 10) }))
    formData.append('file', uploadFile)
    try {
      const res = await apiFetch(`/publishers/${publisherId}/bulk-upload-jobs`, { method: 'POST', body: formData })
      let jobId = null
      let errorBody = null
      try {
        const data = await res.json()
        if (res.ok) { jobId = data.id ?? null }
        else { errorBody = data.message ?? data.error ?? JSON.stringify(data) }
      } catch (_) {}
      setUploadResult({ status: res.status, statusText: res.statusText, jobId, ok: res.ok, errorBody })
      if (res.ok) {
        setUploadFile(null)
        setRefreshTick(t => t + 1)
      }
    } catch (err) {
      if (err.message !== 'Unauthorized') setUploadResult({ status: 0, statusText: 'Network error', jobId: null })
    } finally {
      setUploading(false)
    }
  }

  const jobsTotalPages = Math.ceil(jobsTotal / jobsLimit)

  return (
    <>
      <div style={s.formCard}>
        <h4 style={s.formTitle}>New Bulk Upload Job</h4>
        <form onSubmit={handleCreateJob}>
          <div style={s.formRow}>
            <span style={s.formLabel}>Job Type</span>
            <span style={s.formValue}>PLACEMENT_DOOH</span>
          </div>
          <div style={s.formRow}>
            <span style={s.formLabel}>Publisher ID</span>
            <span style={s.formValue}>{publisherId}</span>
          </div>
          <div style={s.formRow}>
            <span style={s.formLabel}>File (.xlsx)</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={e => setUploadFile(e.target.files[0] ?? null)}
              style={{ fontSize: '0.875rem' }}
            />
          </div>
          {uploadResult && (
            <div style={uploadResult.ok ? s.resultSuccess : s.resultError}>
              <strong>{uploadResult.status} {uploadResult.statusText}</strong>
              {uploadResult.jobId && <span> — Job ID: {uploadResult.jobId}</span>}
              {!uploadResult.ok && uploadResult.errorBody && (
                <div style={{ marginTop: '0.25rem', fontSize: '0.8125rem' }}>{uploadResult.errorBody}</div>
              )}
            </div>
          )}
          <button type="submit" style={s.submitBtn} disabled={!uploadFile || uploading}>
            {uploading ? 'Uploading…' : 'Create Job'}
          </button>
        </form>
      </div>

      <div style={s.gridHeader}>
        <h3 style={s.sectionTitle}>Upload Jobs</h3>
        <button style={s.refreshBtn} onClick={() => setRefreshTick(t => t + 1)}>
          Refresh
        </button>
      </div>

      {jobsError && <p style={s.error}>{jobsError}</p>}
      {jobsLoading && <p style={s.muted}>Loading jobs…</p>}

      {!jobsLoading && !jobsError && jobs.length === 0 && (
        <p style={s.muted}>No bulk upload jobs found.</p>
      )}

      {!jobsLoading && jobs.length > 0 && (
        <>
          <div style={s.tableWrapper}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>ID</th>
                  <th style={s.th}>File Name</th>
                  <th style={s.th}>Executed By</th>
                  <th style={s.th}>Job Type</th>
                  <th style={s.th}>% Done</th>
                  <th style={s.th}>Started At</th>
                  <th style={s.th}>Ended At</th>
                  <th style={s.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job, i) => (
                  <tr key={job.id} style={i % 2 !== 0 ? s.rowAlt : undefined}>
                    <td style={s.td}><span style={s.idTag}>{job.id}</span></td>
                    <td style={s.td}>{job.file_name || '—'}</td>
                    <td style={s.td}>{job.executed_by || '—'}</td>
                    <td style={s.td}>{job.job_type || '—'}</td>
                    <td style={s.td}>{job.percentage_done != null ? `${job.percentage_done}%` : '—'}</td>
                    <td style={s.td}>{job.execution_started_at || '—'}</td>
                    <td style={s.td}>{job.execution_ended_at || '—'}</td>
                    <td style={s.td}><JobStatusBadge status={job.job_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {jobsTotalPages > 1 && (
            <div style={s.pagination}>
              <button style={s.pageBtn} onClick={() => setJobsPage(p => p - 1)} disabled={jobsPage === 1}>
                Prev
              </button>
              <span style={s.pageInfo}>Page {jobsPage} of {jobsTotalPages}</span>
              <button style={s.pageBtn} onClick={() => setJobsPage(p => p + 1)} disabled={jobsPage >= jobsTotalPages}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}

const s = {
  formCard: { background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: '1.25rem 1.375rem', marginBottom: '2rem' },
  formTitle: { margin: '0 0 1rem', fontSize: '0.9375rem', fontWeight: 600, color: '#374151' },
  formRow: { display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.375rem 0', marginBottom: '0.5rem' },
  formLabel: { fontSize: '0.8125rem', color: '#6b7280', fontWeight: 500, minWidth: 120 },
  formValue: { fontSize: '0.875rem', color: '#374151' },
  submitBtn: { marginTop: '1rem', padding: '0.4375rem 1rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 },
  resultSuccess: { marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#dcfce7', color: '#15803d', borderRadius: 4, fontSize: '0.875rem' },
  resultError: { marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#fee2e2', color: '#dc2626', borderRadius: 4, fontSize: '0.875rem' },

  gridHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  sectionTitle: { margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' },
  refreshBtn: { padding: '0.375rem 0.75rem', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: '0.8125rem' },

  tableWrapper: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden' },
  th: { padding: '0.75rem 1rem', background: '#f9fafb', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', textAlign: 'left', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '0.75rem 1rem', fontSize: '0.9rem', color: '#111827', borderBottom: '1px solid #f3f4f6' },
  rowAlt: { background: '#fafafa' },
  idTag: { color: '#6b7280', fontWeight: 400 },

  pagination: { display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' },
  pageBtn: { padding: '0.375rem 0.875rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8125rem' },
  pageInfo: { fontSize: '0.875rem', color: '#6b7280' },

  error: { color: '#dc2626', fontSize: '0.875rem' },
  muted: { color: '#6b7280', fontSize: '0.875rem' },
}
