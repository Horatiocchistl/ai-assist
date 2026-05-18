import React from 'react'
import { CheckCircle, Circle } from 'lucide-react'

export default function PreRunRequirements({ hasUrl, hasImages, compact = false }) {
  const items = [
    { key: 'url', label: 'Amazon listing URL', done: hasUrl },
    { key: 'images', label: 'Planned image assets', done: hasImages },
  ]
  const ready = hasUrl && hasImages

  return (
    <div style={{
      padding: compact ? '0.5rem 0.65rem' : '0.75rem 0.85rem',
      borderRadius: 8,
      border: `1px solid ${ready ? 'var(--accent)' : 'var(--border)'}`,
      background: ready ? 'rgba(15, 191, 62, 0.08)' : 'var(--bg-panel)',
    }}>
      {!compact && (
        <div style={{ fontSize: '0.72em', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
          Each product needs both:
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {items.map(item => (
          <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78em' }}>
            {item.done ? (
              <CheckCircle size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            ) : (
              <Circle size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            )}
            <span style={{ color: item.done ? 'var(--text-primary)' : 'var(--text-muted)' }}>{item.label}</span>
          </div>
        ))}
      </div>
      {ready && !compact && (
        <div style={{ fontSize: '0.68em', color: 'var(--accent)', marginTop: '0.45rem', fontWeight: 600 }}>
          Ready for Run
        </div>
      )}
    </div>
  )
}
