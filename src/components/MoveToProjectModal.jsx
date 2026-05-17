import React from 'react'
import { FolderOpen, X } from 'lucide-react'

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
  padding: '1.25rem',
  width: '100%',
  maxWidth: '400px',
  maxHeight: '70vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
}

const titleStyle = {
  fontSize: '1rem',
  fontWeight: 600,
  color: 'var(--text-primary)',
  margin: '0 0 0.75rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const list = {
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
}

const row = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.55rem 0.65rem',
  cursor: 'pointer',
  borderRadius: '6px',
  color: 'var(--text-primary)',
  fontSize: '0.88em',
}

export default function MoveToProjectModal({ open, count = 1, projects, onSelect, onClose }) {
  if (!open) return null

  const label = count === 1 ? 'Move conversation to project' : `Move ${count} conversations to project`

  return (
    <div style={overlay} onClick={onClose} role="presentation">
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h3 style={titleStyle}>
          <span>{label}</span>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </h3>
        <div style={list}>
          <div
            style={{ ...row, color: 'var(--text-secondary)' }}
            onClick={() => onSelect(null)}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            No project
          </div>
          {projects.map(p => (
            <div
              key={p.id}
              style={row}
              onClick={() => onSelect(p.id)}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <FolderOpen size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
              {p.name || 'Untitled Project'}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
