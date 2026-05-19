import React, { useState, useEffect, useRef } from 'react'
import { ArrowLeft, X, ChevronDown, ChevronRight } from 'lucide-react'
import { useGaps } from '../../hooks/useGaps.js'
import { getAsinLiveFiles } from '../../hooks/useGapSessions.js'
import { getLiveSignedUrl } from '../../hooks/usePlannedEngagement.js'
import { getGapApiBase } from '../../lib/gapApi.js'

const IMAGE_RE = /\.(png|jpe?g|webp)$/i

// ─── Lightbox ────────────────────────────────────────────────────────────────

function Lightbox({ src, onClose }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'rgba(255,255,255,0.12)', border: 'none',
          borderRadius: 6, padding: '0.3rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center',
        }}
      >
        <X size={18} color="#fff" />
      </button>
      <img
        src={src}
        alt="full size"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 4 }}
      />
    </div>
  )
}

// ─── Left panel: recreated product page screenshots ───────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: '0.65em', fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase', color: 'var(--text-muted)', paddingTop: '0.5rem',
    }}>
      {children}
    </div>
  )
}

function ScreenshotPanel({ imageUrls, onLightbox }) {
  const filenames = Object.keys(imageUrls).filter(f => IMAGE_RE.test(f)).sort()
  const hero     = filenames.find(f => f === 'hero_viewport.png')
  const carousel = filenames.filter(f => /^carousel_\d+/.test(f)).sort()
  const scrolls  = filenames.filter(f => /^scroll_/.test(f)).sort()
  const aplus    = filenames.filter(f => /^aplus_\d+/.test(f)).sort()

  const img = (filename, extra = {}) => {
    const src = imageUrls[filename]
    if (!src) return null
    return (
      <img
        key={filename}
        loading="lazy"
        src={src}
        alt={filename}
        onClick={() => onLightbox(src)}
        style={{
          cursor: 'zoom-in',
          border: '1px solid var(--border)',
          borderRadius: 4,
          objectFit: 'contain',
          background: '#fff',
          ...extra,
        }}
      />
    )
  }

  return (
    <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {hero && <>
        <SectionLabel>Hero</SectionLabel>
        {img(hero, { width: '100%', borderRadius: 6 })}
      </>}

      {carousel.length > 0 && <>
        <SectionLabel>Carousel ({carousel.length})</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
          {carousel.map(f => (
            <div key={f} style={{ aspectRatio: '1', overflow: 'hidden' }}>
              {img(f, { width: '100%', height: '100%', objectFit: 'contain' })}
            </div>
          ))}
        </div>
      </>}

      {scrolls.length > 0 && <>
        <SectionLabel>Page Scroll</SectionLabel>
        {scrolls.map(f => {
          const m = f.match(/scroll_(\d+)pct/)
          return (
            <div key={f}>
              <div style={{ fontSize: '0.68em', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                {m ? `${m[1]}% scroll` : f}
              </div>
              {img(f, { width: '100%' })}
            </div>
          )
        })}
      </>}

      {aplus.length > 0 && <>
        <SectionLabel>A+ Content ({aplus.length})</SectionLabel>
        {aplus.map((f, i) => (
          <div key={f}>
            <div style={{ fontSize: '0.68em', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              Module {i + 1}
            </div>
            {img(f, { width: '100%' })}
          </div>
        ))}
      </>}

      {filenames.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.8em', paddingTop: '2rem', textAlign: 'center' }}>
          No captures yet
        </div>
      )}
    </div>
  )
}

// ─── Right panel: gap findings by category ────────────────────────────────────

function GapCard({ gap, schema }) {
  const severityDef = schema?.severity_levels?.find(s => s.id === gap.severity) || {}
  const gapTypeDef  = schema?.gap_types?.find(t => t.id === gap.gap_type) || {}
  const sectionDef  = schema?.sections?.find(s => s.id === gap.section) || {}

  const badgeColor = severityDef.color || 'var(--border)'
  const badgeLabel = severityDef.label || gap.severity || '—'
  const typeLabel  = gapTypeDef.label  || gap.gap_type?.replace(/_/g, ' ') || '—'

  return (
    <div style={{
      padding: '0.75rem',
      border: '1px solid var(--border)',
      borderRadius: 6,
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.4rem',
    }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <span style={{
          padding: '0.2rem 0.45rem',
          borderRadius: 4,
          background: badgeColor,
          color: '#fff',
          fontSize: '0.6em',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          flexShrink: 0,
        }}>
          {badgeLabel}
        </span>
        <span style={{ fontSize: '0.68em', color: 'var(--text-muted)' }}>
          {typeLabel}
          {sectionDef.label ? ` · ${sectionDef.label}` : gap.section ? ` · ${gap.section}` : ''}
        </span>
      </div>

      {gap.description && (
        <div style={{ fontSize: '0.78em', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          {gap.description}
        </div>
      )}
    </div>
  )
}

function CategorySection({ category, gaps, schema, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.5rem 0',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--border)',
          cursor: 'pointer',
          textAlign: 'left',
          marginBottom: '0.5rem',
        }}
      >
        {open
          ? <ChevronDown size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          : <ChevronRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        }
        <span style={{ fontSize: '0.75em', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.03em' }}>
          {category.label}
        </span>
        <span style={{ fontSize: '0.68em', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {gaps.length} finding{gaps.length !== 1 ? 's' : ''}
        </span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          {gaps.length === 0 ? (
            <div style={{ fontSize: '0.75em', color: 'var(--text-muted)', paddingLeft: '1.2rem', paddingBottom: '0.5rem' }}>
              No findings
            </div>
          ) : (
            gaps.map(gap => <GapCard key={gap.id} gap={gap} schema={schema} />)
          )}
        </div>
      )}
    </div>
  )
}

function AnalysisPanel({ gaps, schema, analyzing, log, onRunAnalysis, hasRun }) {
  const categories = schema?.categories || []
  const logEndRef = useRef(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  if (analyzing) {
    return (
      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.78em', fontWeight: 600, color: 'var(--text-primary)' }}>
          Analyzing…
        </div>
        <div style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '0.75rem',
          fontFamily: 'monospace',
          fontSize: '0.72em',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          maxHeight: 300,
          overflowY: 'auto',
        }}>
          {log.map((line, i) => <div key={i}>{line}</div>)}
          <div ref={logEndRef} />
        </div>
      </div>
    )
  }

  if (!hasRun && gaps.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: '1rem', padding: '3rem 1.5rem',
      }}>
        <div style={{ fontSize: '0.82em', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
          No analysis yet. Run the LLM to generate gap findings for this ASIN.
        </div>
        <button
          type="button"
          onClick={onRunAnalysis}
          style={{
            padding: '0.55rem 1.1rem',
            border: 'none',
            borderRadius: 6,
            background: 'var(--accent)',
            color: '#fff',
            fontSize: '0.82em',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Run LLM Analysis
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Re-run button when findings exist */}
      {gaps.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <button
            type="button"
            onClick={onRunAnalysis}
            style={{
              padding: '0.35rem 0.75rem',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: '0.75em',
              cursor: 'pointer',
            }}
          >
            Re-run Analysis
          </button>
        </div>
      )}

      {categories.map(cat => {
        const catGaps = gaps.filter(g => g.category === cat.id)
        return (
          <CategorySection
            key={cat.id}
            category={cat}
            gaps={catGaps}
            schema={schema}
            defaultOpen={catGaps.length > 0}
          />
        )
      })}

      {/* Uncategorized fallback */}
      {gaps.filter(g => !categories.find(c => c.id === g.category)).length > 0 && (
        <CategorySection
          category={{ id: '__other', label: 'Other' }}
          gaps={gaps.filter(g => !categories.find(c => c.id === g.category))}
          schema={schema}
          defaultOpen
        />
      )}
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function LlmAnalysisView({ runId, asin, liveFiles = [], engagementId, onBack }) {
  const { gaps, loading: gapsLoading, refetch } = useGaps(runId, asin)
  const [schema, setSchema] = useState(null)
  const [imageUrls, setImageUrls] = useState({})
  const [lightbox, setLightbox] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [log, setLog] = useState([])
  const [hasRun, setHasRun] = useState(false)

  // Fetch skill schema
  useEffect(() => {
    fetch(`${getGapApiBase()}/skill-schema`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSchema(data) })
      .catch(() => {})
  }, [])

  // Load live screenshots
  useEffect(() => {
    let cancelled = false
    async function load() {
      const files = getAsinLiveFiles(liveFiles, asin)
      const urls = {}
      for (const f of files) {
        if (!f.path || !IMAGE_RE.test(f.filename)) continue
        const signed = await getLiveSignedUrl(f.path)
        if (signed) urls[f.filename] = signed
      }
      if (!cancelled) setImageUrls(urls)
    }
    load()
    return () => { cancelled = true }
  }, [liveFiles, asin])

  async function runAnalysis() {
    if (!runId || !engagementId || analyzing) return
    setAnalyzing(true)
    setLog([])
    setHasRun(true)

    try {
      const res = await fetch(`${getGapApiBase()}/run/${runId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asin, engagementId }),
      })

      const reader = res.body?.getReader()
      const dec = new TextDecoder()
      let buf = ''

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop()
        for (const part of parts) {
          const evLine = part.match(/^event: (.+)/m)
          const dataLine = part.match(/^data: (.+)/m)
          if (!dataLine) continue
          try {
            const payload = JSON.parse(dataLine[1])
            const evName = evLine?.[1] || 'progress'
            if (evName === 'progress' || evName === 'log') {
              setLog(l => [...l, payload.message || payload.text || JSON.stringify(payload)])
            } else if (evName === 'complete') {
              setLog(l => [...l, '✓ Analysis complete'])
            } else if (evName === 'error') {
              setLog(l => [...l, `Error: ${payload.message}`])
            }
          } catch { /* non-JSON line */ }
        }
      }
    } catch (err) {
      setLog(l => [...l, `Error: ${err.message}`])
    } finally {
      setAnalyzing(false)
      refetch()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', background: 'var(--bg-primary)' }}>

      {/* Header */}
      <div style={{
        flexShrink: 0,
        height: 44,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0 1.25rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
      }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            border: 'none', background: 'transparent',
            color: 'var(--text-secondary)', cursor: 'pointer',
            fontSize: '0.8em', padding: '0.2rem 0.4rem', borderRadius: 4,
          }}
        >
          <ArrowLeft size={14} />
          Results
        </button>
        <span style={{ color: 'var(--border)' }}>/</span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.85em', fontWeight: 600, color: 'var(--text-primary)' }}>
          {asin}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75em', marginLeft: 'auto' }}>
          LLM Analysis
        </span>
        {!analyzing && (
          <button
            type="button"
            onClick={runAnalysis}
            disabled={!engagementId}
            style={{
              padding: '0.3rem 0.7rem',
              border: 'none',
              borderRadius: 6,
              background: 'var(--accent)',
              color: '#fff',
              fontSize: '0.75em',
              fontWeight: 600,
              cursor: engagementId ? 'pointer' : 'not-allowed',
              opacity: engagementId ? 1 : 0.5,
            }}
          >
            {gaps.length > 0 ? 'Re-run' : 'Run Analysis'}
          </button>
        )}
      </div>

      {/* Two-panel body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left — live page screenshots */}
        <div style={{
          flex: '0 0 48%',
          overflowY: 'auto',
          borderRight: '1px solid var(--border)',
        }}>
          <ScreenshotPanel imageUrls={imageUrls} onLightbox={setLightbox} />
        </div>

        {/* Right — LLM findings by category */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {gapsLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8em' }}>
              Loading…
            </div>
          ) : (
            <AnalysisPanel
              gaps={gaps}
              schema={schema}
              analyzing={analyzing}
              log={log}
              onRunAnalysis={runAnalysis}
              hasRun={hasRun}
            />
          )}
        </div>
      </div>

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
