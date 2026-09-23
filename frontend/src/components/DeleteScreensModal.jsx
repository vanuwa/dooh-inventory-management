import { useState, useRef, useEffect } from 'react'
import { apiFetch } from '../api.js'
import { StatusBadge } from './StatusBadge.jsx'
import { fmtPublisher } from '../utils/format.js'
import { formatApiError } from '../utils/formatApiError.js'

export default function DeleteScreensModal({ screens, publisherId, placementId, publisherName, onCancel, onDeleted }) {
  const [checked, setChecked] = useState(() => new Set(screens.map(sc => sc.id)))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const headerCbRef = useRef(null)

  const allChecked = screens.length > 0 && screens.every(sc => checked.has(sc.id))
  const someChecked = screens.some(sc => checked.has(sc.id))

  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = someChecked && !allChecked
  }, [checked, screens])

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
    try {
      const res = await apiFetch(
        `/publishers/${publisherId}/placements/${placementId}/dooh-settings?ids=${ids.join(',')}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        setError(formatApiError(errData, `Delete failed (${res.status})`))
        return
      }
      onDeleted(ids)
    } catch (err) {
      if (err.message !== 'Unauthorized') setError('Delete failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>Delete {checked.size} screen{checked.size === 1 ? '' : 's'}</h3>
          <button style={s.closeBtn} onClick={onCancel} aria-label="Close" disabled={submitting}>×</button>
        </div>

        <p style={s.warning}>This permanently deletes the screens below. This cannot be undone.</p>

        <div style={s.modalBody}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>
                  <input type="checkbox" ref={headerCbRef} checked={allChecked} onChange={toggleAll} />
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
                    <input type="checkbox" checked={checked.has(sc.id)} onChange={() => toggleOne(sc.id)} />
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

        {error && <p style={s.error}>{error}</p>}

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
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', padding: '1.75rem', width: '95vw', maxWidth: 1100, maxHeight: '90vh', display: 'flex', flexDirection: 'column', position: 'relative' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexShrink: 0 },
  modalTitle: { margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' },
  closeBtn: { background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1, cursor: 'pointer', color: '#6b7280', padding: '0 0.25rem' },
  warning: { margin: '0 0 1rem', fontSize: '0.875rem', color: '#374151', flexShrink: 0 },
  modalBody: { maxHeight: '60vh', overflowY: 'auto', flex: 1 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '0.5rem 0.75rem', background: '#f9fafb', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', textAlign: 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' },
  td: { padding: '0.5rem 0.75rem', fontSize: '0.875rem', color: '#111827', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' },
  error: { color: '#dc2626', fontSize: '0.8125rem', marginTop: '0.75rem', marginBottom: 0, whiteSpace: 'pre-line', flexShrink: 0 },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem', flexShrink: 0 },
  cancelBtn: { padding: '0.4375rem 1.25rem', background: '#fff', color: '#1a1a2e', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem' },
  confirmBtn: { padding: '0.4375rem 1.25rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '0.375rem' },
  spinnerSm: { display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 },
}

const s_confirmBtnDisabled = { ...s.confirmBtn, background: '#fca5a5', cursor: 'not-allowed' }
