import React, { useState } from 'react'
import { CheckCircle, AlertCircle, Loader, Search } from 'lucide-react'

const API = '/api/gap-analyzer'

export default function GapResultView({ runId, asins, asinProgress, onSelect }) {
  const [search, setSearch] = useState('')

  const filtered = asins.filter(({ asin }) =>
    asin.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Search bar */}
      <div style={{ flexShrink: 0, padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
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
              border: 'none', background: 'transparent', outline: 'none',
              fontSize: '0.82em', color: 'var(--text-primary)', width: '100%',
            }}
          />
        </div>
      </div>

      {/* Card grid */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '1rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
        gap: '0.75rem',
        alignContent: 'start',
      }}>
        {filtered.length === 0 && (
          <div style={{
            gridColumn: '1 / -1',
            color: 'var(--text-muted)', fontSize: '0.8em',
            textAlign: 'center', paddingTop: '3rem',
          }}>
            {search ? 'No matching ASINs' : 'No results yet'}
          </div>
        )}

        {filtered.map(({ asin }) => {
          const p = asinProgress?.[asin]
          const isClickable = p?.status === 'complete'

          return (
            <button
              key={asin}
              onClick={() => isClickable && onSelect(asin)}
              style={{
                display: 'flex', flexDirection: 'column',
                border: '1px solid var(--border)',
                borderRadius: 8,
                overflow: 'hidden',
                background: 'var(--bg-panel)',
                cursor: isClickable ? 'pointer' : 'default',
                textAlign: 'left',
                padding: 0,
                opacity: (p?.status === 'error' || p?.status === 'blocked') ? 0.55 : 1,
              }}
            >
              {/* Thumbnail */}
              <div style={{
                width: '100%', aspectRatio: '4/3',
                background: 'var(--bg-secondary)',
                overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {runId && isClickable ? (
                  <img
                    loading="lazy"
                    src={`${API}/captures/${runId}/${asin}/hero_viewport.png`}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { e.currentTarget.style.display = 'none' }}
                  />
                ) : (
                  <span style={{ fontSize: '0.7em', color: 'var(--text-muted)' }}>
                    {p?.status === 'running' ? 'Capturing…' : p?.status || 'Queued'}
                  </span>
                )}
              </div>

              {/* Info row */}
              <div style={{ padding: '0.5rem 0.65rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '0.8em', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {asin}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7em', color: 'var(--text-muted)' }}>
                  {p?.status === 'complete' && <>
                    <CheckCircle size={10} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span>{p.carouselCount} img · {p.aplusCount} A+</span>
                  </>}
                  {p?.status === 'running' && <>
                    <Loader size={10} style={{ color: '#e0a040', flexShrink: 0 }} />
                    <span style={{ color: '#e0a040' }}>Capturing…</span>
                  </>}
                  {(p?.status === 'error' || p?.status === 'blocked') && <>
                    <AlertCircle size={10} style={{ color: '#c05820', flexShrink: 0 }} />
                    <span style={{ color: '#c05820' }}>{p.status}</span>
                  </>}
                  {!p && <span>Queued</span>}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
