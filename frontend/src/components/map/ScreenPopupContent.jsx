import { fmtPublisher } from '../../utils/format.js'

// Popup/InfoWindow body for a single screen, shared by both map providers so the
// two render identical details.
export default function ScreenPopupContent({ screen }) {
  return (
    <div style={s.popup}>
      <div style={s.popupTitle}>Screen {screen.screen_id || '—'}</div>
      <div>
        <strong>Publisher:</strong> {fmtPublisher(screen.publisher_id, screen.publisher_name)}
      </div>
      <div>
        <strong>Location:</strong>{' '}
        {[screen.city, screen.region, screen.country_code].filter(Boolean).join(', ') || '—'}
      </div>
      <div><strong>Venue type:</strong> {screen.venue_type_id ?? '—'}</div>
      <div><strong>Coords:</strong> {screen.lat}, {screen.lon}</div>
    </div>
  )
}

const s = {
  popup: { fontSize: '0.8125rem', lineHeight: 1.5, minWidth: 180 },
  popupTitle: { fontWeight: 600, color: '#111827', marginBottom: '0.25rem' },
}
