import { useState, useRef, useEffect } from 'react'
import { apiFetch } from '../api.js'
import { ScreenStatusBadge } from './StatusBadge.jsx'
import { modalStyles } from './CreateUserModal.jsx'
import { tableStyles } from '../styles/tables.js'
import { fmtPublisher } from '../utils/format.js'
import { formatApiError } from '../utils/formatApiError.js'
import { deleteRequest, labelBatchErrors, partitionSoftDeletable } from '../utils/screenStatus.js'

export default function DeleteScreensModal({ screens, publisherId, placementId, publisherName, onClose, onDeleted }) {
  const [checked, setChecked] = useState(() => new Set(screens.map(sc => sc.id)))
  const [hardDelete, setHardDelete] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const headerCbRef = useRef(null)
  const bodyRef = useRef(null)

  const allChecked = screens.length > 0 && screens.every(sc => checked.has(sc.id))
  const someChecked = screens.some(sc => checked.has(sc.id))

  const rows = screens.filter(sc => checked.has(sc.id))
  // The soft delete is a full-row PUT, and upstream rejects a row that cannot supply every
  // required field — as an unattributable 400 or a raw 500, naming no screen. Catch those
  // rows here instead, while their ids are still in hand. The way out is unticking them: the
  // permanent delete does validate nothing, but it purges the *whole* ticked selection, so it
  // is never the remedy for a few blocked rows.
  const blocked = hardDelete ? [] : partitionSoftDeletable(rows).blocked
  const blockedIds = new Set(blocked.map(b => b.row.id))

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
    if (submitting || rows.length === 0 || blocked.length > 0) return
    setSubmitting(true)
    setError('')
    const ids = rows.map(sc => sc.id)
    let ok = false
    try {
      // `rows` — the *checked* subset — shapes both the request and the error labelling:
      // upstream keys batch errors by the row's position in the array we sent, so a second,
      // separately built array could name the wrong screen.
      const { path, options } = deleteRequest({ rows, hardDelete, publisherId, placementId })
      const res = await apiFetch(path, options)
      if (res.ok) {
        ok = true
      } else {
        const errData = await res.json().catch(() => ({}))
        setError(formatApiError(labelBatchErrors(errData, rows), `Delete failed (${res.status})`))
      }
    } catch (err) {
      // A transport failure says nothing about the upstream transaction — a timeout on a
      // 1000-row soft delete can well have committed — so do not claim it did not happen.
      if (err.message !== 'Unauthorized') setError('Delete failed to complete. It may or may not have been applied — close this dialog and refresh the grid to check.')
    }
    if (!ok) {
      setSubmitting(false)
      if (bodyRef.current) bodyRef.current.scrollTop = 0
      return
    }
    // Same contract in both modes: drop the ids from the selection and refetch from page 1.
    // Under "All" and "Deleted only" the soft-deleted rows legitimately stay in the grid
    // after that refetch, now unselected and wearing the Deleted badge — that is correct.
    onDeleted(ids)
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>Delete {checked.size} screen{checked.size === 1 ? '' : 's'}</h3>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close" disabled={submitting}>×</button>
        </div>

        <p style={s.warning}>
          {hardDelete
            ? 'This permanently deletes the screens below. This cannot be undone.'
            : 'This marks the screens below as deleted. They stop serving and drop out of the Active only and All filters — they stay listed under Deleted only — and can be restored by setting the status back to active. It is sent as a full-row update built from the values each screen had when it was ticked, so any edit made to these screens elsewhere since then is overwritten.'}
        </p>

        <div style={s.modalBody} ref={bodyRef}>
          {error && <p style={s.error}>{error}</p>}
          {blocked.length > 0 && (
            <p style={s.blockedNotice}>
              {`${blocked.length} of the selected screen${blocked.length === 1 ? ' has' : 's have'} no value stored for a field upstream requires on every update, so ${blocked.length === 1 ? 'it' : 'they'} cannot be marked deleted. Untick ${blocked.length === 1 ? 'it' : 'them'} below and confirm the rest. Do not use "Permanently delete instead" to get past this: it purges every screen that is ticked, not just the ${blocked.length === 1 ? 'blocked one' : 'blocked ones'}, and that cannot be undone.\n`}
              {blocked.map(({ row, missing }) =>
                `\nscreen ${row.id}${row.player_id ? ` (${row.player_id})` : ''} — missing ${missing.join(', ')}`
              ).join('')}
            </p>
          )}
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
                  <td style={s.td}>
                    {sc.id}
                    {blockedIds.has(sc.id) && <span style={s.blockedMark} title="Missing a field upstream requires; untick this screen to delete the rest">&nbsp;⚠</span>}
                  </td>
                  <td style={s.td}>{sc.player_id || '—'}</td>
                  <td style={s.td}><ScreenStatusBadge status={sc.status} /></td>
                  <td style={s.td}>{sc.placement_id || '—'}</td>
                  <td style={s.td}>{fmtPublisher(sc.publisher_id, publisherName)}</td>
                  <td style={s.td}>{sc.country_code || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label style={s.hardDeleteRow}>
          <input
            type="checkbox"
            checked={hardDelete}
            onChange={e => setHardDelete(e.target.checked)}
            disabled={submitting}
          />
          Permanently delete instead (cannot be undone)
        </label>

        <div style={s.modalFooter}>
          <button style={s.cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
          <button
            style={checked.size === 0 || blocked.length > 0 || submitting ? s_confirmBtnDisabled : s.confirmBtn}
            onClick={handleConfirm}
            disabled={checked.size === 0 || blocked.length > 0 || submitting}
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
  error: { ...modalStyles.error, fontSize: '0.8125rem', marginTop: 0, marginBottom: '0.75rem', whiteSpace: 'pre-line', maxHeight: '30vh', overflowY: 'auto' },
  blockedNotice: { margin: '0 0 0.75rem', padding: '0.5rem 0.75rem', borderRadius: 4, background: '#fff7ed', border: '1px solid #fb923c', color: '#7c2d12', fontSize: '0.8125rem', whiteSpace: 'pre-line', maxHeight: '30vh', overflowY: 'auto' },
  blockedMark: { color: '#b45309' },
  warning: { margin: '0 0 1rem', fontSize: '0.875rem', color: '#374151', flexShrink: 0 },
  hardDeleteRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.75rem 0 0', fontSize: '0.875rem', color: '#374151', cursor: 'pointer', flexShrink: 0 },
  table: { width: '100%', borderCollapse: 'collapse' },
  // the shared compact cells, tightened for the dialog: no page-grid padding, no column min-width
  th: { ...tableStyles.thCompact, padding: '0.5rem 0.75rem', minWidth: undefined },
  td: { ...tableStyles.tdCompact, padding: '0.5rem 0.75rem' },
  confirmBtn: { padding: '0.4375rem 1.25rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '0.375rem' },
  spinnerSm: { display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 },
}

const s_confirmBtnDisabled = { ...s.confirmBtn, background: '#fca5a5', cursor: 'not-allowed' }
