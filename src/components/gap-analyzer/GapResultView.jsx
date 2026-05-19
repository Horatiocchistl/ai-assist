import React, { useState, useEffect, useMemo } from 'react'
import { CheckCircle, AlertCircle, Loader, Search } from 'lucide-react'
import { firstLiveImagePath, getAsinLiveFiles } from '../../hooks/useGapSessions.js'
import { getLiveSignedUrl, getSignedUrl, sortPlanImages } from '../../hooks/usePlannedEngagement.js'

const SUB_FILTERS = [
  { id: 'all', label: 'All Results' },
  { id: 'not_analyzed', label: 'Not Analyzed' },
  { id: 'analyzed', label: 'Analyzed' },
]

/** Run capture finished — progress row and/or live-captures storage for this ASIN. */
function progressForAsin(asinProgress, asin, liveFiles) {
  const p = asinProgress?.[asin]
  if (p?.status === 'complete' || p?.status === 'captured') return p

  const files = getAsinLiveFiles(liveFiles, asin)
  if (!files.length) return p

  let carouselCount = 0
  let aplusCount = 0
  for (const f of files) {
    const name = f.filename || ''
    if (/^carousel_\d+/i.test(name)) carouselCount++
    else if (/^aplus_\d+/i.test(name)) aplusCount++
  }
  return { status: 'complete', carouselCount, aplusCount }
}

function isAnalyzed(asinProgress, asin, liveFiles) {
  // TODO: Phase 2 - return true only if AI/LLM analysis has run for this ASIN
  // "Analyzed" means AI compared Pre-Run baseline vs live captures and generated findings
  // For now, nothing is analyzed until Agent Analysis button feature is hooked up
  return false
}

function buildAllItems(plans, liveFiles) {
  const byAsin = new Map()
  for (const p of plans || []) {
    if (p?.asin) byAsin.set(p.asin, { asin: p.asin, plan: p })
  }
  for (const entry of liveFiles || []) {
    if (!entry?.asin) continue
    if (!byAsin.has(entry.asin)) {
      byAsin.set(entry.asin, { asin: entry.asin, plan: null })
    }
  }
  return Array.from(byAsin.values())
}

function formatMeta(plan, asinProgress, asin, liveFiles) {
  const p = progressForAsin(asinProgress, asin, liveFiles)
  if (p?.status === 'complete' || p?.status === 'captured') {
    return `${p.carouselCount ?? 0} img - ${p.aplusCount ?? 0} A+`
  }
  const n = (plan?.images || []).length
  return n > 0 ? `${n} img` : ''
}

