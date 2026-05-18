import React, { useEffect, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Download, X, Save, Check } from 'lucide-react'
import DocumentCreatingStatus from './DocumentCreatingStatus.jsx'
import '../styles/document-preview.css'

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

const actionBtn = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.28rem 0.6rem',
  fontSize: '0.72em',
  fontWeight: 500,
  borderRadius: '5px',
  flexShrink: 0,
}

const saveBtn = {
  ...actionBtn,
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
}

const savedBtn = {
  ...actionBtn,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'default',
}

const draftLabel = {
  fontSize: '0.68em',
  fontWeight: 500,
  color: 'var(--text-muted)',
  marginRight: '0.75rem',
  flexShrink: 0,
  letterSpacing: '0.02em',
}

function getApiBase() {
  if (typeof window !== 'undefined' && window.location?.port && window.location.port !== '5173') {
    return window.location.origin
  }
  return 'http://localhost:3001'
}

const previewMarkdownComponents = {
  table: ({ children }) => (
    <div className="document-preview-table-wrap">
      <table>{children}</table>
    </div>
  ),
}


export default function ReportPreviewPanel({
  reportId,
  savedDocument,
  savedDocuments = [],
  error: externalError,
  documentCreating = false,
  documentPhase = 'preparing',
  onPreviewReady,
  onCommitSave,
  onSelectSavedDocument,
  onOpenDocumentChange,
  onClose,
}) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [saving, setSaving] = useState(false)

  const isSavedView = !!savedDocument?.content
  const isDraftView = !!reportId && !isSavedView

  useEffect(() => {
    if (savedDocument?.content) {
      setReport(savedDocument)
      setLoading(false)
      setLoadError(null)
      onOpenDocumentChange?.(savedDocument.id, savedDocument.content, {
        title: savedDocument.title,
        filename: savedDocument.filename,
      })
      return () => onOpenDocumentChange?.(null, null, null)
    }
    return undefined
  }, [savedDocument, onOpenDocumentChange])

  useEffect(() => {
    if (!reportId || savedDocument?.content) {
      if (!savedDocument?.content) setReport(null)
      setLoading(false)
      setLoadError(null)
      if (!savedDocument?.content) onOpenDocumentChange?.(null, null, null)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    setSaveError(null)
    fetch(`${getApiBase()}/api/reports/${encodeURIComponent(reportId)}`)
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return
        if (ok) {
          setReport({ ...data, status: 'draft' })
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
  }, [reportId, savedDocument?.content, onOpenDocumentChange])

  useEffect(() => {
    if (isDraftView && report?.content) {
      onOpenDocumentChange?.(reportId, report.content, {
        title: report.title,
        filename: report.filename,
      })
      return () => onOpenDocumentChange?.(null, null, null)
    }
    if (!isSavedView && !isDraftView) {
      onOpenDocumentChange?.(null, null, null)
    }
    return undefined
  }, [isDraftView, isSavedView, report, reportId, onOpenDocumentChange])

  const handleSaveAs = useCallback(async () => {
    const content = report?.content
    if (!content) return
    setSaveError(null)
    const defaultFilename = report.filename || 'report.md'
    try {
      if (window.electronAPI?.saveReportAs) {
        const result = await window.electronAPI.saveReportAs({
          content,
          defaultFilename,
        })
        if (result?.canceled) return
        if (result?.error) setSaveError(result.error)
        return
      }
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
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

  const handleCommitSave = useCallback(async () => {
    if (!onCommitSave || !reportId || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await onCommitSave(reportId)
    } catch (err) {
      setSaveError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [onCommitSave, reportId, saving])

  const displayError = externalError || loadError
  const showCreating = documentCreating && !report?.content && !displayError

  useEffect(() => {
    if (documentCreating && report?.content) {
      onPreviewReady?.()
    }
  }, [documentCreating, report?.content, onPreviewReady])

  const visible = reportId || savedDocument || displayError || documentCreating
  if (!visible) return null

  const title = report?.dateTimeDisplay
    || report?.filename
    || savedDocument?.title
    || (report?.content?.match(/^#\s+(.+)/m)?.[1]?.trim())
    || (displayError ? 'Report error' : showCreating ? 'Creating your document' : 'Document')

  const fileLabel = showCreating
    ? 'Creating your document'
    : report?.filename
      ? `${report.filename.replace(/\.md$/i, '')} · MD`
      : 'Document'

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
          padding: '0.5rem 0.85rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
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
            {loading && !report?.content ? '…' : fileLabel}
          </div>
          {isDraftView && report?.content && !saving && (
            <span style={draftLabel}>Draft</span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '0.25rem' }}>
            {report?.content && onCommitSave && (isDraftView || isSavedView) && (
              <button
                type="button"
                onClick={isSavedView ? undefined : handleCommitSave}
                disabled={saving || isSavedView}
                style={{
                  ...(isSavedView ? savedBtn : saveBtn),
                  opacity: saving ? 0.6 : 1,
                }}
                title={isSavedView ? 'Saved to conversation' : 'Save to conversation'}
              >
                {saving ? (
                  '…'
                ) : isSavedView ? (
                  <><Check size={14} /> Saved</>
                ) : (
                  <><Save size={14} /> Save</>
                )}
              </button>
            )}
            {report?.content && (
              <button type="button" onClick={handleSaveAs} style={iconBtn} title="Save as…" aria-label="Save as">
                <Download size={16} />
              </button>
            )}
            <button type="button" onClick={onClose} style={iconBtn} title="Close preview" aria-label="Close preview">
              <X size={16} />
            </button>
          </div>
        </div>
        {savedDocuments.length > 0 && onSelectSavedDocument && (
          <select
            value={savedDocument?.id || ''}
            onChange={e => {
              const id = e.target.value
              if (id) onSelectSavedDocument(id)
            }}
            style={{
              marginTop: '0.35rem',
              width: '100%',
              fontSize: '0.75em',
              padding: '0.25rem 0.35rem',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              background: 'var(--input-bg)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">Saved documents…</option>
            {savedDocuments.map(d => (
              <option key={d.id} value={d.id}>
                {d.title || d.filename}
              </option>
            ))}
          </select>
        )}
      </div>

      <div
        className="document-preview-canvas"
        style={showCreating ? {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          minHeight: 0,
        } : { flex: 1, minHeight: 0, overflow: 'auto' }}
      >
        {showCreating && <DocumentCreatingStatus phase={documentPhase} active />}
        {displayError && !report?.content && !showCreating && (
          <div style={{ fontSize: '0.85em', color: 'var(--stop-color)', padding: '8px 12px' }}>
            {displayError}
          </div>
        )}
        {report?.content && (
          <div className="document-preview-page">
            <div className="document-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={previewMarkdownComponents}>
                {report.content}
              </ReactMarkdown>
            </div>
          </div>
        )}
        {loading && !report?.content && !showCreating && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.9em' }}>
            Loading document…
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
            background: 'var(--bg-panel)',
          }}
        >
          {saveError}
        </div>
      )}
    </div>
  )
}