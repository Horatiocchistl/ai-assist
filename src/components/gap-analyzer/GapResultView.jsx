import React, { useState, useEffect, useMemo, useRef } from 'react'
import { CheckCircle, AlertCircle, Loader, Search } from 'lucide-react'
import { firstLiveImagePath, getAsinLiveFiles } from '../../hooks/useGapSessions.js'
import { getLiveSignedUrl, getSignedUrl, sortPlanImages } from '../../hooks/usePlannedEngagement.js'
import supabase from '../../lib/supabase.js'
import { getGapApiBase } from '../../lib/gapApi.js'

const SUB_FILTERS = [
  { id: 'all', label: 'All Results' },
  { id: 'not_analyzed', label: 'Not Analyzed' },
  { id: 'analyzed', label: 'Analyzed' },
]

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

function AsinCard({ asin, plan, asinProgress, liveFiles, thumbUrl, onSelect, analyzed,
                    selectionMode, selected, onToggle, analyzing,
                    statusMsg, liveGapCount, findingCount }) {
  const p = progressForAsin(asinProgress, asin, liveFiles)
  const hasCaptureData = p?.status === 'complete' || p?.status === 'captured'

  function handleClick() {
    if (selectionMode) {
      if (!analyzed) onToggle?.(asin)
    } else {
      if (hasCaptureData) onSelect?.(asin)
    }
  }

  const borderColor = analyzing ? 'var(--accent)' : selected ? '#6b21a8' : 'var(--border)'
  const borderWidth = analyzing || selected ? '2px' : '1px'

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: `${borderWidth} solid ${borderColor}`,
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--bg-panel)',
        cursor: (selectionMode && !analyzed) || hasCaptureData ? 'pointer' : 'default',
        textAlign: 'left',
        padding: 0,
        width: '100%',
        opacity: (p?.status === 'error' || p?.status === 'blocked') ? 0.55 : 1,
        position: 'relative',
      }}
    >
      {/* Eyebrow status label */}
      <div style={{
        padding: '0.35rem 0.5rem',
        fontSize: '0.65em',
        fontWeight: 600,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        background: analyzing ? 'var(--accent)' : analyzed ? 'var(--accent)' : 'var(--bg-secondary)',
        color: analyzing || analyzed ? '#fff' : 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.35rem',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          {analyzing && <Loader size={9} style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }} />}
          {analyzing ? 'Analyzing…' : analyzed ? 'Analyzed' : 'Not Analyzed'}
        </span>
        {selectionMode && !analyzed && !analyzing && (
          <span style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            border: '2px solid',
            borderColor: selected ? '#6b21a8' : 'var(--text-muted)',
            background: selected ? '#6b21a8' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {selected && (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        )}
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

        {/* Live step message while analyzing */}
        {analyzing && statusMsg && (
          <div style={{
            fontFamily: 'monospace',
            fontSize: '0.62em',
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {statusMsg}
          </div>
        )}

        {/* Finding count line */}
        {analyzed && findingCount != null && (
          <div style={{ fontSize: '0.7em', color: 'var(--text-muted)' }}>
            {findingCount} finding{findingCount !== 1 ? 's' : ''}
          </div>
        )}

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
              {analyzing && liveGapCount > 0
                ? <span style={{ color: '#e0a040' }}>{liveGapCount} finding{liveGapCount !== 1 ? 's' : ''} so far</span>
                : <span>{formatMeta(plan, asinProgress, asin, liveFiles) || (hasCaptureData ? '' : 'Queued')}</span>
              }
            </>
          )}
        </div>
      </div>
    </button>
  )
}

export default function GapResultView({
  runId,
  engagementId,
  plans = [],
  asinProgress = {},
  liveFiles = [],
  onSelect,
  onAnalyzeAsin,
}) {
  const [subFilter, setSubFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [thumbUrls, setThumbUrls] = useState({})
  const [analyzedAsins, setAnalyzedAsins] = useState(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedAsins, setSelectedAsins] = useState(new Set())
  const [analyzingAsins, setAnalyzingAsins] = useState(new Set())
  const [asinStatus, setAsinStatus] = useState({})          // live step message per asin
  const [asinGapCounts, setAsinGapCounts] = useState({})    // live gap count per asin during analysis
  const [asinFindingCounts, setAsinFindingCounts] = useState({}) // final count per asin after done
  const abortRefs = useRef({})

  const allItems = useMemo(() => buildAllItems(plans, liveFiles), [plans, liveFiles])

  // Load analyzed state from gaps table
  useEffect(() => {
    if (!runId) return
    supabase
      .from('gaps')
      .select('asin')
      .eq('run_id', runId)
      .then(({ data }) => {
        if (data?.length) {
          setAnalyzedAsins(new Set(data.map(r => r.asin)))
        }
      })
  }, [runId])

  const searchLower = search.trim().toLowerCase()

  const filteredItems = useMemo(() => {
    let items = allItems
    if (searchLower) {
      items = items.filter(({ asin }) => asin.toLowerCase().includes(searchLower))
    }
    if (subFilter === 'not_analyzed') {
      items = items.filter(({ asin }) => !analyzedAsins.has(asin))
    } else if (subFilter === 'analyzed') {
      items = items.filter(({ asin }) => analyzedAsins.has(asin))
    }
    return items
  }, [allItems, searchLower, subFilter, analyzedAsins])

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

  function toggleAsinSelection(asin) {
    setSelectedAsins(prev => {
      const next = new Set(prev)
      if (next.has(asin)) next.delete(asin)
      else next.add(asin)
      return next
    })
  }

  function handleAgentAnalysisClick() {
    if (!selectionMode) {
      setSelectionMode(true)
      setSelectedAsins(new Set())
      return
    }
    if (selectedAsins.size === 0) {
      setSelectionMode(false)
      return
    }
    // Trigger analysis for selected ASINs
    runAnalysis([...selectedAsins])
    setSelectionMode(false)
    setSelectedAsins(new Set())
  }

  function runAnalysis(asins) {
    for (const asin of asins) {
      setAnalyzingAsins(prev => new Set([...prev, asin]))
      const controller = new AbortController()
      abortRefs.current[asin] = controller

      fetch(`${getGapApiBase()}/run/${runId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asin, engagementId }),
        signal: controller.signal,
      }).then(async res => {
        const reader = res.body?.getReader()
        if (!reader) return
        const dec = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const parts = buf.split('\n\n')
          buf = parts.pop()
          for (const part of parts) {
            const dataLine = part.match(/^data: (.+)/m)
            if (!dataLine) continue
            try {
              const obj = JSON.parse(dataLine[1])
              if (obj.type === 'llm_progress' && obj.msg) {
                setAsinStatus(prev => ({ ...prev, [asin]: obj.msg }))
              } else if (obj.type === 'llm_gap') {
                setAsinGapCounts(prev => ({ ...prev, [asin]: (prev[asin] || 0) + 1 }))
              } else if (obj.type === 'llm_complete') {
                setAsinFindingCounts(prev => ({ ...prev, [asin]: obj.count ?? asinGapCounts[asin] ?? 0 }))
              }
            } catch { /* malformed line */ }
          }
        }
      }).catch(() => {/* aborted or network error */}).finally(() => {
        setAnalyzingAsins(prev => {
          const next = new Set(prev)
          next.delete(asin)
          return next
        })
        setAsinStatus(prev => { const n = { ...prev }; delete n[asin]; return n })
        setAnalyzedAsins(prev => new Set([...prev, asin]))
        if (onAnalyzeAsin) onAnalyzeAsin(asin)
        delete abortRefs.current[asin]
      })
    }
  }

  const anySelected = selectedAsins.size > 0
  const buttonLabel = selectionMode
    ? anySelected ? 'Ready to Analyze' : 'Cancel'
    : 'Agent Analysis'
  const buttonStyle = {
    padding: '0.45rem 0.85rem',
    border: 'none',
    borderRadius: 6,
    fontWeight: 600,
    fontSize: '0.82em',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    background: selectionMode && anySelected ? '#6b21a8' : 'var(--accent)',
    color: '#fff',
  }

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
        analyzed={analyzedAsins.has(asin)}
        selectionMode={selectionMode}
        selected={selectedAsins.has(asin)}
        onToggle={toggleAsinSelection}
        analyzing={analyzingAsins.has(asin)}
        statusMsg={asinStatus[asin]}
        liveGapCount={asinGapCounts[asin] || 0}
        findingCount={asinFindingCounts[asin]}
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

      {/* Search bar + Agent Analysis button */}
      <div style={{
        flexShrink: 0,
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}>
        <div style={{
          flex: 1,
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
        <button
          type="button"
          onClick={handleAgentAnalysisClick}
          disabled={!runId || !engagementId}
          style={buttonStyle}
        >
          {buttonLabel}
        </button>
      </div>

      {selectionMode && (
        <div style={{
          flexShrink: 0,
          padding: '0.4rem 1rem',
          background: 'rgba(107,33,168,0.08)',
          borderBottom: '1px solid var(--border)',
          fontSize: '0.75em',
          color: 'var(--text-muted)',
        }}>
          {anySelected
            ? `${selectedAsins.size} ASIN${selectedAsins.size > 1 ? 's' : ''} selected — click "Ready to Analyze" to run`
            : 'Select ASINs to analyze'}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
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
