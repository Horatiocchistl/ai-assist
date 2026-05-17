import React, { useEffect, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { Download, X } from 'lucide-react'

const iconBtn = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px',
  borderRadius: '4px',
  flexShrink: 0,
}

function getApiBase() {
  if (typeof window !== 'undefined' && window.location?.port && window.location.port !== '5173') {
    return window.location.origin
  }
  return 'http://localhost:3001'
}

export default function ReportPreviewPanel({ reportId, error: externalError, onClose }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    if (!reportId) {
      setReport(null)
      setLoading(false)
      setSaveError(null)
      setLoadError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setSaveError(null)
    fetch(`${getApiBase()}/api/reports/${encodeURIComponent(reportId)}`)
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return
        if (ok) {
          setReport(data)
          setLoadError(null)
        } else {
          setReport(null)
          setLoadError(data.error || 'Failed to load report')
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setReport(null)
          setLoadError(err.message || 'Failed to load report')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [reportId])

  const handleSaveAs = useCallback(async () => {
    if (!report?.content) return
    setSaveError(null)
    const defaultFilename = report.filename || 'report.md'
    try {
      if (window.electronAPI?.saveReportAs) {
        const result = await window.electronAPI.saveReportAs({
          content: report.content,
          defaultFilename,
        })
        if (result?.canceled) return
        if (result?.error) setSaveError(result.error)
        return
      }
      const blob = new Blob([report.content], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = defaultFilename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setSaveError(err.message || 'Save failed')
    }
  }, [report])

  const displayError = externalError || loadError

  if (!reportId && !displayError) return null

  const title = report?.dateTimeDisplay
    || report?.filename
    || (report?.content?.match(/^#\s+(.+)/m)?.[1]?.trim())
    || (displayError ? 'Report error' : 'Document')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.5rem 0.5rem 0.5rem 0.85rem',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: '0.8em',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={title}
        >
          {loading ? '…' : title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
          {report?.content && (
            <button
              type="button"
              onClick={handleSaveAs}
              style={iconBtn}
              title="Save as…"
              aria-label="Save as"
            >
              <Download size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={iconBtn}
            title="Close preview"
            aria-label="Close preview"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.85rem',
          minHeight: 0,
        }}
      >
        {displayError && !report?.content && (
          <div style={{ fontSize: '0.8em', color: 'var(--stop-color)' }}>{displayError}</div>
        )}
        {report?.content && (
          <div className="prose" style={{ fontSize: '0.82em', color: 'var(--text-primary)' }}>
            <ReactMarkdown>{report.content}</ReactMarkdown>
          </div>
        )}
      </div>

      {saveError && (
        <div
          style={{
            flexShrink: 0,
            padding: '0.35rem 0.85rem',
            fontSize: '0.75em',
            color: 'var(--stop-color)',
            borderTop: '1px solid var(--border)',
          }}
        >
          {saveError}
        </div>
      )}
    </div>
  )
}
