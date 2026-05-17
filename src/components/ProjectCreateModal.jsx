import React, { useState } from 'react'
import { FolderPlus, Plus, X, Upload, Loader } from 'lucide-react'
import { extractFileText } from '../lib/extractFileText.js'

const overlay = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.45)',
}

const modal = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '1.5rem',
  width: '100%',
  maxWidth: '480px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  maxHeight: '80vh',
  overflowY: 'auto',
}

const titleStyle = {
  fontSize: '1rem',
  fontWeight: 600,
  color: 'var(--text-primary)',
  margin: '0 0 1rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
}

const label = {
  fontSize: '0.78em',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
  marginBottom: '0.3rem',
  marginTop: '0.75rem',
  display: 'block',
}

const inputStyle = {
  width: '100%',
  padding: '0.45rem 0.65rem',
  fontSize: '0.88em',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  outline: 'none',
  fontFamily: 'inherit',
}

const textareaStyle = {
  ...inputStyle,
  minHeight: '80px',
  resize: 'vertical',
  lineHeight: 1.6,
}

const kbRow = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  padding: '0.4rem 0.5rem',
  background: 'var(--bg-secondary)',
  borderRadius: '5px',
  marginBottom: '0.3rem',
  fontSize: '0.82em',
  color: 'var(--text-primary)',
}

const removeBtn = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  padding: '2px',
  flexShrink: 0,
  marginLeft: '0.5rem',
}

const accentBtn = {
  padding: '0.45rem 1rem',
  fontSize: '0.85em',
  fontWeight: 500,
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  background: 'var(--accent)',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
}

const cancelBtn = {
  padding: '0.45rem 1rem',
  fontSize: '0.85em',
  fontWeight: 500,
  border: '1px solid var(--border)',
  borderRadius: '6px',
  cursor: 'pointer',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
}

export default function ProjectCreateModal({ open, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [instructions, setInstructions] = useState('')
  const [kbItems, setKbItems] = useState([]) // [{ label, content }]
  const [kbLabel, setKbLabel] = useState('')
  const [kbContent, setKbContent] = useState('')
  const [readingFile, setReadingFile] = useState(false)

  function reset() {
    setName('')
    setInstructions('')
    setKbItems([])
    setKbLabel('')
    setKbContent('')
  }

  function addKb() {
    const l = kbLabel.trim()
    const c = kbContent.trim()
    if (!l || !c) return
    setKbItems(prev => [...prev, { label: l, content: c }])
    setKbLabel('')
    setKbContent('')
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setReadingFile(true)
    try {
      const text = await extractFileText(file)
      if (!text) throw new Error('No text could be extracted from this file.')
      setKbItems(prev => [...prev, { label: file.name, content: text }])
    } catch (err) {
      console.error('File read error:', err)
    } finally {
      setReadingFile(false)
    }
    e.target.value = ''
  }

  function removeKb(idx) {
    setKbItems(prev => prev.filter((_, i) => i !== idx))
  }

  function handleCreate() {
    const n = name.trim()
    if (!n) return
    onCreate({ name: n, instructions, knowledge: kbItems })
    reset()
    onClose()
  }

  function handleCancel() {
    reset()
    onClose()
  }

  if (!open) return null

  return (
    <div style={overlay} onClick={handleCancel}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h3 style={titleStyle}>
          <FolderPlus size={18} />
          New Project
        </h3>

        <span style={label}>Project Name</span>
        <input
          style={inputStyle}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="My Project"
          autoFocus
        />

        <span style={label}>Instructions</span>
        <textarea
          style={textareaStyle}
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder="Instructions for the AI when working in this project..."
        />

        <span style={label}>Knowledge</span>
        {kbItems.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.82em', marginBottom: '0.3rem' }}>
            No knowledge items yet.
          </div>
        )}
        {kbItems.map((k, i) => (
          <div key={i} style={kbRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>{k.label}</div>
              <div style={{ fontSize: '0.9em', color: 'var(--text-secondary)' }}>
                {k.content.length > 100 ? k.content.slice(0, 100) + '...' : k.content}
              </div>
            </div>
            <button style={removeBtn} onClick={() => removeKb(i)} title="Remove">
              <X size={13} />
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.4rem' }}>
          <input
            style={inputStyle}
            value={kbLabel}
            onChange={e => setKbLabel(e.target.value)}
            placeholder="Knowledge label"
          />
          <textarea
            style={{ ...textareaStyle, minHeight: '50px' }}
            value={kbContent}
            onChange={e => setKbContent(e.target.value)}
            placeholder="Knowledge content..."
          />
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              style={{ ...accentBtn, fontSize: '0.8em', padding: '0.35rem 0.75rem' }}
              onClick={addKb}
            >
              <Plus size={12} /> Add Text
            </button>
            <label
              style={{ ...accentBtn, fontSize: '0.8em', padding: '0.35rem 0.75rem', cursor: readingFile ? 'not-allowed' : 'pointer', opacity: readingFile ? 0.5 : 1 }}
            >
              {readingFile ? <Loader size={12} style={{ animation: 'spin 0.6s linear infinite' }} /> : <Upload size={12} />}
              {readingFile ? 'Reading...' : 'Upload File'}
              <input
                type="file"
                style={{ display: 'none' }}
                accept=".txt,.md,.pdf,.doc,.docx,.json,.csv,.js,.ts,.jsx,.tsx,.py,.html,.css,.xml,.yaml,.yml,.toml,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileUpload}
                disabled={readingFile}
              />
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <button style={cancelBtn} onClick={handleCancel}>Cancel</button>
          <button style={accentBtn} onClick={handleCreate}>Create Project</button>
        </div>
      </div>
    </div>
  )
}
