import { useState, useRef, useEffect } from 'react'
import { apiFetch } from '../api.js'
import { StatusBadge } from './StatusBadge.jsx'
import { modalStyles } from './CreateUserModal.jsx'
import { fmtPublisher } from '../utils/format.js'
import { formatApiError } from '../utils/formatApiError.js'

export default function DeleteScreensModal({ screens, publisherId, placementId, publisherName, onCancel, onDeleted }) {
  const [checked, setChecked] = useState(() => new Set(screens.map(sc => sc.id)))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const headerCbRef = useRef(null)
  const bodyRef = useRef(null)

  const allChecked = screens.length > 0 && screens.every(sc => checked.has(sc.id))
  const someChecked = screens.some(sc => checked.has(sc.id))

  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = someChecked && !allChecked
  }, [someChecked, allChecked])

  function toggleOne(id) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(screens.map(sc => sc.id)))
  }

  async function handleConfirm() {
    if (submitting || checked.size === 0) return
    setSubmitting(true)
    setError('')
    const ids = [...checked]
    let ok = false
    try {
      const res = await apiFetch(
        `/publishers/${publisherId}/placements/${placementId}/dooh-settings?ids=${ids.join(',')}`,
        { method: 'DELETE' }
      )
      if (res.ok) {
        ok = true
      } else {
        const errData = await res.json().catch(() => ({}))
        setError(formatApiError(errData, `Delete failed (${res.status})`))
      }
    } catch (err) {
      if (err.message !== 'Unauthorized') setError('Delete failed.')
    }
    if (!ok) {
      setSubmitting(false)
      if (bodyRef.current) bodyRef.current.scrollTop = 0
      return
    }
    onDeleted(ids)
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>Delete {checked.size} screen{checked.size === 1 ? '' : 's'}</h3>
          <button style={s.closeBtn} onClick={onCancel} aria-label="Close" disabled={submitting}>×</button>
        </div>

        <p style={s.warning}>This permanently deletes the screens below. This cannot be undone.</p>

        <div style={s.modalBody} ref={bodyRef}>
          {error && <p style={s.error}>{error}</p>}
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>
                  <input
                    type="checkbox"
                    ref={headerCbRef}
                    checked={allChecked}
                    onChange={toggleAll}
                    aria-label="Select all screens listed"
                  />
                </th>
                <th style={s.th}>ID</th>
                <th style={s.th}>Player ID</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Placement ID</th>
                <th style={s.th}>Publisher</th>
                <th style={s.th}>Country</th>
              </tr>
            </thead>
            <tbody>
              {screens.map(sc => (
                <tr key={sc.id}>
                  <td style={s.td}>
                    <input
                      type="checkbox"
                      checked={checked.has(sc.id)}
                      onChange={() => toggleOne(sc.id)}
                      aria-label={`Select screen ${sc.id}`}
                    />
                  </td>
                  <td style={s.td}>{sc.id}</td>
                  <td style={s.td}>{sc.player_id || '—'}</td>
                  <td style={s.td}><StatusBadge active={sc.status === 'active'} /></td>
                  <td style={s.td}>{sc.placement_id ?? '—'}</td>
                  <td style={s.td}>{fmtPublisher(sc.publisher_id, publisherName)}</td>
                  <td style={s.td}>{sc.country_code || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={s.modalFooter}>
          <button style={s.cancelBtn} onClick={onCancel} disabled={submitting}>Cancel</button>
          <button
            style={checked.size === 0 || submitting ? s_confirmBtnDisabled : s.confirmBtn}
            onClick={handleConfirm}
            disabled={checked.size === 0 || submitting}
          >
            {submitting && <span style={s.spinnerSm} />}
            {submitting ? 'Deleting…' : 'Confirm Deletion'}
          </button>
        </div>
      </div>
    </div>
  )
}

const s = {
  ...modalStyles,
  modal: { ...modalStyles.modal, width: '95vw', maxWidth: 1100 },
  modalHeader: { ...modalStyles.modalHeader, marginBottom: '0.5rem' },
  modalBody: { ...modalStyles.modalBody, maxHeight: '60vh' },
  // one upstream message per offending id, so this can run to hundreds of lines: keep it bounded and scrollable
  error: { ...modalStyles.error, fontSize: '0.8125rem', margin: '0 0 0.75rem', whiteSpace: 'pre-line', maxHeight: '30vh', overflowY: 'auto' },
  warning: { margin: '0 0 1rem', fontSize: '0.875rem', color: '#374151', flexShrink: 0 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '0.5rem 0.75rem', background: '#f9fafb', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', textAlign: 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' },
  td: { padding: '0.5rem 0.75rem', fontSize: '0.875rem', color: '#111827', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' },
  confirmBtn: { padding: '0.4375rem 1.25rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '0.375rem' },
  spinnerSm: { display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 },
}

const s_confirmBtnDisabled = { ...s.confirmBtn, background: '#fca5a5', cursor: 'not-allowed' }
