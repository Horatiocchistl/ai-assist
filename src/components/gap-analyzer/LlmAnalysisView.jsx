import React from 'react'
import { ArrowLeft } from 'lucide-react'
import { useGaps } from '../../hooks/useGaps.js'

const SEVERITY_COLORS = {
  critical: { bg: '#c05820', text: '#fff' },
  warning: { bg: '#e0a040', text: '#fff' },
  ok: { bg: 'var(--accent)', text: '#fff' },
}

function GapCard({ gap }) {
  const colors = SEVERITY_COLORS[gap.severity] || { bg: 'var(--border)', text: 'var(--text-primary)' }
  
  return (
    <div style={{
      padding: '1rem',
      border: '1px solid var(--border)',
      borderRadius: 8,
      background: 'var(--bg-panel)',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
    }}>
      {/* Section label */}
      <div style={{ fontSize: '0.75em', fontWeight: 600, color: 'var(--text-primary)' }}>
        {gap.section}
      </div>

      {/* Severity badge + gap type */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <span style={{
          padding: '0.25rem 0.5rem',
          borderRadius: 4,
          background: colors.bg,
          color: colors.text,
          fontSize: '0.65em',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {gap.severity}
        </span>
        <span style={{ fontSize: '0.7em', color: 'var(--text-muted)' }}>
          {gap.gap_type?.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Description */}
      {gap.description && (
        <div style={{ fontSize: '0.8em', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {gap.description}
        </div>
      )}

      {/* Thumbnail pair */}
      {(gap.planned_img_url || gap.live_img_url) && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          {gap.planned_img_url && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.65em', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Planned</div>
              <img
                src={gap.planned_img_url}
                alt="Planned"
                style={{ width: '100%', height: 80, objectFit: 'cover', border: '1px solid var(--border)', borderRadius: 4 }}
              />
            </div>
          )}
          {gap.live_img_url && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.65em', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Live</div>
              <img
                src={gap.live_img_url}
                alt="Live"
                style={{ width: '100%', height: 80, objectFit: 'cover', border: '1px solid var(--border)', borderRadius: 4 }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function LlmAnalysisView({ runId, asin, onBack }) {
  const { gaps, loading } = useGaps(runId, asin)

  // Sort gaps: critical first, then warning, then ok
  const sortedGaps = [...gaps].sort((a, b) => {
    const order = { critical: 0, warning: 1, ok: 2 }
    return (order[a.severity] || 3) - (order[b.severity] || 3)
  })

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
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '0.8em',
            padding: '0.2rem 0.4rem',
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
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75em', marginLeft: 'auto' }}>
          LLM Analysis
        </span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8em', textAlign: 'center', paddingTop: '3rem' }}>
            Loading analysis...
          </div>
        ) : gaps.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            paddingTop: '3rem',
          }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9em', textAlign: 'center', lineHeight: 1.6 }}>
              No analysis yet. Add annotations in the comparison view or run the LLM directly.
            </div>
            <button
              type="button"
              disabled
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                borderRadius: 6,
                background: 'var(--border)',
                color: 'var(--text-muted)',
                fontSize: '0.8em',
                fontWeight: 600,
                cursor: 'not-allowed',
              }}
            >
              Run LLM Analysis (coming soon)
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 800, margin: '0 auto' }}>
            {sortedGaps.map((gap) => (
              <GapCard key={gap.id} gap={gap} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
