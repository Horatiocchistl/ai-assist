import React, { useState } from 'react'
import { ScanSearch, Play, Square } from 'lucide-react'
import AsinManager from './AsinManager.jsx'

const STATUS_COLORS = {
  pending:  'var(--text-muted)',
  running:  '#e0a040',
  complete: 'var(--accent)',
  error:    '#c05820',
}

export default function GapAnalyzerView() {
  const [asins, setAsins] = useState([])
  const [runStatus, setRunStatus] = useState('idle') // idle | running | complete | error
  const [log, setLog] = useState([])

  function handleAdd(items) {
    setAsins(prev => [...prev, ...items])
  }

  function handleRemove(asin) {
    setAsins(prev => prev.filter(a => a.asin !== asin))
  }

  function appendLog(msg) {
    setLog(prev => [...prev, { ts: new Date().toLocaleTimeString(), msg }])
  }

  async function handleRun() {
    if (!asins.length || runStatus === 'running') return
    setRunStatus('running')
    setLog([])
    appendLog(`Starting run — ${asins.length} ASIN${asins.length > 1 ? 's' : ''} queued`)
    // Orchestrator integration wired here in the next phase
  }

  function handleStop() {
    if (runStatus !== 'running') return
    setRunStatus('idle')
    appendLog('Run stopped by user')
  }

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      width: '100%',
      overflow: 'hidden',
      background: 'var(--bg-primary)',
    }}>
      {/* LEFT PANEL — ASIN management */}
      <div style={{
        width: 280,
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
          <AsinManager asins={asins} onAdd={handleAdd} onRemove={handleRemove} />
        </div>

        {/* Run controls */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {runStatus !== 'running' ? (
            <button
              onClick={handleRun}
              disabled={!asins.length}
              style={{
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

      {/* RIGHT PANEL — live log + results */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-center)',
      }}>
        {/* Run log */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem 1.25rem',
          fontFamily: 'monospace',
          fontSize: '0.8em',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.2rem',
        }}>
          {log.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontFamily: 'inherit', marginTop: '2rem', textAlign: 'center' }}>
              Add ASINs and hit Run Analysis to begin.
              <br />
              <span style={{ fontSize: '0.9em', opacity: 0.7 }}>3–5 minutes per product · human-paced</span>
            </div>
          )}
          {log.map((entry, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.75rem', color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{entry.ts}</span>
              <span>{entry.msg}</span>
            </div>
          ))}
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
          color: STATUS_COLORS[runStatus] || 'var(--text-muted)',
        }}>
          {runStatus === 'running' && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e0a040', animation: 'spin 1s linear infinite', display: 'inline-block' }} />
          )}
          {runStatus === 'idle' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--border)', display: 'inline-block' }} />}
          {runStatus === 'complete' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />}
          {runStatus === 'idle' ? 'Idle' : runStatus === 'running' ? 'Running…' : runStatus === 'complete' ? 'Complete' : 'Error'}
        </div>
      </div>
    </div>
  )
}
