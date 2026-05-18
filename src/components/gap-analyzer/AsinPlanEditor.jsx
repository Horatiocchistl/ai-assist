import React, { useState, useEffect, useMemo } from 'react'
import { X, Loader, AlertCircle, FileSpreadsheet, FileJson, ChevronUp, ChevronDown, GripVertical, ChevronRight } from 'lucide-react'
import ImageDropZone from './ImageDropZone.jsx'
import PreRunRequirements from './PreRunRequirements.jsx'
import {
  uploadImage,
  removeImage,
  uploadSheet,
  removeSheet,
  uploadProductData,
  getSignedUrl,
  deletePlan,
  reorderPlanImages,
  sortPlanImages,
  isPlanReady,
  SHEET_ACCEPT,
} from '../../hooks/usePlannedEngagement.js'

const labelStyle = {
  fontSize: '0.68em',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '0.35rem',
}

export default function AsinPlanEditor({ plan, onRefresh, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [thumbUrls, setThumbUrls] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const sortedImages = useMemo(() => sortPlanImages(plan.images), [plan.images])

  useEffect(() => {
    let cancelled = false
    async function loadThumbs() {
      const urls = {}
      for (const img of sortedImages) {
        const url = await getSignedUrl(img.path)
        if (url) urls[img.path] = url
      }
      if (!cancelled) setThumbUrls(urls)
    }
    loadThumbs()
    return () => { cancelled = true }
  }, [sortedImages])

  async function handleImageFiles(files) {
    if (!files?.length) return
    setBusy(true)
    setError('')
    for (const file of files) {
      const res = await uploadImage(plan, file)
      if (!res.ok) {
        setError(res.error)
        break
      }
    }
    setBusy(false)
    onRefresh()
  }

  async function handleMove(index, direction) {
    const toIndex = index + direction
    if (toIndex < 0 || toIndex >= sortedImages.length) return
    setBusy(true)
    const res = await reorderPlanImages(plan.id, plan, index, toIndex)
    if (!res.ok) setError(res.error)
    setBusy(false)
    onRefresh()
  }

  async function handleSheet(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    const res = await uploadSheet(plan, file)
    if (!res.ok) setError(res.error)
    setBusy(false)
    onRefresh()
  }

  async function handleProductData(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    const res = await uploadProductData(plan, file)
    if (!res.ok) setError(res.error)
    setBusy(false)
    onRefresh()
  }

  async function handleRemoveImage(storagePath) {
    setBusy(true)
    await removeImage(plan.id, plan, storagePath)
    setBusy(false)
    onRefresh()
  }

  async function handleRemoveSheet() {
    setBusy(true)
    await removeSheet(plan)
    setBusy(false)
    onRefresh()
  }

  async function handleDelete() {
    if (!confirm(`Remove plan for ${plan.asin}?`)) return
    setBusy(true)
    const res = await deletePlan(plan)
    if (!res.ok) setError(res.error)
    else if (res.warning) setError(res.warning)
    setBusy(false)
    onRefresh()
  }

  const shortUrl = (plan.url || '').replace(/^https?:\/\//, '').slice(0, 56)
  const ready = isPlanReady(plan)
  const imageCount = (plan.images || []).length

  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      padding: '0.75rem 0',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.65rem',
    }}>
      <div
        style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ display: 'flex', gap: '0.35rem', minWidth: 0, flex: 1 }}>
          {expanded
            ? <ChevronDown size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            : <ChevronRight size={14} style={{ flexShrink: 0, marginTop: 2 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.88em' }}>{plan.asin}</div>
            <div style={{ fontSize: '0.7em', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {shortUrl}
            </div>
            {ready ? (
              <div style={{ fontSize: '0.62em', color: 'var(--accent)', marginTop: 2 }}>Ready for Run</div>
            ) : (
              <div style={{ fontSize: '0.62em', color: '#c05820', marginTop: 2 }}>
                {!plan.url ? 'Missing URL' : imageCount === 0 ? 'Upload planned images below' : 'Incomplete'}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); handleDelete() }}
          disabled={busy}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}
          title="Remove plan"
        >
          <X size={14} />
        </button>
      </div>

      {expanded && !ready && (
        <PreRunRequirements hasUrl={!!plan.url} hasImages={imageCount > 0} compact />
      )}

      {expanded && error && (
        <div style={{ fontSize: '0.72em', color: '#c05820', display: 'flex', gap: '0.35rem', alignItems: 'flex-start' }}>
          <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{error}</span>
        </div>
      )}

      {expanded && (
        <section>
          {imageCount === 0 ? (
            <ImageDropZone
              onFiles={handleImageFiles}
              disabled={busy}
              hint="Drop planned images here or click to browse"
              label="Planned images (required)"
            />
          ) : (
            <>
              <div style={labelStyle}>Planned images ({sortedImages.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {sortedImages.map((img, index) => (
                  <div
                    key={img.path}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.35rem 0.45rem', borderRadius: 6,
                      border: '1px solid var(--border)', background: 'var(--bg-panel)',
                    }}
                  >
                    <GripVertical size={12} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: 0.5 }} />
                    <span style={{
                      fontSize: '0.65em', color: 'var(--text-muted)', width: 16, textAlign: 'center', flexShrink: 0,
                    }}>
                      {index + 1}
                    </span>
                    <div style={{
                      width: 48, height: 36, borderRadius: 4, overflow: 'hidden', flexShrink: 0,
                      border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                    }}>
                      {thumbUrls[img.path] ? (
                        <img src={thumbUrls[img.path]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Loader size={10} style={{ color: 'var(--text-muted)' }} />
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: '0.75em', color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {img.label || img.filename}
                      {img.label && img.label !== img.filename && (
                        <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>{img.filename}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                      <button
                        type="button"
                        disabled={busy || index === 0}
                        onClick={() => handleMove(index, -1)}
                        style={{
                          border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                          borderRadius: 3, padding: 2, cursor: index === 0 ? 'default' : 'pointer',
                          opacity: index === 0 ? 0.35 : 1,
                        }}
                        title="Move up"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={busy || index === sortedImages.length - 1}
                        onClick={() => handleMove(index, 1)}
                        style={{
                          border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                          borderRadius: 3, padding: 2, cursor: index === sortedImages.length - 1 ? 'default' : 'pointer',
                          opacity: index === sortedImages.length - 1 ? 0.35 : 1,
                        }}
                        title="Move down"
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(img.path)}
                      disabled={busy}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, flexShrink: 0 }}
                      title="Remove"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <ImageDropZone
                  onFiles={handleImageFiles}
                  disabled={busy}
                  hint="Add more images"
                  label=""
                />
              </div>
            </>
          )}
        </section>
      )}

      {expanded && (
        <section>
          <div style={labelStyle}>Copy spec (optional)</div>
          {plan.sheet ? (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.25rem 0.5rem', borderRadius: 4,
              border: '1px solid var(--border)', background: 'var(--bg-secondary)', fontSize: '0.78em',
            }}>
              <FileSpreadsheet size={12} style={{ color: 'var(--accent)' }} />
              <span>{plan.sheet.filename}</span>
              <button type="button" onClick={handleRemoveSheet} disabled={busy} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                <X size={12} />
              </button>
            </div>
          ) : (
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.3rem 0.6rem', borderRadius: 4, border: '1px solid var(--border)',
              cursor: busy ? 'default' : 'pointer', fontSize: '0.78em', color: 'var(--text-secondary)',
            }}>
              <input type="file" accept={SHEET_ACCEPT} hidden disabled={busy} onChange={handleSheet} />
              Upload .xlsx / .csv
            </label>
          )}
        </section>
      )}

      {expanded && (
        <section>
          <div style={labelStyle}>Product data (optional)</div>
          {plan.product_data ? (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.25rem 0.5rem', borderRadius: 4,
              border: '1px solid var(--border)', background: 'var(--bg-secondary)', fontSize: '0.78em',
            }}>
              <FileJson size={12} style={{ color: 'var(--accent)' }} />
              <span>product-data.json</span>
            </div>
          ) : (
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.3rem 0.6rem', borderRadius: 4, border: '1px solid var(--border)',
              cursor: busy ? 'default' : 'pointer', fontSize: '0.78em', color: 'var(--text-secondary)',
            }}>
              <input type="file" accept="application/json,.json" hidden disabled={busy} onChange={handleProductData} />
              Upload JSON
            </label>
          )}
        </section>
      )}
    </div>
  )
}
