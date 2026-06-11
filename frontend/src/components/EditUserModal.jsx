import { useState, useEffect } from 'react'
import { apiFetch } from '../api.js'
import PublisherMultiSelect from './PublisherMultiSelect.jsx'
import { USER_TYPES, ACCESS_FIELDS, modalStyles as s } from './CreateUserModal.jsx'

export default function EditUserModal({ publisherId, userId, onClose, onSaved }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [active, setActive] = useState(true)
  const [publishers, setPublishers] = useState([])
  const [accesses, setAccesses] = useState({})

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setLoadError('')
    const controller = new AbortController()
    apiFetch(`/publishers/${publisherId}/users/${userId}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`status ${res.status}`)
        return res.json()
      })
      .then(data => {
        setUser(data)
        setFirstName(data.first_name ?? '')
        setLastName(data.last_name ?? '')
        setEmail(data.email ?? '')
        setActive(data.active ?? true)
        setPublishers(data.publishers ?? [])
        setAccesses(data.accesses ?? {})
        setLoading(false)
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        if (err.message !== 'Unauthorized') setLoadError('Failed to load user.')
        setLoading(false)
      })
    return () => controller.abort()
  }, [publisherId, userId])

  async function handleSave() {
    if (submitting) return
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('First name, last name and email are required.')
      return
    }
    if (publishers.length === 0) {
      setError('Select at least one publisher.')
      return
    }
    if (ACCESS_FIELDS.every(f => accesses[f.key] === 'Hide')) {
      setError('At least one access must not be Hide.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const res = await apiFetch(`/publishers/${publisherId}/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          active,
          publishers,
          accesses,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.message ?? `Save failed (${res.status}).`)
        return
      }
      onSaved(`User ${firstName.trim()} ${lastName.trim()} updated.`)
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
          <h3 style={s.modalTitle}>Edit User <span style={local.titleId}>{userId}</span></h3>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={s.modalBody}>
          {loading && <p style={local.muted}>Loading…</p>}
          {loadError && <p style={s.error}>{loadError}</p>}

          {!loading && !loadError && user && (
            <>
              <div style={s.fieldRow}>
                <span style={s.fieldLabel}>User Type</span>
                <div style={s.radioRow}>
                  {USER_TYPES.map(t => (
                    <label key={t} style={s.radioLabelDisabled}>
                      <input type="radio" name="userType" value={t} checked={t.toUpperCase() === user.user_type} disabled readOnly />
                      {t}
                    </label>
                  ))}
                </div>
              </div>

              <div style={s.fieldRow}>
                <span style={s.fieldLabel}>Access Type</span>
                <div style={s.radioRow}>
                  {['CONSOLE', 'API'].map(t => (
                    <label key={t} style={s.radioLabelDisabled}>
                      <input type="radio" name="accessType" value={t} checked={user.user_access === t} disabled readOnly />
                      {t === 'CONSOLE' ? 'Console' : 'API'}
                    </label>
                  ))}
                </div>
              </div>

              <h4 style={s.sectionTitle}>Profile</h4>
              <div style={s.fieldRow}>
                <span style={s.fieldLabel}>First Name</span>
                <input style={s.input} type="text" value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div style={s.fieldRow}>
                <span style={s.fieldLabel}>Last Name</span>
                <input style={s.input} type="text" value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
              <div style={s.fieldRow}>
                <span style={s.fieldLabel}>Email</span>
                <input style={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div style={s.fieldRow}>
                <span style={s.fieldLabel}>Account Status</span>
                <div style={s.radioRow}>
                  <label style={s.radioLabel}>
                    <input type="radio" name="accountStatus" checked={active} onChange={() => setActive(true)} />
                    Active
                  </label>
                  <label style={s.radioLabel}>
                    <input type="radio" name="accountStatus" checked={!active} onChange={() => setActive(false)} />
                    Inactive
                  </label>
                </div>
              </div>

              <h4 style={s.sectionTitle}>Permissions</h4>
              <div style={s.fieldRow}>
                <span style={s.fieldLabel}>Publishers</span>
                <PublisherMultiSelect value={publishers} onChange={setPublishers} />
              </div>

              <div style={s.accessGrid}>
                {ACCESS_FIELDS.map(f => (
                  <div key={f.key} style={s.accessRow}>
                    <span style={s.accessLabel}>{f.label}</span>
                    <select
                      style={s.accessSelect}
                      value={accesses[f.key] ?? 'Hide'}
                      onChange={e => setAccesses(prev => ({ ...prev, [f.key]: e.target.value }))}
                    >
                      {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {error && <p style={s.error}>{error}</p>}
            </>
          )}
        </div>

        <div style={s.modalFooter}>
          <button style={s.cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
          <button style={s.primaryBtn} onClick={handleSave} disabled={submitting || loading || !!loadError}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

const local = {
  titleId: { color: '#6b7280', fontWeight: 400, fontSize: '0.9375rem' },
  muted: { color: '#6b7280', fontSize: '0.875rem' },
}
