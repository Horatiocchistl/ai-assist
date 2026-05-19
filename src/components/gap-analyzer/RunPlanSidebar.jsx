import React from 'react'
import { CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { isPlanReady } from '../../hooks/usePlannedEngagement.js'

export default function RunPlanSidebar({ plans = [], liveFiles = [], progress = {} }) {
  const captureAsins = (liveFiles || [])
    .filter(e => e.asin && (e.files || []).length > 0)
    .map(e => e.asin)

  if (!plans.length && !captureAsins.length) {
    return (
      <div style={{ fontSize: '0.78em', color: 'var(--text-muted)', lineHeight: 1.6, padding: '0.25rem 0' }}>
        No products ready. In Pre-Run, add an Amazon URL and upload planned images (or import a folder with both).
      </div>
    )
  }

  if (!plans.length && captureAsins.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <div style={{
          fontSize: '0.7em', fontWeight: 600, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem',
        }}>
          LIVE CAPTURES ({captureAsins.length})
        </div>
        {captureAsins.map(asin => {
          const prog = progress[asin]
          const icon = prog?.status === 'complete' ? <CheckCircle size={10} style={{ color: 'var(--accent)' }} />
            : prog?.status === 'running' ? <Loader size={10} style={{ color: '#e0a040' }} />
            : prog?.status === 'error' || prog?.status === 'blocked' ? <AlertCircle size={10} style={{ color: '#c05820' }} />
            : <CheckCircle size={10} style={{ color: 'var(--accent)' }} />
          return (
            <div key={asin} style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.35rem 0.45rem', borderRadius: 4,
              border: '1px solid var(--border)', background: 'var(--bg-panel)',
              fontSize: '0.75em', fontFamily: 'monospace',
            }}>
              {icon}
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{asin}</span>
              {prog?.status === 'complete' && (
                <span style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                  {prog.carouselCount ?? 0}img / {prog.aplusCount ?? 0}A+
                </span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <div style={{
        fontSize: '0.7em', fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem',
      }}>
        QUEUED FROM PLANS ({plans.length})
      </div>
      {plans.map(p => {
        const prog = progress[p.asin]
        const icon = prog?.status === 'complete' ? <CheckCircle size={10} style={{ color: 'var(--accent)' }} />
          : prog?.status === 'running' ? <Loader size={10} style={{ color: '#e0a040' }} />
          : prog?.status === 'error' || prog?.status === 'blocked' ? <AlertCircle size={10} style={{ color: '#c05820' }} />
          : isPlanReady(p) ? <CheckCircle size={10} style={{ color: 'var(--accent)' }} />
          : null
        const imgCount = (p.images || []).length
        return (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.35rem 0.45rem', borderRadius: 4,
            border: '1px solid var(--border)', background: 'var(--bg-panel)',
            fontSize: '0.75em', fontFamily: 'monospace',
          }}>
            {icon}
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.asin}</span>
            {imgCount > 0 && (
              <span style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>{imgCount} img</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
