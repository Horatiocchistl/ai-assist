import React, { useState, useEffect } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { getAsinLiveFiles } from '../../hooks/useGapSessions.js'
import { getLiveSignedUrl } from '../../hooks/usePlannedEngagement.js'

const IMAGE_RE = /\.(png|jpe?g|webp)$/i

function safeStr(v) {
  if (v == null) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try { return JSON.stringify(v) } catch { return null }
}

function safeArr(v) {
  return Array.isArray(v) ? v.filter(x => x != null) : []
}

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

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: '0.68em', fontWeight: 700, letterSpacing: '0.07em',
      textTransform: 'uppercase', color: 'var(--text-muted)',
      padding: '0.6rem 0 0.3rem',
      borderTop: '1px solid var(--border)',
      marginTop: '0.5rem',
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

  const clickableImg = (filename, extra = {}) => {
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

  const scrollLabel = (f) => {
    const m = f.match(/scroll_(\d+)pct/)
    return m ? `${m[1]}% scroll` : f
  }

  return (
    <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

      {hero && <>
        <SectionLabel>Hero</SectionLabel>
        {clickableImg(hero, { width: '100%', borderRadius: 6 })}
      </>}

      {carousel.length > 0 && <>
        <SectionLabel>Carousel ({carousel.length})</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
          {carousel.map(f => (
            <div key={f} style={{ aspectRatio: '1', overflow: 'hidden' }}>
              {clickableImg(f, { width: '100%', height: '100%', objectFit: 'contain' })}
            </div>
          ))}
        </div>
      </>}

      {scrolls.length > 0 && <>
        <SectionLabel>Page Scroll</SectionLabel>
        {scrolls.map(f => (
          <div key={f}>
            <div style={{ fontSize: '0.68em', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              {scrollLabel(f)}
            </div>
            {clickableImg(f, { width: '100%' })}
          </div>
        ))}
      </>}

      {aplus.length > 0 && <>
        <SectionLabel>A+ Content ({aplus.length})</SectionLabel>
        {aplus.map((f, i) => (
          <div key={f}>
            <div style={{ fontSize: '0.68em', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              Module {i + 1}
            </div>
            {clickableImg(f, { width: '100%' })}
          </div>
        ))}
      </>}

      {filenames.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.8em', paddingTop: '2rem', textAlign: 'center' }}>
          No screenshots in Supabase for this ASIN.
        </div>
      )}
    </div>
  )
}

function DataRow({ label, children }) {
  return (
    <div style={{
      display: 'flex', gap: '0.5rem',
      padding: '0.35rem 0',
      borderBottom: '1px solid var(--border)',
      fontSize: '0.82em',
    }}>
      <div style={{ width: 130, flexShrink: 0, color: 'var(--text-muted)', paddingTop: 1 }}>{label}</div>
      <div style={{ flex: 1, color: 'var(--text-secondary)', wordBreak: 'break-word' }}>{children}</div>
    </div>
  )
}

function ProductDataPanel({ data, onLightbox }) {
  if (!data) {
    return (
      <div style={{ padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.8em', textAlign: 'center' }}>
        No structured data — Apify token not set or fetch failed.
      </div>
    )
  }

  const bullets    = safeArr(data.bullets).filter(b => typeof b === 'string')
  const attributes = safeArr(data.attributes).filter(a => a && typeof a === 'object' && !Array.isArray(a))
  const overview   = safeArr(data.productOverview).filter(a => a && typeof a === 'object' && !Array.isArray(a))
  const bsrList    = safeArr(data.bestsellerRanks).filter(r => r != null)
  const description = typeof data.description === 'string' ? data.description : null

  return (
    <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0' }}>
      <SectionLabel>Overview</SectionLabel>
      {safeStr(data.title)  && <DataRow label="Title">{safeStr(data.title)}</DataRow>}
      {safeStr(data.brand)  && <DataRow label="Brand">{safeStr(data.brand)}</DataRow>}
      {safeStr(data.price)  && <DataRow label="Price">{safeStr(data.price)}</DataRow>}
      {data.stars != null   && (
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
            padding: '0.35rem 0',
            borderBottom: '1px solid var(--border)',
            fontSize: '0.82em',
            color: 'var(--text-secondary)',
          }}>
            <span style={{ color: 'var(--text-muted)', flexShrink: 0, width: 20, textAlign: 'right' }}>{i + 1}.</span>
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

      {safeArr(data.highResImages).length > 0 && <>
        <SectionLabel>High-Res Images ({safeArr(data.highResImages).length})</SectionLabel>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '0.4rem',
          padding: '0.5rem 0'
        }}>
          {safeArr(data.highResImages).map((url, i) => (
            <div key={i} style={{ aspectRatio: '1', overflow: 'hidden', cursor: 'zoom-in' }}>
              <img
                src={url}
                alt={`High-res ${i + 1}`}
                onClick={() => onLightbox(url)}
                loading="lazy"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                }}
              />
            </div>
          ))}
        </div>
      </>}

      {safeArr(data.aplusImages).length > 0 && <>
        <SectionLabel>A+ Content Images ({safeArr(data.aplusImages).length})</SectionLabel>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '0.4rem',
          padding: '0.5rem 0'
        }}>
          {safeArr(data.aplusImages).map((img, i) => {
            const url = typeof img === 'string' ? img : img?.url
            if (!url) return null
            return (
              <div key={i} style={{ aspectRatio: '1', overflow: 'hidden', cursor: 'zoom-in' }}>
                <img
                  src={url}
                  alt={`A+ ${i + 1}`}
                  onClick={() => onLightbox(url)}
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                  }}
                />
              </div>
            )
          })}
        </div>
      </>}

      {description && <>
        <SectionLabel>Description</SectionLabel>
        <div style={{ fontSize: '0.78em', color: 'var(--text-secondary)', lineHeight: 1.65, padding: '0.4rem 0' }}>
          {description.slice(0, 600)}{description.length > 600 ? '…' : ''}
        </div>
      </>}
    </div>
  )
}

