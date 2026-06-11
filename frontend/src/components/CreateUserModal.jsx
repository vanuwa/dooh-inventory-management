import { useState, useEffect } from 'react'
import { apiFetch } from '../api.js'
import PublisherMultiSelect from './PublisherMultiSelect.jsx'

export const USER_TYPES = ['Publisher', 'Admin', 'Buyer', 'DMP']

export const ACCESS_FIELDS = [
  { key: 'reports',    label: 'Reports & Dashboards',  options: ['Show', 'Hide'] },
  { key: 'operations', label: 'Operations (Legacy UI)', options: ['Create', 'Read Only', 'Hide'] },
  { key: 'settings',   label: 'Settings',               options: ['Create', 'Read Only', 'Hide'] },
  { key: 'invoices',   label: 'Invoices',               options: ['Show', 'Hide'] },
  { key: 'inventory',  label: 'Inventory',              options: ['Create', 'Read Only', 'Hide'] },
  { key: 'clients',    label: 'Clients (Legacy UI)',    options: ['Create', 'Read Only', 'Hide'] },
]

const CONSOLE_ACCESS_DEFAULTS = { reports: 'Show', operations: 'Hide', settings: 'Hide', invoices: 'Hide', inventory: 'Hide', clients: 'Hide' }
const API_ACCESS_DEFAULTS = { reports: 'Show', operations: 'Hide', settings: 'Create', invoices: 'Show', inventory: 'Create', clients: 'Hide' }

function apiProfileFor(publisherName) {
  const slug = (publisherName || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return {
    firstName: publisherName || '',
    lastName: 'API',
    email: slug ? `${slug}_api@improvedigital.com` : '',
  }
}

export default function CreateUserModal({ publisherId, publisherName, onClose, onCreated }) {
  const [accessType, setAccessType] = useState('CONSOLE')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [destinationEmail, setDestinationEmail] = useState('')
  const [accesses, setAccesses] = useState(CONSOLE_ACCESS_DEFAULTS)
  const [publishers, setPublishers] = useState(
    publisherName ? [{ id: Number(publisherId), name: publisherName }] : []
  )

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // The current publisher may not be known yet when the modal is opened from a
  // shared URL before the publisher fetch resolves — sync it in once available.
  useEffect(() => {
    if (!publisherName) return
    setPublishers(prev => prev.length === 0 ? [{ id: Number(publisherId), name: publisherName }] : prev)
  }, [publisherId, publisherName])

  function handleAccessTypeChange(type) {
    setAccessType(type)
    setError('')
    if (type === 'API') {
      const profile = apiProfileFor(publisherName)
      setFirstName(profile.firstName)
      setLastName(profile.lastName)
      setEmail(profile.email)
      setAccesses(API_ACCESS_DEFAULTS)
    } else {
      setFirstName('')
      setLastName('')
      setEmail('')
      setDestinationEmail('')
      setAccesses(CONSOLE_ACCESS_DEFAULTS)
    }
  }

  async function handleSubmit() {
    if (submitting) return
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('First name, last name and email are required.')
      return
    }
    if (accessType === 'API' && !destinationEmail.trim()) {
      setError('Destination email for API credentials is required.')
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
    const payload = {
      user_access: accessType,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      publishers,
      accesses,
    }
    if (accessType === 'API') payload.destination_email = destinationEmail.trim()

    try {
      const res = await apiFetch(`/publishers/${publisherId}/users`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.message ?? `Create failed (${res.status}).`)
        return
      }
      onCreated(accessType === 'API'
        ? `User created. API credentials emailed to ${destinationEmail.trim()}.`
        : `User created. Password-setup email sent to ${email.trim()}.`)
    } catch (err) {
      if (err.message !== 'Unauthorized') setError('Create failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>Create User</h3>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={s.modalBody}>
          <div style={s.fieldRow}>
            <span style={s.fieldLabel}>User Type</span>
            <div style={s.radioRow}>
              {USER_TYPES.map(t => (
                <label key={t} style={s.radioLabelDisabled}>
                  <input type="radio" name="userType" value={t} checked={t === 'Publisher'} disabled readOnly />
                  {t}
                </label>
              ))}
            </div>
          </div>

          <div style={s.fieldRow}>
            <span style={s.fieldLabel}>Access Type</span>
            <div style={s.radioRow}>
              {['CONSOLE', 'API'].map(t => (
                <label key={t} style={s.radioLabel}>
                  <input
                    type="radio"
                    name="accessType"
                    value={t}
                    checked={accessType === t}
                    onChange={() => handleAccessTypeChange(t)}
                  />
                  {t === 'CONSOLE' ? 'Console' : 'API'}
                </label>
              ))}
            </div>
          </div>

          {accessType === 'API' && (
            <div style={s.fieldRow}>
              <span style={s.fieldLabel}>Email API credentials to</span>
              <input
                style={s.input}
                type="email"
                placeholder="recipient@example.com"
                value={destinationEmail}
                onChange={e => setDestinationEmail(e.target.value)}
              />
            </div>
          )}

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
                  value={accesses[f.key]}
                  onChange={e => setAccesses(prev => ({ ...prev, [f.key]: e.target.value }))}
                >
                  {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>

          {error && <p style={s.error}>{error}</p>}
        </div>

        <div style={s.modalFooter}>
          <button style={s.cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
          <button style={s.primaryBtn} onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

export const modalStyles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', padding: '1.75rem', width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column', position: 'relative' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexShrink: 0 },
  modalTitle: { margin: 0, fontSize: '1.0625rem', fontWeight: 700, color: '#111827' },
  closeBtn: { background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1, cursor: 'pointer', color: '#6b7280', padding: '0 0.25rem' },
  modalBody: { overflowY: 'auto', flex: 1 },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem', flexShrink: 0 },

  sectionTitle: { margin: '1.25rem 0 0.75rem', fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' },
  fieldRow: { display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' },
  fieldLabel: { fontSize: '0.8125rem', color: '#6b7280', fontWeight: 500, minWidth: 170, paddingTop: '0.4375rem' },
  radioRow: { display: 'flex', gap: '1.25rem', alignItems: 'center', paddingTop: '0.4375rem' },
  radioLabel: { display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem', color: '#111827', cursor: 'pointer' },
  radioLabelDisabled: { display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem', color: '#9ca3af' },
  input: { flex: 1, padding: '0.375rem 0.625rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', color: '#111827', outline: 'none', boxSizing: 'border-box' },

  accessGrid: { marginTop: '0.5rem' },
  accessRow: { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' },
  accessLabel: { fontSize: '0.875rem', color: '#111827', minWidth: 170 },
  accessSelect: { padding: '0.3125rem 0.625rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', color: '#111827', background: '#fff', cursor: 'pointer', minWidth: 130 },

  primaryBtn: { padding: '0.4375rem 1.25rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 },
  cancelBtn: { padding: '0.4375rem 1.25rem', background: '#fff', color: '#1a1a2e', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem' },
  error: { color: '#dc2626', fontSize: '0.875rem', marginTop: '0.75rem' },
}

const s = modalStyles
