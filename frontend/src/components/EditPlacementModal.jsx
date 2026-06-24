import { useState } from 'react'
import { apiFetch } from '../api.js'
import { modalStyles as s } from './CreateUserModal.jsx'

export default function EditPlacementModal({ publisherId, placementId, placement, onClose, onSaved }) {
  const [name, setName] = useState(placement.name ?? '')
  const [url, setUrl] = useState(placement.inventory_url ?? '')
  const [maxDefaults, setMaxDefaults] = useState(placement.max_defaults ?? 1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (submitting) return
    if (!name.trim()) { setError('Name is required.'); return }
    if (!url.trim()) { setError('URL is required.'); return }
    if (maxDefaults < 1) { setError('Max Defaults must be at least 1.'); return }

    setSubmitting(true)
    setError('')
    try {
      const res = await apiFetch(`/publishers/${publisherId}/placements/${placementId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: name.trim(), url: url.trim(), max_defaults: maxDefaults }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.message ?? `Save failed (${res.status}).`)
        return
      }
      onSaved({
        ...placement,
        name: name.trim(),
        inventory_name: name.trim(),
        inventory_url: url.trim(),
        max_defaults: maxDefaults,
      })
    } catch (err) {
      if (err.message !== 'Unauthorized') setError('Save failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>Edit Placement</h3>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={s.modalBody}>
          <div style={s.fieldRow}>
            <span style={s.fieldLabel}>Name</span>
            <input
              style={s.input}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div style={s.fieldRow}>
            <span style={s.fieldLabel}>URL</span>
            <input
              style={s.input}
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
          </div>
          <div style={s.fieldRow}>
            <span style={s.fieldLabel}>Max Defaults</span>
            <input
              style={s.input}
              type="number"
              min={1}
              value={maxDefaults}
              onChange={e => setMaxDefaults(Number(e.target.value))}
            />
          </div>

          {error && <p style={s.error}>{error}</p>}
        </div>

        <div style={s.modalFooter}>
          <button style={s.cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
          <button style={s.primaryBtn} onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
