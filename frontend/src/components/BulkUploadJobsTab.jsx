import { useState, useEffect } from 'react'
import { apiFetch } from '../api.js'
import JobStatusBadge from './JobStatusBadge.jsx'
import PaginationControls from './PaginationControls.jsx'
import { tableStyles } from '../styles/tables.js'

function JobDetailsModal({ job, onClose }) {
  const tasks = job.tasks ?? []
  const completedCount = tasks.filter(t => t.status === 'TASK_COMPLETED').length
  const failedTasks = tasks.filter(t => t.status !== 'TASK_COMPLETED')
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <h3 style={s.modalTitle}>Job #{job.id} Details</h3>

        <div style={s.modalSection}>
          <div style={s.modalRow}>
            <span style={s.modalLabel}>Job Type</span>
            <span style={s.modalValue}>{job.job_type || '—'}</span>
          </div>
          <div style={s.modalRow}>
            <span style={s.modalLabel}>File MIME Type</span>
            <span style={s.modalValue}>{job.mime_type || '—'}</span>
          </div>
          <div style={s.modalRow}>
            <span style={s.modalLabel}>Status</span>
            <JobStatusBadge status={job.job_status} />
          </div>
          <div style={s.modalRow}>
            <span style={s.modalLabel}>% Done</span>
            <span style={s.modalValue}>{job.percentage_done != null ? `${job.percentage_done}%` : '—'}</span>
          </div>
          {job.error_messages?.length > 0 && (
            <div style={s.modalRow}>
              <span style={s.modalLabel}>Errors</span>
              <ul style={s.errorList}>
                {job.error_messages.map((msg, i) => (
                  <li key={i} style={s.errorItem}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div style={s.taskSummary}>
          <span style={s.taskCompleted}>{completedCount} Tasks Completed ✓</span>
          <span style={s.taskFailed}>{failedTasks.length} Tasks Failed ✗</span>
        </div>

        {failedTasks.length > 0 && (
          <div style={s.taskTableWrapper}>
            <table style={s.taskHeaderTable}>
              <colgroup>
                <col style={{ width: '55%' }} />
                <col style={{ width: '45%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={s.th}>Failed Task Description</th>
                  <th style={s.th}>Error Message</th>
                </tr>
              </thead>
            </table>
            <div style={s.taskBodyScroll}>
              <table style={s.taskBodyTable}>
                <colgroup>
                  <col style={{ width: '55%' }} />
                  <col style={{ width: '45%' }} />
                </colgroup>
                <tbody>
                  {failedTasks.map((task, i) => (
                    <tr key={task.id} style={i % 2 !== 0 ? s.rowAlt : undefined}>
                      <td style={s.tdMono}>{task.task_description || '—'}</td>
                      <td style={s.td}>
                        {(task.error_messages ?? []).length === 0
                          ? '—'
                          : <ul style={s.errorList}>
                              {task.error_messages.map((msg, j) => (
                                <li key={j} style={s.errorItem}>{msg}</li>
                              ))}
                            </ul>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={s.modalFooter}>
          <button style={s.closeBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

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

  const [selectedJob, setSelectedJob]   = useState(null)
  const [hoveredJobId, setHoveredJobId] = useState(null)

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

  function handleCloseModal() {
    setSelectedJob(null)
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
                  <tr
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    onMouseEnter={() => setHoveredJobId(job.id)}
                    onMouseLeave={() => setHoveredJobId(null)}
                    style={{
                      cursor: 'pointer',
                      background: hoveredJobId === job.id ? '#e8edf2' : (i % 2 !== 0 ? '#fafafa' : undefined),
                    }}
                  >
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

          <PaginationControls page={jobsPage} totalPages={jobsTotalPages} onPageChange={setJobsPage} />
        </>
      )}
      {selectedJob && <JobDetailsModal job={selectedJob} onClose={handleCloseModal} />}
    </>
  )
}

const s = {
  ...tableStyles,
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

  idTag: { color: '#6b7280', fontWeight: 400 },

  error: { color: '#dc2626', fontSize: '0.875rem' },
  muted: { color: '#6b7280', fontSize: '0.875rem' },

  overlay:          { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal:            { background: '#fff', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', padding: '1.75rem', width: '100%', maxWidth: 1100, maxHeight: '92vh', overflowY: 'auto', position: 'relative' },
  modalTitle:       { margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700, color: '#111827' },
  modalSection:     { marginBottom: '1.25rem' },
  modalRow:         { display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '0.4rem 0', borderBottom: '1px solid #f3f4f6' },
  modalLabel:       { fontSize: '0.8125rem', color: '#6b7280', fontWeight: 500, minWidth: 140, flexShrink: 0 },
  modalValue:       { fontSize: '0.875rem', color: '#111827' },
  taskSummary:      { display: 'flex', gap: '1.5rem', marginBottom: '1rem' },
  taskCompleted:    { fontSize: '0.875rem', fontWeight: 600, color: '#22c55e' },
  taskFailed:       { fontSize: '0.875rem', fontWeight: 600, color: '#ef4444' },
  errorList:        { margin: 0, paddingLeft: '1.25rem' },
  errorItem:        { fontSize: '0.8125rem', color: '#dc2626', marginBottom: '0.2rem' },
  taskTableWrapper: { marginTop: '0.75rem', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' },
  taskHeaderTable:  { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' },
  taskBodyScroll:   { maxHeight: 280, overflowY: 'auto' },
  taskBodyTable:    { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', background: '#fff' },
  tdMono:           { padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#374151', borderBottom: '1px solid #f3f4f6', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
  modalFooter:      { display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' },
  closeBtn:         { padding: '0.4375rem 1.25rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 },
}
