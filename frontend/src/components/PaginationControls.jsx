import { tableStyles } from '../styles/tables.js'

export default function PaginationControls({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null
  return (
    <div style={tableStyles.pagination}>
      <button style={tableStyles.pageBtn} onClick={() => onPageChange(p => p - 1)} disabled={page === 1}>Prev</button>
      <span style={tableStyles.pageInfo}>Page {page} of {totalPages}</span>
      <button style={tableStyles.pageBtn} onClick={() => onPageChange(p => p + 1)} disabled={page >= totalPages}>Next</button>
    </div>
  )
}
