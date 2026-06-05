import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api.js'
import Layout from '../components/Layout.jsx'
import { useRecentActivity } from '../hooks/useRecentActivity.js'
import { PAGE_TYPES } from '../constants/pageTypes.js'

function timeAgo(ts) {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? '' : 's'} ago`
}

function EntityLabel({ name, id }) {
  if (!name) return <span style={s.entityName}>({id})</span>
  return (
    <span>
      <span style={s.entityName}>{name}</span>
      <span style={s.entityId}> ({id})</span>
    </span>
  )
}

function buildLinkState(item) {
  if (!item.publisher) return undefined
  const state = { publisherName: item.publisher.name }
  if (item.placement) state.placement = { name: item.placement.name, id: item.placement.id }
  return state
}

export default function RecentActivity() {
  const [user, setUser] = useState(null)
  const { getItems } = useRecentActivity()
  const items = getItems()

  useEffect(() => {
    apiFetch('/user/details')
      .then(res => res.json())
      .then(setUser)
      .catch(() => {})
  }, [])

  return (
    <Layout user={user}>
      <main style={s.main}>
        <h2 style={s.heading}>Recent Activity</h2>
        <div style={s.card}>
          {items.length === 0 ? (
            <p style={s.empty}>
              No recent activity yet. You can start by visiting the{' '}
              <Link to="/publishers" style={s.emptyLink}>Publishers</Link> page or your{' '}
              <Link to="/user" style={s.emptyLink}>User Details</Link>.
            </p>
          ) : (
            <ul style={s.list}>
              {items.map((item, i) => {
                const typeInfo = item.pageType
                  ? (PAGE_TYPES[item.pageType] ?? { label: item.pageType, bg: '#f0f2f5', color: '#555' })
                  : null
                return (
                  <li
                    key={item.url}
                    style={{ ...s.item, ...(i === items.length - 1 ? { borderBottom: 'none' } : {}) }}
                  >
                    <span style={s.badgeCell}>
                      {typeInfo && (
                        <span style={{ ...s.badge, background: typeInfo.bg, color: typeInfo.color }}>
                          {typeInfo.label}
                        </span>
                      )}
                    </span>
                    <Link to={item.url} state={buildLinkState(item)} style={s.itemLink}>
                      {!item.pageType ? (
                        <span style={s.entityName}>{item.title}</span>
                      ) : (
                        <span style={s.titleEntities}>
                          <EntityLabel name={item.publisher?.name} id={item.publisher?.id} />
                          {item.placement && (
                            <>
                              <span style={s.sep}> › </span>
                              <EntityLabel name={item.placement.name} id={item.placement.id} />
                            </>
                          )}
                        </span>
                      )}
                    </Link>
                    <span style={s.timestamp}>{timeAgo(item.visitedAt)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </main>
    </Layout>
  )
}

const s = {
  main: { maxWidth: 1040, margin: '0 auto', padding: '2rem 1.5rem' },
  heading: { margin: '0 0 1.25rem', fontSize: '1.25rem', fontWeight: 600, color: '#1a1a2e' },
  card: { background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: '1.5rem' },
  empty: { margin: 0, fontSize: '0.9375rem', color: '#555', lineHeight: 1.6 },
  emptyLink: { color: '#1a1a2e', fontWeight: 500 },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  item: {
    display: 'grid',
    gridTemplateColumns: '8rem 1fr auto',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 0',
    borderBottom: '1px solid #f0f2f5',
  },
  badgeCell: { display: 'flex', alignItems: 'center' },
  badge: {
    display: 'inline-block',
    padding: '0.2rem 0.625rem',
    borderRadius: 20,
    fontSize: '0.75rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  itemLink: { textDecoration: 'none', minWidth: 0 },
  titleEntities: { display: 'inline-flex', alignItems: 'baseline', flexWrap: 'wrap' },
  entityName: { fontWeight: 600, color: '#1a1a2e', fontSize: '0.9375rem' },
  entityId: { color: '#888', fontSize: '0.8125rem' },
  sep: { color: '#bbb', margin: '0 0.25rem', fontSize: '0.9375rem' },
  timestamp: { fontSize: '0.8125rem', color: '#888', whiteSpace: 'nowrap' },
}
