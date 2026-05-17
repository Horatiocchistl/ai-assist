import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ScanSearch, Play, Square, AlertCircle, CheckCircle, Loader } from 'lucide-react'
import AsinManager from './AsinManager.jsx'

const API = '/api/gap-analyzer'

const LOG_COLORS = {
  info:  'var(--text-secondary)',
  warn:  '#e0a040',
  error: '#c05820',
}

export default function GapAnalyzerView() {
  const [asins, setAsins] = useState([])
  const [runId, setRunId] = useState(null)
  const [runStatus, setRunStatus] = useState('idle') // idle | running | complete | stopped | error
  const [log, setLog] = useState([])
  const [asinProgress, setAsinProgress] = useState({}) // asin -> { status, carouselCount, aplusCount }
  const logEndRef = useRef(null)
  const eventSourceRef = useRef(null)

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => eventSourceRef.current?.close()
  }, [])

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
      case 'run_status':
        setRunStatus(event.status === 'complete' ? 'complete' : event.status === 'stopped' ? 'stopped' : 'error')
        eventSourceRef.current?.close()
        break
      default:
        break
    }
  }

  async function handleRun() {
    if (!asins.length || runStatus === 'running') return
    setRunStatus('running')
    setLog([])
    setAsinProgress({})

    try {
      const res = await fetch(`${API}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asins }),
      })
      const { runId: id, error } = await res.json()
      if (error) {
        appendLog({ ts: new Date().toLocaleTimeString(), msg: `Failed to start: ${error}`, level: 'error' })
        setRunStatus('error')
        return
      }
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
          <AsinManager
            asins={asins}
            onAdd={items => setAsins(prev => [...prev, ...items])}
            onRemove={asin => setAsins(prev => prev.filter(a => a.asin !== asin))}
            progress={asinProgress}
            disabled={runStatus === 'running'}
          />
        </div>

        {/* Run / Stop controls */}
        <div style={{ flexShrink: 0 }}>
          {runStatus !== 'running' ? (
            <button
              onClick={handleRun}
              disabled={!asins.length}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                padding: '0.5rem',
                background: asins.length ? 'var(--accent)' : 'var(--border)',
                color: asins.length ? '#fff' : 'var(--text-muted)',
                border: 'none', borderRadius: 6,
                cursor: asins.length ? 'pointer' : 'default',
                fontWeight: 600, fontSize: '0.85em',
              }}
            >
              <Play size={13} />
              Run Analysis
            </button>
          ) : (
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
          )}
        </div>
      </div>

      {/* RIGHT PANEL — log + ASIN status cards */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-center)' }}>

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
              Add ASINs and hit Run Analysis to begin.
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
      </div>
    </div>
  )
}
