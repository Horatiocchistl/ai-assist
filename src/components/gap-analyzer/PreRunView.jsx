import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader, FolderOpen, AlertCircle, RefreshCw, Link2 } from 'lucide-react'
import AsinPlanEditor from './AsinPlanEditor.jsx'
import ImageDropZone from './ImageDropZone.jsx'
import PreRunRequirements from './PreRunRequirements.jsx'
import FolderImportUrlModal from './FolderImportUrlModal.jsx'
import { extractAsin } from '../../lib/extractAsin.js'
import {
  loadActiveEngagement,
  loadAllPlans,
  createPlan,
  uploadImage,
  importFolderPayload,
  isPlanReady,
  MAX_PLANS,
} from '../../hooks/usePlannedEngagement.js'
import { migrateOrphanPlans } from '../../hooks/usePlannedEngagement.js'

const panelStyle = {
  padding: '1rem',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-panel)',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.85rem',
}

const stepLabel = {
  fontSize: '0.68em',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--accent)',
}

export default function PreRunView({ onPlansChange }) {
  const [engagement, setEngagement] = useState(null)
  const [plans, setPlans] = useState([])
  const [urlInput, setUrlInput] = useState('')
  const [pendingFiles, setPendingFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState('')
  const [addError, setAddError] = useState('')
  const [importError, setImportError] = useState('')
  const [importWarnings, setImportWarnings] = useState([])
  const [lastScanSummary, setLastScanSummary] = useState(null)
  const [urlPrompt, setUrlPrompt] = useState(null)

  const parsedUrl = useMemo(() => extractAsin(urlInput), [urlInput])
  const canCreate = !!(parsedUrl && pendingFiles.length > 0 && plans.length < MAX_PLANS)

  const refresh = useCallback(async () => {
    const eng = await loadActiveEngagement()
    setEngagement(eng)
    const data = await loadAllPlans()
    setPlans(data)
    onPlansChange?.(data, eng)
  }, [onPlansChange])

  useEffect(() => {
    async function init() {
      await migrateOrphanPlans().catch(() => {})
      await refresh()
      setLoading(false)
    }
    init()
  }, [refresh])

  function appendPending(files) {
    setPendingFiles(prev => [...prev, ...files])
  }

  function removePending(index) {
    setPendingFiles(prev => prev.filter((_, i) => i !== index))
  }

  async function handleCreateProduct() {
    if (!canCreate) return
    setAdding(true)
    setAddError('')
    const res = await createPlan(engagement?.id, urlInput)
    if (!res.ok) {
      setAddError(res.error)
      setAdding(false)
      return
    }
    for (const file of pendingFiles) {
      const up = await uploadImage(res.plan, file)
      if (!up.ok) {
        setAddError(up.error)
        break
      }
    }
    setUrlInput('')
    setPendingFiles([])
    await refresh()
    setAdding(false)
  }

  async function runFolderImport(payload, resolvedAsins) {
    const importPayload = {
      ...payload,
      asins: resolvedAsins.filter(a => a.url && a.files?.some(f => f.kind === 'image')),
    }
    if (!importPayload.asins.length) {
      setImportError(payload.errors?.join('; ') || 'Nothing to import — need images and Amazon URL per folder')
      return
    }

    setImporting(true)
    setImportProgress('Uploading to Supabase…')
    const result = await importFolderPayload(importPayload, { replace: true, onProgress: setImportProgress })
    setImporting(false)
    setImportProgress('')

    setLastScanSummary({
      imported: result.imported ?? importPayload.asins.length,
      skipped: (payload.errors || []).length,
      urlPrompted: resolvedAsins.length - (payload.asins?.length || 0),
    })

    if (!result.ok) setImportError(result.error || 'Import failed')
    if (result.errors?.length) setImportWarnings(result.errors)
    if (payload.errors?.length) setImportWarnings(prev => [...(payload.errors || []), ...(result.errors || [])])
    await refresh()
  }

  async function handleImportFolder() {
    const api = window.electronAPI
    if (!api?.pickPlannedFolder) {
      setImportError('Folder import requires the Electron app (npm run electron:dev)')
      return
    }
    setImportError('')
    setImportWarnings([])
    setLastScanSummary(null)
    setUrlPrompt(null)
    const pick = await api.pickPlannedFolder()
    if (pick.canceled) return

    setImporting(true)
    setImportProgress('Scanning folder for images and URL…')
    const payload = await api.readPlannedFolder(pick.path)
    setImporting(false)
    setImportProgress('')

    if (payload.error) {
      setImportError(payload.error)
      return
    }

    const readyAsins = payload.asins || []
    const needsUrl = payload.needsUrl || []

    if (needsUrl.length > 0) {
      setUrlPrompt({
        basePayload: payload,
        queue: needsUrl,
        index: 0,
        resolved: [...readyAsins],
      })
      return
    }

    if (payload.errors?.length) setImportWarnings(payload.errors)
    await runFolderImport(payload, readyAsins)
  }

  function handleUrlModalConfirm(url, asin) {
    if (!urlPrompt) return
    const item = urlPrompt.queue[urlPrompt.index]
    const resolved = {
      ...item,
      url,
      asin,
      ready: true,
    }
    const nextResolved = [...urlPrompt.resolved, resolved]
    const nextIndex = urlPrompt.index + 1

    if (nextIndex < urlPrompt.queue.length) {
      setUrlPrompt({ ...urlPrompt, index: nextIndex, resolved: nextResolved })
      return
    }

    setUrlPrompt(null)
    if (urlPrompt.basePayload.errors?.length) {
      setImportWarnings(urlPrompt.basePayload.errors)
    }
    void runFolderImport(urlPrompt.basePayload, nextResolved)
  }

  function handleUrlModalSkip() {
    if (!urlPrompt) return
    const nextIndex = urlPrompt.index + 1
    if (nextIndex < urlPrompt.queue.length) {
      setUrlPrompt({ ...urlPrompt, index: nextIndex })
      return
    }
    const { basePayload, resolved } = urlPrompt
    setUrlPrompt(null)
    if (basePayload.errors?.length) setImportWarnings(basePayload.errors)
    if (resolved.length) void runFolderImport(basePayload, resolved)
    else setImportError('Import canceled — no folders with URL + images')
  }

  function handleUrlModalCancel() {
    setUrlPrompt(null)
    setImportProgress('')
  }

  const readyCount = plans.filter(isPlanReady).length
  const incompletePlans = plans.filter(p => !isPlanReady(p))
  const isElectron = !!window.electronAPI?.pickPlannedFolder

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <FolderImportUrlModal
        open={!!urlPrompt}
        item={urlPrompt?.queue[urlPrompt.index]}
        index={urlPrompt?.index ?? 0}
        total={urlPrompt?.queue.length ?? 0}
        onConfirm={handleUrlModalConfirm}
        onSkip={handleUrlModalSkip}
        onCancel={handleUrlModalCancel}
      />
      <div style={{
        padding: '0.75rem 0.85rem', borderRadius: 8, border: '1px solid var(--border)',
        background: 'var(--bg-panel)', fontSize: '0.8em', lineHeight: 1.5, color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: 'var(--text-primary)' }}>Pre-Run needs two things per product:</strong>
        {' '}an Amazon URL and planned image files. Paste URL + upload images below, or import a folder that contains both.
      </div>

      {engagement && (
        <div style={{ fontSize: '0.78em', color: 'var(--text-muted)' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{engagement.name}</span>
          {' · '}{plans.length} product(s) · {readyCount} ready for Run
        </div>
      )}

      {isElectron && (
        <div style={panelStyle}>
          <div style={stepLabel}>Option A — Import folder</div>
          <p style={{ margin: 0, fontSize: '0.78em', color: 'var(--text-muted)', lineHeight: 1.45 }}>
            Picks a folder; scans for <strong>image files</strong> and an <strong>Amazon URL</strong> in text files (<code>.txt</code>, <code>.md</code>, <code>.url</code>). If URL is missing, a popup asks you to paste it and shows what was found.
          </p>
          <button type="button" onClick={handleImportFolder} disabled={importing} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            padding: '0.55rem 1rem', borderRadius: 6, border: 'none',
            background: importing ? 'var(--border)' : 'var(--accent)',
            color: importing ? 'var(--text-muted)' : '#fff',
            cursor: importing ? 'default' : 'pointer', fontWeight: 600, fontSize: '0.85em',
          }}>
            {importing ? <Loader size={15} /> : <FolderOpen size={15} />}
            {importing ? 'Scanning…' : 'Choose folder & import'}
          </button>
          {importProgress && (
            <div style={{ fontSize: '0.75em', color: 'var(--text-secondary)', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <Loader size={12} /> {importProgress}
            </div>
          )}
          {lastScanSummary && (
            <div style={{ fontSize: '0.72em', color: 'var(--accent)' }}>
              {lastScanSummary.imported} product(s) imported
              {lastScanSummary.skipped > 0 && ` · ${lastScanSummary.skipped} skipped (need URL + images)`}
            </div>
          )}
        </div>
      )}

      <div style={panelStyle}>
        <div style={stepLabel}>Option B — Add product in app</div>
        <PreRunRequirements hasUrl={!!parsedUrl} hasImages={pendingFiles.length > 0} compact />

        <div>
          <div style={{ ...stepLabel, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Step 1 — URL</div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Link2 size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              value={urlInput}
              onChange={e => { setUrlInput(e.target.value); setAddError('') }}
              placeholder="https://www.amazon.com/dp/B0…"
              style={{
                flex: 1, padding: '0.5rem 0.6rem', background: 'var(--input-bg)',
                border: `1px solid ${parsedUrl ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85em',
              }}
            />
          </div>
          {urlInput.trim() && !parsedUrl && (
            <div style={{ fontSize: '0.72em', color: '#c05820', marginTop: '0.35rem' }}>Could not read an Amazon URL from this text</div>
          )}
        </div>

        <div>
          <div style={{ ...stepLabel, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Step 2 — Upload planned images</div>
          <ImageDropZone
            disabled={!parsedUrl}
            hint={parsedUrl ? 'Drop planned images here' : 'Enter a valid URL first'}
            pendingFiles={pendingFiles}
            onFiles={appendPending}
            onRemovePending={removePending}
            label=""
          />
        </div>

        <button
          type="button"
          onClick={handleCreateProduct}
          disabled={!canCreate || adding}
          style={{
            width: '100%', padding: '0.6rem', borderRadius: 6, border: 'none', fontWeight: 600, fontSize: '0.88em',
            background: canCreate && !adding ? 'var(--accent)' : 'var(--border)',
            color: canCreate && !adding ? '#fff' : 'var(--text-muted)',
            cursor: canCreate && !adding ? 'pointer' : 'default',
          }}
        >
          {adding ? 'Saving…' : `Create product plan (${pendingFiles.length} image${pendingFiles.length === 1 ? '' : 's'})`}
        </button>
        {!canCreate && parsedUrl && pendingFiles.length === 0 && (
          <div style={{ fontSize: '0.72em', color: '#c05820', textAlign: 'center' }}>
            Add at least one image — URL alone is not enough to run.
          </div>
        )}
      </div>

      {importError && (
        <div style={{ fontSize: '0.78em', color: '#c05820', display: 'flex', gap: '0.35rem' }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span>{importError}</span>
        </div>
      )}
      {importWarnings.length > 0 && (
        <div style={{ fontSize: '0.72em', color: 'var(--text-muted)', maxHeight: 80, overflowY: 'auto' }}>
          {importWarnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}
      {addError && <div style={{ fontSize: '0.78em', color: '#c05820' }}>{addError}</div>}

      <button type="button" onClick={() => refresh()} disabled={loading} style={{
        alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.35rem',
        padding: '0.35rem 0.5rem', border: 'none', background: 'transparent',
        color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75em',
      }}>
        <RefreshCw size={12} /> Refresh
      </button>

      {loading && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85em', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Loader size={14} /> Loading…
        </div>
      )}

      {!loading && incompletePlans.length > 0 && (
        <div style={{
          padding: '0.75rem', borderRadius: 8,
          border: '1px solid #c05820', background: 'rgba(192, 88, 32, 0.08)',
        }}>
          <div style={{ fontSize: '0.78em', fontWeight: 600, color: '#c05820', marginBottom: '0.5rem' }}>
            {incompletePlans.length} product(s) missing images or URL — expand below to upload
          </div>
        </div>
      )}

      {!loading && plans.length > 0 && (
        <div>
          <div style={{ fontSize: '0.72em', fontWeight: 600, letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            YOUR PRODUCTS ({plans.length})
          </div>
          {plans.map(plan => (
            <AsinPlanEditor key={plan.id} plan={plan} onRefresh={refresh} defaultExpanded={!isPlanReady(plan)} />
          ))}
        </div>
      )}
    </div>
  )
}
