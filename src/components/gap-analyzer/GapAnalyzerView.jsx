import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ScanSearch, Play, Square, AlertCircle, CheckCircle, Loader } from 'lucide-react'
import GapResultView from './GapResultView.jsx'
import GapDetailView from './GapDetailView.jsx'
import GapResultErrorBoundary from './GapResultErrorBoundary.jsx'
import PreRunView from './PreRunView.jsx'
import RunPlanSidebar from './RunPlanSidebar.jsx'
import { saveGapSession, loadLatestGapSession } from '../../hooks/useGapSessions.js'
import {
  loadActiveEngagement,
  loadPlans,
  plansToRunAsins,
  isPlanReady,
} from '../../hooks/usePlannedEngagement.js'

const API = '/api/gap-analyzer'

const LOG_COLORS = {
  info:  'var(--text-secondary)',
  warn:  '#e0a040',
  error: '#c05820',
}

function buildAsinsData(asinsList, progress) {
  return asinsList.map(a => ({
    asin: a.asin,
    url: a.url,
    status: progress[a.asin]?.status === 'complete' ? 'captured' : (progress[a.asin]?.status || 'error'),
    carouselCount: progress[a.asin]?.carouselCount ?? 0,
    aplusCount: progress[a.asin]?.aplusCount ?? 0,
  }))
}

function applySessionToState(session, {
  setRunId,
  setAsins,
  setAsinProgress,
  setRunStatus,
  setActiveTab,
  activeRunIdRef,
}) {
  const asinsArr = session.asins_data.map(a => ({ asin: a.asin, url: a.url }))
  const progress = {}
  for (const a of session.asins_data) {
    progress[a.asin] = {
      status: a.status === 'captured' ? 'complete' : a.status,
      carouselCount: a.carouselCount,
      aplusCount: a.aplusCount,
    }
  }
  activeRunIdRef.current = session.server_run_id
  setRunId(session.server_run_id)
  setAsins(asinsArr)
  setAsinProgress(progress)
  setRunStatus('complete')
  setActiveTab('results')
}

function manifestToSession(manifest) {
  return {
    server_run_id: manifest.runId,
    asins_data: manifest.asins.map(a => ({
      asin: a.asin,
      url: a.url,
      status: a.status,
      carouselCount: a.carouselCount ?? 0,
      aplusCount: a.aplusCount ?? 0,
    })),
  }
}

