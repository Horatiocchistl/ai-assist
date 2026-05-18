import React, { useState, useEffect } from 'react'
import { Link2, Image as ImageIcon, FileText, FileSpreadsheet, FileJson, X } from 'lucide-react'
import { extractAsin } from '../../lib/extractAsin.js'

const overlay = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.5)',
  padding: '1rem',
}

const modal = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '1.25rem',
  width: '100%',
  maxWidth: 480,
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
}

const sectionTitle = {
  fontSize: '0.68em',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '0.35rem',
}

function FoundList({ icon: Icon, title, items }) {
  if (!items?.length) return null
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={sectionTitle}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {items.map((item, i) => (
          <div
            key={`${item}-${i}`}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.4rem',
              fontSize: '0.78em', color: 'var(--text-primary)',
              padding: '0.35rem 0.5rem', borderRadius: 4,
              border: '1px solid var(--border)', background: 'var(--bg-panel)',
            }}
          >
            <Icon size={12} style={{ flexShrink: 0, marginTop: 2, color: 'var(--text-muted)' }} />
            <span style={{ wordBreak: 'break-word' }}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TxtPreview({ txtFiles }) {
  if (!txtFiles?.length) return null
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={sectionTitle}>Text files scanned (no Amazon URL detected)</div>
      {txtFiles.map((tf, i) => (
        <div
          key={`${tf.filename}-${i}`}
          style={{
            marginBottom: '0.4rem', padding: '0.5rem', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--bg-panel)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78em', fontWeight: 600, marginBottom: '0.35rem' }}>
            <FileText size={12} style={{ color: 'var(--text-muted)' }} />
            {tf.filename}
          </div>
          {tf.preview ? (
            <pre style={{
              margin: 0, fontSize: '0.7em', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
              wordBreak: 'break-word', maxHeight: 100, overflowY: 'auto', fontFamily: 'inherit',
            }}>
              {tf.preview}
              {tf.preview.length >= 500 ? '…' : ''}
            </pre>
          ) : (
            <div style={{ fontSize: '0.72em', color: 'var(--text-muted)' }}>File is empty</div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function FolderImportUrlModal({
  open,
  item,
  index = 0,
  total = 1,
  onConfirm,
  onSkip,
  onCancel,
}) {
  const [urlInput, setUrlInput] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setUrlInput('')
      setError('')
    }
  }, [open, item?.folderName])

  if (!open || !item) return null

  const parsed = extractAsin(urlInput)
  const copySpec = item.files?.find(f => f.kind === 'copy_spec')
  const productData = item.files?.find(f => f.kind === 'product_data')
  const imageNames = item.imageNames || item.files?.filter(f => f.kind === 'image').map(f => f.filename) || []

  function handleConfirm() {
    if (!parsed) {
      setError('Enter a valid Amazon URL or 10-character ASIN')
      return
    }
    onConfirm?.(parsed.url, parsed.asin)
  }

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Amazon URL needed
            </h3>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.78em', color: 'var(--text-muted)' }}>
              {index + 1} of {total} · folder <strong style={{ color: 'var(--text-primary)' }}>{item.folderName}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}
          >
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: '0.8em', color: 'var(--text-secondary)', lineHeight: 1.45, margin: '0 0 1rem' }}>
          Found planned images in this folder but no Amazon URL in the text files. Paste the listing URL below.
        </p>

        <FoundList icon={ImageIcon} title={`Images found (${imageNames.length})`} items={imageNames} />
        <TxtPreview txtFiles={item.txtFiles} />
        {copySpec && (
          <FoundList icon={FileSpreadsheet} title="Also found" items={[`${copySpec.filename} (copy spec)`]} />
        )}
        {productData && (
          <FoundList icon={FileJson} title="Also found" items={['product-data.json']} />
        )}

        <div style={{ marginTop: '0.5rem' }}>
          <div style={sectionTitle}>Amazon listing URL</div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Link2 size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              autoFocus
              value={urlInput}
              onChange={e => { setUrlInput(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleConfirm()}
              placeholder="https://www.amazon.com/dp/B0…"
              style={{
                flex: 1, padding: '0.5rem 0.6rem', background: 'var(--input-bg)',
                border: `1px solid ${parsed ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85em',
              }}
            />
          </div>
          {error && (
            <div style={{ fontSize: '0.72em', color: '#c05820', marginTop: '0.35rem' }}>{error}</div>
          )}
          {parsed && (
            <div style={{ fontSize: '0.72em', color: 'var(--accent)', marginTop: '0.35rem' }}>
              ASIN {parsed.asin} detected
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '0.45rem 0.85rem', fontSize: '0.82em', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--bg-secondary)',
              color: 'var(--text-primary)', cursor: 'pointer',
            }}
          >
            Cancel import
          </button>
          <button
            type="button"
            onClick={onSkip}
            style={{
              padding: '0.45rem 0.85rem', fontSize: '0.82em', borderRadius: 6,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            Skip this folder
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!parsed}
            style={{
              padding: '0.45rem 1rem', fontSize: '0.82em', fontWeight: 600, borderRadius: 6,
              border: 'none', cursor: parsed ? 'pointer' : 'default',
              background: parsed ? 'var(--accent)' : 'var(--border)',
              color: parsed ? '#fff' : 'var(--text-muted)',
            }}
          >
            {index + 1 < total ? 'Next folder' : 'Finish & import'}
          </button>
        </div>
      </div>
    </div>
  )
}
