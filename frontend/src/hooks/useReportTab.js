import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../api.js'

export function useReportTab(previewUrl, generateUrl) {
  const [quickAlias, setQuickAlias] = useState('LAST_7_DAYS')
  const [dateRangeType, setDateRangeType] = useState('quick')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [reportColumns, setReportColumns] = useState([])
  const [reportRows, setReportRows] = useState([])
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reportLoaded, setReportLoaded] = useState(false)
  const [groupBy, setGroupBy] = useState('day')
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvError, setCsvError] = useState('')
  const csvAbortRef = useRef(false)
  const csvInFlightRef = useRef(false)

  useEffect(() => () => { csvAbortRef.current = true }, [])
  useEffect(() => { setReportRows([]); setReportLoaded(false) }, [groupBy])

  function buildDateRange() {
    return dateRangeType === 'quick'
      ? { quick: quickAlias }
      : { fixed: { start_date: customStart, end_date: customEnd } }
  }

  async function fetchReport() {
    setReportLoading(true)
    setReportError('')
    setCsvError('')
    const dateRange = buildDateRange()
    try {
      const res = await apiFetch(previewUrl, {
        method: 'POST',
        body: JSON.stringify({ date_range: dateRange, group_by: groupBy }),
      })
      if (!res.ok) throw new Error('report request failed')
      const data = await res.json()
      setReportColumns(data.column_order ?? [])
      setReportRows(data.rows ?? [])
      setReportLoaded(true)
    } catch (err) {
      if (err.message !== 'Unauthorized') setReportError('Failed to load report.')
      setReportLoaded(false)
    } finally {
      setReportLoading(false)
    }
  }

  async function downloadCSV() {
    if (csvInFlightRef.current) return
    csvInFlightRef.current = true
    csvAbortRef.current = false
    setCsvLoading(true)
    setCsvError('')
    const dateRange = buildDateRange()
    try {
      const genRes = await apiFetch(generateUrl, {
        method: 'POST',
        body: JSON.stringify({ date_range: dateRange, group_by: groupBy }),
      })
      if (!genRes.ok) {
        setCsvError('Failed to start report generation.')
        return
      }
      const genData = await genRes.json()
      if (!genData.report_generation_id) {
        setCsvError('Failed to start report generation.')
        return
      }
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000))
        if (csvAbortRef.current) return
        const statusRes = await apiFetch(`/report/status/${genData.report_generation_id}`)
        if (csvAbortRef.current) return
        if (!statusRes.ok) {
          setCsvError('Failed to check report status.')
          return
        }
        const statusData = await statusRes.json()
        if (statusData.status_name === 'FINISHED_OK') {
          const a = document.createElement('a')
          a.href = statusData.report_download_url
          a.style.display = 'none'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          return
        }
        if (statusData.status_name === 'FAILED') {
          setCsvError(statusData.error || 'Report generation failed.')
          return
        }
      }
      setCsvError('Report generation timed out.')
    } catch (err) {
      if (err.message !== 'Unauthorized') setCsvError('Failed to download report.')
    } finally {
      csvInFlightRef.current = false
      if (!csvAbortRef.current) setCsvLoading(false)
    }
  }

  function handleQuickChange(e) {
    const val = e.target.value
    if (val === 'custom') {
      setDateRangeType('fixed')
    } else {
      setDateRangeType('quick')
      setQuickAlias(val)
      if (val === 'TODAY') setGroupBy('day')
    }
  }

  return {
    quickAlias, dateRangeType, customStart, customEnd, groupBy,
    setGroupBy, setCustomStart, setCustomEnd,
    reportColumns, reportRows, reportLoading, reportError, reportLoaded,
    csvLoading, csvError,
    fetchReport, downloadCSV, handleQuickChange,
  }
}