export default function GapDetailView({ asin, liveFiles = [], onBack, onViewComparison, onViewLlmAnalysis }) {
  const [imageUrls, setImageUrls] = useState({})
  const [productData, setProductData] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [loading, setLoading] = useState(true)

  // Determine if this ASIN has been analyzed (for showing LLM Analysis CTA)
  // For now, always false until Phase 2 implements actual analysis tracking
  const analyzed = false // TODO: Phase 2 - check if LLM analysis has run for this ASIN

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const files = getAsinLiveFiles(liveFiles, asin)
      const urls = {}
      let pd = null

      for (const f of files) {
        if (!f.path) continue
        if (IMAGE_RE.test(f.filename)) {
          const signed = await getLiveSignedUrl(f.path)
          if (signed) urls[f.filename] = signed
        } else if (f.filename === 'product-data.json') {
          const signed = await getLiveSignedUrl(f.path)
          if (signed) {
            try {
              const res = await fetch(signed)
              if (res.ok) pd = await res.json()
            } catch { /* skip */ }
          }
        }
      }

      if (!cancelled) {
        setImageUrls(urls)
        setProductData(pd)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [asin, liveFiles])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', background: 'var(--bg-primary)' }}>

      <div style={{
        flexShrink: 0,
        height: 44,
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0 1.25rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
      }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            border: 'none', background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer', fontSize: '0.8em', padding: '0.2rem 0.4rem',
            borderRadius: 4,
          }}
        >
          <ArrowLeft size={14} />
          Results
        </button>
        <span style={{ color: 'var(--border)' }}>/</span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.85em', fontWeight: 600, color: 'var(--text-primary)' }}>
          {asin}
        </span>
        {loading && (
          <span style={{ fontSize: '0.75em', color: 'var(--text-muted)', marginLeft: 'auto' }}>Loading…</span>
        )}
        {!loading && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => onViewComparison?.(asin)}
              style={{
                padding: '0.35rem 0.65rem',
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--bg-panel)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.75em',
                fontWeight: 500,
              }}
            >
              View Comparison
            </button>
            {analyzed && (
              <button
                onClick={() => onViewLlmAnalysis?.(asin)}
                style={{
                  padding: '0.35rem 0.65rem',
                  border: 'none',
                  borderRadius: 6,
                  background: 'var(--accent)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.75em',
                  fontWeight: 600,
                }}
              >
                View LLM Analysis
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: '0 0 58%', overflowY: 'auto', borderRight: '1px solid var(--border)' }}>
          <ScreenshotPanel imageUrls={imageUrls} onLightbox={setLightbox} />
        </div>
        <div style={{ flex: '0 0 42%', overflowY: 'auto' }}>
          <ProductDataPanel data={productData} onLightbox={setLightbox} />
        </div>
      </div>

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
