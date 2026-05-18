import React, { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, X, ChevronRight } from 'lucide-react'

const API = '/api/gap-analyzer'

function imgUrl(runId, asin, filename) {
  return `${API}/captures/${runId}/${asin}/${filename}`
}

// ── Safe rendering helpers ────────────────────────────────────────────────────

function safeStr(v) {
  if (v == null) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try { return JSON.stringify(v) } catch { return null }
}

function safeArr(v) {
  return Array.isArray(v) ? v.filter(x => x != null) : []
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ src, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'rgba(255,255,255,0.12)', border: 'none',
          borderRadius: 6, padding: '0.3rem', cursor: 'pointer',
          color: '#fff', display: 'flex',
        }}
      >
        <X size={18} />
      </button>
      <img
        src={src}
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 4 }}
        alt=""
      />
    </div>
  )
}

// ── Screenshot panel ──────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: '0.7em', fontWeight: 600, letterSpacing: '0.06em',
      textTransform: 'uppercase', color: 'var(--text-muted)',
      padding: '0.5rem 0 0.3rem',
      borderTop: '1px solid var(--border)',
      marginTop: '0.5rem',
    }}>
      {children}
    </div>
  )
}

function ScreenshotPanel({ runId, asin, files, onLightbox }) {
  const hero     = files.find(f => f === 'hero_viewport.png')
  const carousel = files.filter(f => /^carousel_\d+/.test(f)).sort()
  const scrolls  = files.filter(f => /^scroll_/.test(f)).sort()
  const aplus    = files.filter(f => /^aplus_\d+/.test(f)).sort()

  const scrollLabel = (f) => {
    const m = f.match(/scroll_(\d+)pct/)
    return m ? `${m[1]}% scroll` : f
  }

  return (
    <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

      {hero && <>
        <SectionLabel>Hero</SectionLabel>
        <img
          loading="lazy"
          src={imgUrl(runId, asin, hero)}
          alt="hero"
          onClick={() => onLightbox(imgUrl(runId, asin, hero))}
          style={{
            width: '100%', borderRadius: 6,
            border: '1px solid var(--border)',
            cursor: 'zoom-in',
            objectFit: 'contain',
            background: '#fff',
          }}
        />
      </>}

      {carousel.length > 0 && <>
        <SectionLabel>Carousel ({carousel.length})</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
          {carousel.map(f => (
            <div key={f} style={{ aspectRatio: '1', overflow: 'hidden' }}>
              <img
                loading="lazy"
                src={imgUrl(runId, asin, f)}
                alt={f}
                onClick={() => onLightbox(imgUrl(runId, asin, f))}
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'contain',
                  cursor: 'zoom-in',
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                  background: '#fff',
                }}
              />
            </div>
          ))}
        </div>
      </>}

      {scrolls.length > 0 && <>
        <SectionLabel>Page Scroll</SectionLabel>
        {scrolls.map(f => (
          <div key={f}>
            <div style={{ fontSize: '0.7em', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
              {scrollLabel(f)}
            </div>
            <img
              loading="lazy"
              src={imgUrl(runId, asin, f)}
              alt={f}
              onClick={() => onLightbox(imgUrl(runId, asin, f))}
              style={{
                width: '100%', borderRadius: 4,
                border: '1px solid var(--border)',
                cursor: 'zoom-in',
                objectFit: 'contain',
                background: '#fff',
              }}
            />
          </div>
        ))}
      </>}

      {aplus.length > 0 && <>
        <SectionLabel>A+ Content ({aplus.length})</SectionLabel>
        {aplus.map((f, i) => (
          <div key={f}>
            <div style={{ fontSize: '0.7em', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
              Module {i + 1}
            </div>
            <img
              loading="lazy"
              src={imgUrl(runId, asin, f)}
              alt={f}
              onClick={() => onLightbox(imgUrl(runId, asin, f))}
              style={{
                width: '100%', borderRadius: 4,
                border: '1px solid var(--border)',
                cursor: 'zoom-in',
                objectFit: 'contain',
                background: '#fff',
              }}
            />
          </div>
        ))}
      </>}

      {files.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.8em', paddingTop: '2rem', textAlign: 'center' }}>
          No screenshots captured for this ASIN.
        </div>
      )}
    </div>
  )
}

// ── Product data panel ────────────────────────────────────────────────────────

function DataRow({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.8em' }}>
      <div style={{ width: 120, flexShrink: 0, color: 'var(--text-muted)', paddingTop: 1 }}>{label}</div>
      <div style={{ flex: 1, color: 'var(--text-secondary)', wordBreak: 'break-word' }}>{children}</div>
    </div>
  )
}

function ProductDataPanel({ data }) {
  if (!data) {
    return (
      <div style={{ padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.8em', textAlign: 'center' }}>
        No structured data — Apify token not set or fetch failed.
      </div>
    )
  }

  const bullets       = safeArr(data.bullets).filter(b => typeof b === 'string')
  const attributes    = safeArr(data.attributes).filter(a => a && typeof a === 'object' && !Array.isArray(a))
  const overview      = safeArr(data.productOverview).filter(a => a && typeof a === 'object' && !Array.isArray(a))
  const bsrList       = safeArr(data.bestsellerRanks).filter(r => r !== null && r !== undefined)
  const description   = typeof data.description === 'string' ? data.description : null

  return (
    <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0', fontSize: '0.85em' }}>

      <SectionLabel>Overview</SectionLabel>
      {safeStr(data.title)   && <DataRow label="Title">{safeStr(data.title)}</DataRow>}
      {safeStr(data.brand)   && <DataRow label="Brand">{safeStr(data.brand)}</DataRow>}
      {safeStr(data.price)   && <DataRow label="Price">{safeStr(data.price)}</DataRow>}
      {data.stars != null && (
        <DataRow label="Rating">
          {safeStr(data.stars)} ★
          {data.reviewsCount != null && ` (${Number(data.reviewsCount).toLocaleString()} reviews)`}
        </DataRow>
      )}
      {data.inStock != null && (
        <DataRow label="In Stock">{data.inStock ? 'Yes' : 'No'}</DataRow>
      )}
      {safeStr(data.monthlyPurchaseVolume) && (
        <DataRow label="Monthly Sales">{safeStr(data.monthlyPurchaseVolume)}</DataRow>
      )}
      {safeStr(data.seller) && <DataRow label="Seller">{safeStr(data.seller)}</DataRow>}

      {bsrList.length > 0 && (
        <DataRow label="BSR">
          {bsrList.map((r, i) => (
            <div key={i}>
              {r !== null && typeof r === 'object'
                ? `#${safeStr(r.rank) ?? '?'} in ${safeStr(r.category) ?? '?'}`
                : String(r)}
            </div>
          ))}
        </DataRow>
      )}

      {bullets.length > 0 && <>
        <SectionLabel>Bullets ({bullets.length})</SectionLabel>
        {bullets.map((b, i) => (
          <div key={i} style={{
            display: 'flex', gap: '0.5rem',
            padding: '0.3rem 0',
            borderBottom: '1px solid var(--border)',
            fontSize: '0.8em',
            color: 'var(--text-secondary)',
          }}>
            <span style={{ color: 'var(--text-muted)', flexShrink: 0, width: 18, textAlign: 'right' }}>{i + 1}.</span>
            <span>{b}</span>
          </div>
        ))}
      </>}

      {attributes.length > 0 && <>
        <SectionLabel>Specs ({attributes.length})</SectionLabel>
        {attributes.map((a, i) => (
          <DataRow key={i} label={safeStr(a.name) || safeStr(a.label) || '—'}>
            {safeStr(a.value) || '—'}
          </DataRow>
        ))}
      </>}

      {overview.length > 0 && <>
        <SectionLabel>Product Overview ({overview.length})</SectionLabel>
        {overview.map((a, i) => (
          <DataRow key={i} label={safeStr(a.name) || safeStr(a.label) || '—'}>
            {safeStr(a.value) || '—'}
          </DataRow>
        ))}
      </>}

      {(safeArr(data.highResImages).length > 0 || safeArr(data.aplusImages).length > 0) && <>
        <SectionLabel>Images</SectionLabel>
        {safeArr(data.highResImages).length > 0 && (
          <DataRow label="High-res tiles">{safeArr(data.highResImages).length}</DataRow>
        )}
        {safeArr(data.aplusImages).length > 0 && (
          <DataRow label="A+ (Apify)">{safeArr(data.aplusImages).length}</DataRow>
        )}
      </>}

      {description && <>
        <SectionLabel>Description</SectionLabel>
        <div style={{ fontSize: '0.78em', color: 'var(--text-secondary)', lineHeight: 1.6, padding: '0.4rem 0' }}>
          {description.slice(0, 600)}{description.length > 600 ? '…' : ''}
        </div>
      </>}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function GapResultView({ runId, asins, asinProgress }) {
  const [selectedAsin, setSelectedAsin] = useState(null)
  const [captureData, setCaptureData] = useState(null)
  const [lightbox, setLightbox] = useState(null)

  // Auto-select first completed ASIN
  useEffect(() => {
    if (selectedAsin) return
    const first = asins.find(a => asinProgress?.[a.asin]?.status === 'complete')
    if (first) setSelectedAsin(first.asin)
  }, [asins, asinProgress, selectedAsin])

  // Fetch capture listing when selected ASIN changes
  useEffect(() => {
    setCaptureData(null)
    if (!runId || !selectedAsin) return
    fetch(`${API}/captures/${runId}/${selectedAsin}`)
      .then(r => r.json())
      .then(setCaptureData)
      .catch(() => {})
  }, [runId, selectedAsin])

  const files = safeArr(captureData?.files).filter(f => typeof f === 'string')

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ASIN list */}
      <div style={{
        width: 180, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
        padding: '0.5rem 0',
      }}>
        {asins.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75em', padding: '1rem', textAlign: 'center' }}>
            No ASINs in run
          </div>
        )}
        {asins.map(({ asin }) => {
          const p = asinProgress?.[asin]
          const isSelected = asin === selectedAsin
          const statusColor = p?.status === 'complete' ? 'var(--accent)'
            : p?.status === 'error' || p?.status === 'blocked' ? '#c05820'
            : 'var(--text-muted)'

          return (
            <button
              key={asin}
              onClick={() => setSelectedAsin(asin)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.45rem 0.75rem',
                border: 'none',
                borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                background: isSelected ? 'var(--bg-panel)' : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '0.75em',
                fontFamily: 'monospace',
                color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              {p?.status === 'complete' && <CheckCircle size={10} style={{ color: statusColor, flexShrink: 0 }} />}
              {(p?.status === 'error' || p?.status === 'blocked') && <AlertCircle size={10} style={{ color: statusColor, flexShrink: 0 }} />}
              {!p && <span style={{ width: 10 }} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asin}</span>
              {isSelected && <ChevronRight size={10} style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--accent)' }} />}
            </button>
          )
        })}
      </div>

      {/* Screenshots — center */}
      <div style={{ flex: 1, overflowY: 'auto', borderRight: '1px solid var(--border)' }}>
        {!selectedAsin ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8em', padding: '3rem 1rem', textAlign: 'center' }}>
            Select an ASIN to view captures
          </div>
        ) : (
          <ScreenshotPanel
            runId={runId}
            asin={selectedAsin}
            files={files}
            onLightbox={setLightbox}
          />
        )}
      </div>

      {/* Product data — right */}
      <div style={{ width: 360, flexShrink: 0, overflowY: 'auto' }}>
        {!selectedAsin ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8em', padding: '3rem 1rem', textAlign: 'center' }}>
            Select an ASIN
          </div>
        ) : (
          <ProductDataPanel data={captureData?.productData ?? null} />
        )}
      </div>

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