export default function GapAnalyzerView() {
  const [asins, setAsins] = useState([])
  const [runId, setRunId] = useState(null)
  const [runStatus, setRunStatus] = useState('idle') // idle | running | complete | stopped | error
  const [log, setLog] = useState([])
  const [asinProgress, setAsinProgress] = useState({}) // asin -> { status, carouselCount, aplusCount }
  const [plans, setPlans] = useState([])
  const [engagement, setEngagement] = useState(null)
  const [liveFiles, setLiveFiles] = useState([])
  const [activeTab, setActiveTab] = useState('prerun') // 'prerun' | 'run' | 'results'
  const [detailAsin, setDetailAsin] = useState(null) // ASIN open in full-page detail view
  const [saveNotice, setSaveNotice] = useState(null) // null | 'saved' | { error: string }
  const logEndRef = useRef(null)
  const eventSourceRef = useRef(null)
  const activeRunIdRef = useRef(null)
  const liveFilesRef = useRef([])
  const engagementRef = useRef(null)
  const asinsRef = useRef(asins)

  useEffect(() => {
    asinsRef.current = asins
  }, [asins])

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => eventSourceRef.current?.close()
  }, [])

  useEffect(() => {
    engagementRef.current = engagement
  }, [engagement])

  const persistCompletedRun = useCallback(async (serverRunId, progress) => {
    const asinsData = buildAsinsData(asinsRef.current, progress)
    const result = await saveGapSession(serverRunId, asinsData, {
      engagementId: engagementRef.current?.id,
      liveFiles: liveFilesRef.current,
    })
    if (result.ok) {
      setSaveNotice('saved')
    } else {
      setSaveNotice({ error: result.error || 'Failed to save session' })
    }
  }, [])

  const handlePlansChange = useCallback((nextPlans, eng) => {
    setPlans(nextPlans)
    setEngagement(eng ?? null)
    setAsins(plansToRunAsins(nextPlans))
  }, [])

  // Load plans + restore most recent completed run
  useEffect(() => {
    async function init() {
      const eng = await loadActiveEngagement()
      setEngagement(eng)
      const loadedPlans = eng ? await loadPlans(eng.id) : []
      setPlans(loadedPlans)
      setAsins(plansToRunAsins(loadedPlans))

      let session = await loadLatestGapSession()
      if (!session) {
        try {
          const res = await fetch(`${API}/runs`)
          if (res.ok) {
            const runs = await res.json()
            if (runs.length > 0) session = manifestToSession(runs[0])
          }
        } catch (err) {
          console.error('[gap_sessions] disk restore error:', err.message)
        }
      }
      if (session) {
        if (session.live_files?.length) {
          liveFilesRef.current = session.live_files
          setLiveFiles(session.live_files)
        }
        applySessionToState(session, {
          setRunId,
          setAsins,
          setAsinProgress,
          setRunStatus,
          setActiveTab,
          activeRunIdRef,
        })
      } else if (loadedPlans.length === 0) {
        setActiveTab('prerun')
      }
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const appendLog = useCallback((entry) => {
    setLog(prev => [...prev, entry])
  }, [])

  function connectStream(id) {
    eventSourceRef.current?.close()
    const es = new EventSource(`${API}/run/${id}/stream`)
    eventSourceRef.current = es

    es.onmessage = (e) => {
      const event = JSON.parse(e.data)
      handleEvent(event)
    }

    es.onerror = () => {
      es.close()
    }
  }

  function handleEvent(event) {
    switch (event.type) {
      case 'log':
        appendLog({ ts: new Date().toLocaleTimeString(), msg: event.msg, level: event.level || 'info' })
        break
      case 'asin_start':
        setAsinProgress(prev => ({ ...prev, [event.asin]: { status: 'running' } }))
        break
      case 'asin_complete':
        setAsinProgress(prev => ({
          ...prev,
          [event.asin]: { status: 'complete', carouselCount: event.carouselCount, aplusCount: event.aplusCount },
        }))
        break
      case 'asin_error':
        setAsinProgress(prev => ({ ...prev, [event.asin]: { status: 'error', error: event.error } }))
        break
      case 'asin_blocked':
        setAsinProgress(prev => ({ ...prev, [event.asin]: { status: 'blocked', error: event.reason } }))
        break
      case 'live_sync_complete': {
        liveFilesRef.current = event.liveFiles || []
        setLiveFiles(event.liveFiles || [])
        break
      }
      case 'run_status': {
        const nextStatus = event.status === 'complete' ? 'complete' : event.status === 'stopped' ? 'stopped' : 'error'
        setRunStatus(nextStatus)
        if (nextStatus === 'complete') {
          setActiveTab('results')
          setSaveNotice(null)
          const serverRunId = activeRunIdRef.current
          setAsinProgress(prev => {
            void persistCompletedRun(serverRunId, prev)
            return prev
          })
        }
        eventSourceRef.current?.close()
        break
      }
      default:
        break
    }
  }

  const runnableCount = plans.filter(isPlanReady).length

  async function handleRun() {
    if (!runnableCount || !asins.length || runStatus === 'running') return
    setRunStatus('running')
    setLog([])
    setAsinProgress({})
    setSaveNotice(null)

    try {
      const res = await fetch(`${API}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asins, engagementId: engagement?.id }),
      })
      const { runId: id, error } = await res.json()
      if (error) {
        appendLog({ ts: new Date().toLocaleTimeString(), msg: `Failed to start: ${error}`, level: 'error' })
        setRunStatus('error')
        return
      }
      activeRunIdRef.current = id
      setRunId(id)
      connectStream(id)
    } catch (err) {
      appendLog({ ts: new Date().toLocaleTimeString(), msg: `Network error: ${err.message}`, level: 'error' })
      setRunStatus('error')
    }
  }

  async function handleStop() {
    if (!runId || runStatus !== 'running') return
    try {
      await fetch(`${API}/run/${runId}/stop`, { method: 'POST' })
    } catch { /* ignore */ }
    setRunStatus('stopped')
    eventSourceRef.current?.close()
  }

  const statusDot = {
    idle:     { color: 'var(--border)',   label: 'Idle' },
    running:  { color: '#e0a040',         label: 'Running…', pulse: true },
    complete: { color: 'var(--accent)',   label: 'Complete' },
    stopped:  { color: 'var(--text-muted)', label: 'Stopped' },
    error:    { color: '#c05820',         label: 'Error' },
  }[runStatus] || { color: 'var(--border)', label: 'Idle' }

  // Full-page ASIN detail view — takes over the entire window
  if (activeTab === 'results' && detailAsin) {
    return (
      <GapResultErrorBoundary>
        <GapDetailView
          runId={runId}
          asin={detailAsin}
          onBack={() => setDetailAsin(null)}
        />
      </GapResultErrorBoundary>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', background: 'var(--bg-primary)' }}>

      {/* LEFT PANEL */}
      <div style={{
        width: 290,
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem 0.75rem',
        gap: '1rem',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <ScanSearch size={16} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 600, fontSize: '0.95em' }}>Gap Analyzer</span>
        </div>

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <RunPlanSidebar plans={plans} progress={asinProgress} />
        </div>

        {/* Run / Stop controls */}
        <div style={{ flexShrink: 0 }}>
          {runStatus !== 'running' ? (
            <button
              onClick={handleRun}
              disabled={!runnableCount}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                padding: '0.5rem',
                background: runnableCount ? 'var(--accent)' : 'var(--border)',
                color: runnableCount ? '#fff' : 'var(--text-muted)',
                border: 'none', borderRadius: 6,
                cursor: runnableCount ? 'pointer' : 'default',
                fontWeight: 600, fontSize: '0.85em',
              }}
            >
              <Play size={13} />
              Run Analysis
            </button>
          ) : null}
          {runStatus !== 'running' && !runnableCount && (
            <div style={{ fontSize: '0.68em', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: 1.4, textAlign: 'center' }}>
              Pre-Run needs URL + images per product
            </div>
          )}
          {runStatus === 'running' ? (
            <button
              onClick={handleStop}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                padding: '0.5rem',
                background: 'var(--stop-bg)',
                color: 'var(--stop-color)',
                border: '1px solid var(--stop-border)',
                borderRadius: 6, cursor: 'pointer',
                fontWeight: 600, fontSize: '0.85em',
              }}
            >
              <Square size={13} />
              Stop Run
            </button>
          ) : null}
        </div>
        </div>

      {/* RIGHT PANEL */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-center)' }}>

        {/* Tab bar */}
        <div style={{
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 1rem',
          gap: '0.1rem',
          background: 'var(--bg-secondary)',
        }}>
          {[
            { id: 'prerun', label: 'Pre-Run' },
            { id: 'run', label: 'Run' },
            { id: 'results', label: 'Results' },
          ].map(({ id: tab, label }) => {
            const isActive = activeTab === tab
            const isDisabled =
              (tab === 'run' && !plans.length) ||
              (tab === 'results' && runStatus !== 'complete' && runStatus !== 'stopped')
            return (
              <button
                key={tab}
                onClick={() => { if (!isDisabled) { setActiveTab(tab); if (tab !== 'results') setDetailAsin(null) } }}
                style={{
                  padding: '0.5rem 0.9rem',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  background: 'transparent',
                  color: isDisabled ? 'var(--text-muted)' : isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: isDisabled ? 'default' : 'pointer',
                  fontSize: '0.8em',
                  fontWeight: isActive ? 600 : 400,
                  marginBottom: -1,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {activeTab === 'prerun' && (
          <PreRunView onPlansChange={handlePlansChange} />
        )}

        {activeTab === 'run' && <>
          {/* ASIN status row — shown once run starts */}
          {Object.keys(asinProgress).length > 0 && (
            <div style={{
              flexShrink: 0,
              borderBottom: '1px solid var(--border)',
              padding: '0.5rem 1rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.4rem',
            }}>
              {asins.map(({ asin }) => {
                const p = asinProgress[asin]
                if (!p) return null
                const icon = p.status === 'complete' ? <CheckCircle size={10} style={{ color: 'var(--accent)' }} />
                  : p.status === 'running' ? <Loader size={10} style={{ color: '#e0a040' }} />
                  : p.status === 'error' || p.status === 'blocked' ? <AlertCircle size={10} style={{ color: '#c05820' }} />
                  : null
                return (
                  <div key={asin} style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: 4,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-panel)',
                    fontSize: '0.75em',
                    fontFamily: 'monospace',
                    color: p.status === 'error' || p.status === 'blocked' ? '#c05820' : 'var(--text-secondary)',
                  }}>
                    {icon}
                    {asin}
                    {p.status === 'complete' && (
                      <span style={{ color: 'var(--text-muted)' }}>
                        {p.carouselCount}img / {p.aplusCount}A+
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Live log */}
          <div style={{
            flex: 1, overflowY: 'auto',
            padding: '0.75rem 1.25rem',
            fontFamily: 'monospace',
            fontSize: '0.8em',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.18rem',
          }}>
            {log.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontFamily: 'inherit', marginTop: '3rem', textAlign: 'center', lineHeight: 2 }}>
                {plans.length
                  ? 'Hit Run Analysis to capture live Amazon pages for your plans.'
                  : 'Add plans in the Pre-Run tab, then run analysis here.'}
                <br />
                <span style={{ opacity: 0.6 }}>3–5 min per product · human-paced · headed Chromium</span>
              </div>
            )}
            {log.map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.75rem', color: LOG_COLORS[entry.level] || LOG_COLORS.info }}>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0, userSelect: 'none' }}>{entry.ts}</span>
                <span style={{ wordBreak: 'break-all' }}>{entry.msg}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>

          {/* Status bar */}
          <div style={{
            flexShrink: 0,
            borderTop: '1px solid var(--border)',
            padding: '0.4rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.75em',
            color: statusDot.color,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: statusDot.color,
              display: 'inline-block',
              animation: statusDot.pulse ? 'spin 1.2s ease-in-out infinite' : 'none',
            }} />
            {statusDot.label}
            {runId && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{runId}</span>}
          </div>
        </>}

        {activeTab === 'results' && (
          <GapResultErrorBoundary>
            {saveNotice && (
              <div style={{
                flexShrink: 0,
                padding: '0.4rem 1rem',
                borderBottom: '1px solid var(--border)',
                fontSize: '0.75em',
                color: saveNotice === 'saved' ? 'var(--accent)' : '#c05820',
                background: 'var(--bg-secondary)',
              }}>
                {saveNotice === 'saved'
                  ? 'Session saved'
                  : `Save failed: ${saveNotice.error}`}
              </div>
            )}
            <GapResultView
              runId={runId}
              asins={asins}
              asinProgress={asinProgress}
              liveFiles={liveFiles}
              onSelect={setDetailAsin}
            />
          </GapResultErrorBoundary>
        )}
      </div>
    </div>
  )
}