function AsinCard({ asin, plan, asinProgress, liveFiles, thumbUrl, onSelect }) {
  const p = progressForAsin(asinProgress, asin, liveFiles)
  const analyzed = isAnalyzed(asinProgress, asin, liveFiles)
  const hasCaptureData = p?.status === 'complete' || p?.status === 'captured'

  return (
    <button
      type="button"
      onClick={() => hasCaptureData && onSelect?.(asin)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--bg-panel)',
        cursor: hasCaptureData ? 'pointer' : 'default',
        textAlign: 'left',
        padding: 0,
        width: '100%',
        opacity: (p?.status === 'error' || p?.status === 'blocked') ? 0.55 : 1,
      }}
    >
      {/* Eyebrow status label */}
      <div style={{
        padding: '0.35rem 0.5rem',
        fontSize: '0.65em',
        fontWeight: 600,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        background: analyzed ? 'var(--accent)' : 'var(--bg-secondary)',
        color: analyzed ? '#fff' : 'var(--text-muted)',
      }}>
        {analyzed ? 'Analyzed' : 'Not Analyzed'}
      </div>
      <div style={{
        width: '100%',
        aspectRatio: '4/3',
        background: '#f5f5f5',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {thumbUrl ? (
          <img
            loading="lazy"
            src={thumbUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <span style={{ fontSize: '0.7em', color: 'var(--text-muted)' }}>
            {p?.status === 'running' ? 'Capturing…' : hasCaptureData ? 'No preview' : 'No image'}
          </span>
        )}
      </div>
      <div style={{
        padding: '0.5rem 0.65rem',
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.2rem',
      }}>
        <div style={{ fontFamily: 'monospace', fontSize: '0.8em', fontWeight: 700, color: 'var(--text-primary)' }}>
          {asin}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7em', color: 'var(--text-muted)' }}>
          {p?.status === 'running' && (
            <>
              <Loader size={10} style={{ color: '#e0a040', flexShrink: 0 }} />
              <span style={{ color: '#e0a040' }}>Capturing…</span>
            </>
          )}
          {(p?.status === 'error' || p?.status === 'blocked') && (
            <>
              <AlertCircle size={10} style={{ color: '#c05820', flexShrink: 0 }} />
              <span style={{ color: '#c05820' }}>{p.status}</span>
            </>
          )}
          {p?.status !== 'running' && p?.status !== 'error' && p?.status !== 'blocked' && (
            <>
              {(hasCaptureData || (plan?.images || []).length > 0) && (
                <CheckCircle size={10} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              )}
              <span>{formatMeta(plan, asinProgress, asin, liveFiles) || (hasCaptureData ? '' : 'Queued')}</span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

export default function GapResultView({
  plans = [],
  asinProgress = {},
  liveFiles = [],
  onSelect,
}) {
  const [subFilter, setSubFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [thumbUrls, setThumbUrls] = useState({})

  const allItems = useMemo(() => buildAllItems(plans, liveFiles), [plans, liveFiles])

  const searchLower = search.trim().toLowerCase()

  const filteredItems = useMemo(() => {
    let items = allItems

    // Apply search filter
    if (searchLower) {
      items = items.filter(({ asin }) => asin.toLowerCase().includes(searchLower))
    }

    // Apply sub-filter
    if (subFilter === 'not_analyzed') {
      items = items.filter(({ asin }) => !isAnalyzed(asinProgress, asin, liveFiles))
    } else if (subFilter === 'analyzed') {
      items = items.filter(({ asin }) => isAnalyzed(asinProgress, asin, liveFiles))
    }

    return items
  }, [allItems, searchLower, subFilter, asinProgress, liveFiles])

  useEffect(() => {
    let cancelled = false
    async function loadThumbs() {
      const urls = {}
      for (const { asin, plan } of allItems) {
        const p = progressForAsin(asinProgress, asin, liveFiles)
        const hasCaptureData = p?.status === 'complete' || p?.status === 'captured'
        
        if (hasCaptureData) {
          const storagePath = firstLiveImagePath(liveFiles, asin)
          if (storagePath) {
            const signed = await getLiveSignedUrl(storagePath)
            if (signed) urls[asin] = signed
          }
        } else {
          const images = sortPlanImages(plan?.images || [])
          if (images[0]?.path) {
            const signed = await getSignedUrl(images[0].path)
            if (signed) urls[asin] = signed
          }
        }
      }
      if (!cancelled) setThumbUrls(urls)
    }
    loadThumbs()
    return () => { cancelled = true }
  }, [allItems, asinProgress, liveFiles])

  function renderCard({ asin, plan }) {
    return (
      <AsinCard
        key={asin}
        asin={asin}
        plan={plan}
        asinProgress={asinProgress}
        liveFiles={liveFiles}
        thumbUrl={thumbUrls[asin]}
        onSelect={onSelect}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Sub-filters */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.6rem 1rem',
        borderBottom: '1px solid var(--border)',
      }}>
        {SUB_FILTERS.map(({ id, label }) => {
          const active = subFilter === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSubFilter(id)}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '0.82em',
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--accent)' : 'var(--text-primary)',
                padding: 0,
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Search bar */}
      <div style={{
        flexShrink: 0,
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '0.3rem 0.6rem',
        }}>
          <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ASINs…"
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: '0.82em',
              color: 'var(--text-primary)',
              width: '100%',
            }}
          />
        </div>
      </div>

      {/* Agent Analysis button */}
      <div style={{
        flexShrink: 0,
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}>
        <button
          type="button"
          style={{
            padding: '0.45rem 0.85rem',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: '0.82em',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Agent Analysis
        </button>
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem',
      }}>
        {filteredItems.length === 0 && allItems.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8em', textAlign: 'center', paddingTop: '2rem' }}>
            No results yet
          </div>
        )}
        {filteredItems.length === 0 && allItems.length > 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8em', textAlign: 'center', paddingTop: '2rem' }}>
            No matching ASINs
          </div>
        )}
        {filteredItems.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '0.65rem',
          }}>
            {filteredItems.map(renderCard)}
          </div>
        )}
      </div>
    </div>
  )
}
