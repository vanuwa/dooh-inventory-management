import { useState, useEffect } from 'react'
import { apiFetch } from '../api.js'
import Layout from '../components/Layout.jsx'

function parseChangelog(text) {
  const sections = []
  let cur = null, sub = null
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) {
      cur = { date: line.slice(3).trim(), categories: [] }
      sub = null
      sections.push(cur)
    } else if (line.startsWith('### ') && cur) {
      sub = { name: line.slice(4).trim(), items: [] }
      cur.categories.push(sub)
    } else if (line.startsWith('- ') && sub) {
      sub.items.push(line.slice(2).trim())
    }
  }
  return sections
}

const CATEGORY_COLORS = {
  Features: { bg: '#dbeafe', color: '#1d4ed8' },
  Improvements: { bg: '#d1fae5', color: '#065f46' },
  'Bug Fixes': { bg: '#fee2e2', color: '#991b1b' },
}

export default function Changelog() {
  const [user, setUser] = useState(null)
  const [sections, setSections] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch('/user/details')
      .then(res => res.json())
      .then(setUser)
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/CHANGELOG.md')
      .then(res => {
        if (!res.ok) throw new Error('not found')
        return res.text()
      })
      .then(text => setSections(parseChangelog(text)))
      .catch(() => setError('Failed to load changelog.'))
  }, [])

  return (
    <Layout user={user}>
      <main style={s.main}>
        <h1 style={s.title}>Changelog</h1>
        {error && <p style={s.error}>{error}</p>}
        {!sections && !error && <p style={s.muted}>Loading…</p>}
        {sections && sections.map(section => (
          <div key={section.date} style={s.card}>
            <h2 style={s.date}>{section.date}</h2>
            {section.categories.map(cat => {
              const chip = CATEGORY_COLORS[cat.name] ?? { bg: '#f3f4f6', color: '#374151' }
              return (
                <div key={cat.name} style={s.category}>
                  <span style={{ ...s.chip, background: chip.bg, color: chip.color }}>{cat.name}</span>
                  <ul style={s.list}>
                    {cat.items.map((item, i) => (
                      <li key={i} style={s.item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        ))}
      </main>
    </Layout>
  )
}

const s = {
  main: { padding: '2.5rem 1.5rem', maxWidth: 760, margin: '0 auto' },
  title: { fontSize: '1.5rem', fontWeight: 700, color: '#1a1a2e', marginBottom: '1.5rem' },
  card: {
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    padding: '1.5rem',
    marginBottom: '1rem',
  },
  date: { fontSize: '1.0625rem', fontWeight: 700, color: '#1a1a2e', margin: '0 0 1rem' },
  category: { marginBottom: '0.75rem' },
  chip: {
    display: 'inline-block',
    fontSize: '0.75rem',
    fontWeight: 600,
    padding: '0.15rem 0.6rem',
    borderRadius: 999,
    marginBottom: '0.4rem',
  },
  list: { margin: '0 0 0 1.25rem', padding: 0 },
  item: { fontSize: '0.9rem', color: '#374151', lineHeight: 1.6, marginBottom: '0.15rem' },
  muted: { color: '#6b7280', fontSize: '0.875rem' },
  error: { color: '#dc2626', fontSize: '0.875rem' },
}
