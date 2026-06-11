import { useState, useEffect } from 'react'
import { apiFetch } from '../api.js'
import { useDebounce } from '../hooks/useDebounce.js'

export default function PublisherMultiSelect({ value, onChange }) {
  const [search, setSearch] = useState('')
  const committedSearch = useDebounce(search, 300)
  const [options, setOptions] = useState([])

  useEffect(() => {
    if (!committedSearch.trim()) {
      setOptions([])
      return
    }
    const controller = new AbortController()
    apiFetch(`/publishers?search=${encodeURIComponent(committedSearch)}&limit=20`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => setOptions(data.publishers ?? []))
      .catch(() => {})
    return () => controller.abort()
  }, [committedSearch])

  function add(pub) {
    if (!value.some(p => p.id === pub.id)) onChange([...value, { id: pub.id, name: pub.name }])
    setSearch('')
    setOptions([])
  }

  function remove(id) {
    onChange(value.filter(p => p.id !== id))
  }

  return (
    <div style={s.pubSelect}>
      <div style={s.chips}>
        {value.map(p => (
          <span key={p.id} style={s.chip}>
            {p.name} ({p.id})
            <button style={s.chipRemove} onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`}>×</button>
          </span>
        ))}
        <input
          style={s.chipInput}
          type="text"
          placeholder="+ Publisher"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      {options.length > 0 && (
        <div style={s.dropdown}>
          {options.filter(o => !value.some(p => p.id === o.id)).map(o => (
            <div key={o.id} style={s.dropdownItem} className="clickable-row" onClick={() => add(o)}>
              {o.name} <span style={s.dropdownId}>({o.id})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const s = {
  pubSelect: { flex: 1, position: 'relative' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: '0.375rem', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: 4, padding: '0.25rem 0.375rem' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#eef2ff', color: '#3730a3', borderRadius: 4, padding: '0.125rem 0.375rem', fontSize: '0.8125rem' },
  chipRemove: { background: 'none', border: 'none', cursor: 'pointer', color: '#3730a3', fontSize: '0.9375rem', lineHeight: 1, padding: 0 },
  chipInput: { flex: 1, minWidth: 110, border: 'none', outline: 'none', fontSize: '0.875rem', color: '#111827', padding: '0.25rem' },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 10, maxHeight: 200, overflowY: 'auto' },
  dropdownItem: { padding: '0.4375rem 0.75rem', fontSize: '0.875rem', color: '#111827', cursor: 'pointer' },
  dropdownId: { color: '#6b7280' },
}
