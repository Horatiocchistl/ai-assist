import React from 'react'
import { AlertTriangle } from 'lucide-react'

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
  maxWidth: '360px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
}

const title = {
  fontSize: '1rem',
  fontWeight: 600,
  color: 'var(--text-primary)',
  margin: '0 0 0.5rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
}

const message = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  margin: '0 0 1.25rem',
  lineHeight: 1.4,
}

const actions = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.5rem',
}

const btnBase = {
  padding: '0.45rem 1rem',
  fontSize: '0.82rem',
  fontWeight: 500,
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
}

export default function ConfirmModal({ open, heading, description, confirmLabel = 'Delete', onConfirm, onCancel }) {
  if (!open) return null

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h3 style={title}>
          <AlertTriangle size={18} color="#e53e3e" />
          {heading}
        </h3>
        <p style={message}>{description}</p>
        <div style={actions}>
          <button
            onClick={onCancel}
            style={{ ...btnBase, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ ...btnBase, background: '#e53e3e', color: '#fff' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
