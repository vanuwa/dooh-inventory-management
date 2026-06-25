import { useReportTab } from '../hooks/useReportTab.js'
import { tableStyles } from '../styles/tables.js'

export default function ReportingTab({ previewUrl, generateUrl }) {
  const {
    quickAlias, dateRangeType, customStart, customEnd, groupBy,
    setGroupBy, setCustomStart, setCustomEnd,
    reportColumns, reportRows, reportLoading, reportError, reportLoaded,
    csvLoading, csvError,
    fetchReport, downloadCSV, handleQuickChange,
  } = useReportTab(previewUrl, generateUrl)

  const todayStr = new Date().toLocaleDateString('en-CA')
  const isSingleDay = dateRangeType === 'quick' && quickAlias === 'TODAY'

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={s.reportControls}>
        <select
          value={dateRangeType === 'fixed' ? 'custom' : quickAlias}
          onChange={handleQuickChange}
          style={s.dateSelect}
        >
          <option value="TODAY">Today</option>
          <option value="YESTERDAY">Yesterday</option>
          <option value="LAST_7_DAYS">Last 7 Days</option>
          <option value="LAST_14_DAYS">Last 14 Days</option>
          <option value="LAST_31_DAYS">Last 31 Days</option>
          <option value="LAST_90_DAYS">Last 90 Days</option>
          <option value="THIS_WEEK">This Week</option>
          <option value="LAST_WEEK">Last Week</option>
          <option value="THIS_MONTH">This Month</option>
          <option value="LAST_MONTH">Last Month</option>
          <option value="LAST_3_MONTHS">Last 3 Months</option>
          <option value="LAST_6_MONTHS">Last 6 Months</option>
          <option disabled>──────────</option>
          <option value="custom">Custom range</option>
        </select>

        {dateRangeType === 'fixed' && (
          <>
            <input
              type="date"
              value={customStart}
              max={todayStr}
              onChange={e => setCustomStart(e.target.value)}
              style={s.dateSelect}
            />
            <input
              type="date"
              value={customEnd}
              max={todayStr}
              onChange={e => setCustomEnd(e.target.value)}
              style={s.dateSelect}
            />
          </>
        )}

        <div style={s.groupByToggle}>
          {[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(([v, label], idx, arr) => {
            const isDisabled = isSingleDay && v !== 'day'
            return (
              <button
                key={v}
                disabled={isDisabled}
                style={{
                  padding: '0.4375rem 0.75rem',
                  background: groupBy === v ? '#1a1a2e' : '#fff',
                  color: isDisabled ? '#9ca3af' : (groupBy === v ? '#fff' : '#374151'),
                  border: 'none',
                  borderRight: idx < arr.length - 1 ? '1px solid #d1d5db' : 'none',
                  cursor: isDisabled ? 'default' : 'pointer',
                  fontSize: '0.8125rem',
                  fontWeight: groupBy === v ? 500 : 400,
                }}
                onClick={() => setGroupBy(v)}
              >
                {label}
              </button>
            )
          })}
        </div>

        <button style={s.loadBtn} onClick={fetchReport} disabled={reportLoading}>
          Load Report
        </button>

        {reportLoaded && reportRows.length > 0 && (
          <button style={{ ...s.csvBtn, marginLeft: 'auto' }} onClick={downloadCSV} disabled={reportLoading || csvLoading}>
            {csvLoading ? <><span style={s.spinnerSm} />Generating…</> : 'Download CSV'}
          </button>
        )}
      </div>

      {reportError && <p style={s.error}>{reportError}</p>}
      {csvError && <p style={s.error}>{csvError}</p>}

      {!reportLoaded && !reportLoading && !reportError && (
        <p style={s.muted}>Select a date range and click Load Report.</p>
      )}

      {reportLoading && !reportLoaded && (
        <div style={s.spinnerCenter}>
          <span style={s.spinnerLg} />
        </div>
      )}

      {reportLoaded && reportRows.length === 0 && !reportLoading && (
        <p style={s.muted}>No data for this period.</p>
      )}

      {reportLoaded && reportRows.length > 0 && (
        <div style={{ position: 'relative' }}>
          {reportLoading && (
            <div style={s.loadingOverlay}>
              <span style={s.spinnerLg} />
            </div>
          )}
          <div style={{ ...s.tableWrapper, opacity: reportLoading ? 0.4 : 1, transition: 'opacity 0.2s' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {reportColumns.map(c => (
                    <th key={c.id} style={s.th}>{c.display}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reportRows.map((row, i) => (
                  <tr key={i} style={i % 2 !== 0 ? s.rowAlt : undefined}>
                    {reportColumns.map(c => (
                      <td key={c.id} style={s.td}>
                        {c.id === 'revenue'
                          ? (row[c.id] != null ? parseFloat(row[c.id]).toFixed(2) : '—')
                          : (row[c.id] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

const s = {
  ...tableStyles,
  th: { ...tableStyles.thCompact, padding: '0.75rem 0.5rem' },
  td: { ...tableStyles.tdCompact, padding: '0.625rem 0.5rem' },
  reportControls: { display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' },
  dateSelect: { padding: '0.4375rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', color: '#111827', outline: 'none', background: '#fff' },
  groupByToggle: { display: 'flex', border: '1px solid #d1d5db', borderRadius: 4, overflow: 'hidden' },
  loadBtn: { padding: '0.4375rem 1rem', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 },
  csvBtn: { padding: '0.4375rem 1rem', background: '#fff', color: '#1a1a2e', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' },
  spinnerSm: { display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(26,26,46,0.2)', borderTopColor: '#1a1a2e', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 },
  spinnerLg: { display: 'inline-block', width: 36, height: 36, border: '3px solid rgba(26,26,46,0.15)', borderTopColor: '#1a1a2e', borderRadius: '50%', animation: 'spin 0.7s linear infinite' },
  spinnerCenter: { display: 'flex', justifyContent: 'center', padding: '3rem 0' },
  loadingOverlay: { position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, zIndex: 1 },
  error: { color: '#dc2626', fontSize: '0.875rem' },
  muted: { color: '#6b7280', fontSize: '0.875rem' },
}
