import React, { useState, useRef } from 'react'
import { Upload, Image as ImageIcon } from 'lucide-react'

export default function ImageDropZone({
  onFiles,
  disabled = false,
  label = 'Planned images',
  hint = 'Drop images here or click to browse',
  pendingFiles = [],
  onRemovePending,
}) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  function addFiles(fileList) {
    const images = [...fileList].filter(f => f.type.startsWith('image/'))
    if (images.length) onFiles?.(images)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    addFiles(e.dataTransfer.files)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {label && (
        <div style={{ fontSize: '0.68em', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {label}
        </div>
      )}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={e => e.key === 'Enter' && !disabled && inputRef.current?.click()}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); if (!disabled) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 8,
          padding: pendingFiles.length ? '0.65rem' : '1.25rem 1rem',
          background: dragOver ? 'rgba(15, 191, 62, 0.06)' : 'var(--bg-panel)',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={disabled}
          onChange={e => addFiles(e.target.files || [])}
        />
        {pendingFiles.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', textAlign: 'center' }}>
            <Upload size={22} style={{ color: dragOver ? 'var(--accent)' : 'var(--text-muted)' }} />
            <div style={{ fontSize: '0.82em', color: 'var(--text-primary)', fontWeight: 600 }}>{hint}</div>
            <div style={{ fontSize: '0.7em', color: 'var(--text-muted)' }}>JPG, PNG, WebP — any filenames</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {pendingFiles.map((file, i) => (
              <PendingThumb key={`${file.name}-${i}`} file={file} onRemove={() => onRemovePending?.(i)} />
            ))}
            <div style={{
              width: 64, height: 48, borderRadius: 4, border: '1px dashed var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', fontSize: '0.65em', flexDirection: 'column', gap: 2,
            }}>
              <ImageIcon size={14} />
              <span>More</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PendingThumb({ file, onRemove }) {
  const [url, setUrl] = useState('')
  React.useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return (
    <div style={{ position: 'relative', width: 64 }}>
      <div style={{
        width: 64, height: 48, borderRadius: 4, overflow: 'hidden',
        border: '1px solid var(--border)', background: 'var(--bg-secondary)',
      }}>
        {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <div style={{ fontSize: '0.58em', color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {file.name}
      </div>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onRemove?.() }}
        style={{
          position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%',
          border: 'none', background: '#c05820', color: '#fff', fontSize: 10, cursor: 'pointer', lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  )
}
