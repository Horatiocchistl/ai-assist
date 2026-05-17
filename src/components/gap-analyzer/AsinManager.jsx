import React, { useState } from 'react'
import { Plus, Trash2, ExternalLink, AlertCircle } from 'lucide-react'

function extractAsin(input) {
  const trimmed = input.trim()
  // Match /dp/XXXXXXXXXX in a URL
  const dpMatch = trimmed.match(/\/dp\/([A-Z0-9]{10})/)
  if (dpMatch) return { asin: dpMatch[1], url: trimmed }
  // Match bare ASIN
  if (/^[A-Z0-9]{10}$/.test(trimmed)) {
    return { asin: trimmed, url: `https://www.amazon.com/dp/${trimmed}` }
  }
  return null
}

export default function AsinManager({ asins, onAdd, onRemove }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  function handleAdd() {
    const lines = input.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) return

    const toAdd = []
    const bad = []

    for (const line of lines) {
      const parsed = extractAsin(line)
      if (!parsed) { bad.push(line.slice(0, 60)); continue }
      if (asins.some(a => a.asin === parsed.asin)) continue
      if (asins.length + toAdd.length >= 50) { bad.push('50 ASIN limit reached'); break }
      toAdd.push(parsed)
    }

    if (bad.length) {
      setError(`Could not parse: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? ` +${bad.length - 3} more` : ''}`)
    } else {
      setError('')
    }

    if (toAdd.length) {
      onAdd(toAdd)
      setInput('')
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.75em', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          ASINs ({asins.length}/50)
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <textarea
          value={input}
          onChange={e => { setInput(e.target.value); setError('') }}
          onKeyDown={handleKeyDown}
          placeholder={'Paste Amazon URLs or ASINs\nOne per line — up to 50'}
          rows={4}
          style={{
            width: '100%',
            padding: '0.5rem 0.6rem',
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text-primary)',
            fontSize: '0.82em',
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
            lineHeight: 1.5,
          }}
        />
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#c05820', fontSize: '0.78em' }}>
            <AlertCircle size={12} />
            {error}
          </div>
        )}
        <button
          onClick={handleAdd}
          disabled={!input.trim()}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
            padding: '0.4rem 0.75rem',
            background: input.trim() ? 'var(--accent)' : 'var(--border)',
            color: input.trim() ? '#fff' : 'var(--text-muted)',
            border: 'none', borderRadius: 6, cursor: input.trim() ? 'pointer' : 'default',
            fontSize: '0.82em', fontWeight: 500,
          }}
        >
          <Plus size={13} />
          Add to queue
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', minHeight: 0 }}>
        {asins.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8em', padding: '0.5rem 0' }}>
            No ASINs queued yet.
          </div>
        )}
        {asins.map((item, i) => (
          <div
            key={item.asin}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.35rem 0.5rem',
              background: 'var(--bg-panel)',
              borderRadius: 5,
              border: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: '0.72em', color: 'var(--text-muted)', fontWeight: 600, minWidth: 18 }}>
              {i + 1}
            </span>
            <span style={{ flex: 1, fontSize: '0.8em', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.asin}
            </span>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
              title={item.url}
            >
              <ExternalLink size={11} />
            </a>
            <button
              onClick={() => onRemove(item.asin)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 2 }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
