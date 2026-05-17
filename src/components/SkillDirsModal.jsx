import React, { useState, useEffect } from 'react'
import { X, FolderPlus, FolderOpen, ChevronRight, ArrowUp, Check, Globe } from 'lucide-react'

const SERVER = 'http://localhost:3001'

/* ── styles ─────────────────────────────────────────────── */

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
  maxWidth: '520px',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
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

const dirItem = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.4rem 0.5rem',
  background: 'var(--bg-secondary)',
  borderRadius: '5px',
  marginBottom: '0.35rem',
  fontSize: '0.82em',
  color: 'var(--text-primary)',
  wordBreak: 'break-all',
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

const actionBtn = {
  flex: 1,
  padding: '0.5rem 0.6rem',
  fontSize: '0.82em',
  fontWeight: 500,
  border: '1px solid var(--border)',
  borderRadius: '6px',
  cursor: 'pointer',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.4rem',
}

const accentBtn = {
  ...actionBtn,
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
}

const inputStyle = {
  width: '100%',
  padding: '0.4rem 0.6rem',
  fontSize: '0.82em',
  border: '1px solid var(--border)',
  borderRadius: '5px',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  outline: 'none',
}

const doneBtn = {
  marginTop: '1rem',
  padding: '0.45rem 1rem',
  fontSize: '0.82rem',
  fontWeight: 500,
  border: '1px solid var(--border)',
  borderRadius: '6px',
  cursor: 'pointer',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  width: '100%',
  flexShrink: 0,
}

const browserBox = {
  border: '1px solid var(--border)',
  borderRadius: '6px',
  background: 'var(--bg-secondary)',
  marginTop: '0.5rem',
  overflow: 'hidden',
}

const browserHeader = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.4rem 0.6rem',
  borderBottom: '1px solid var(--border)',
  fontSize: '0.78em',
  color: 'var(--text-muted)',
  background: 'var(--bg-panel)',
}

const browserList = {
  maxHeight: '200px',
  overflowY: 'auto',
  padding: '0.25rem 0',
}

const browserItem = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.3rem 0.6rem',
  fontSize: '0.82em',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  width: '100%',
  textAlign: 'left',
}

const upBtn = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  padding: '2px',
}

/* ── component ─────────────────────────────────────────── */

export default function SkillDirsModal({ open, onClose }) {
  const [dirs, setDirs] = useState([])
  const [loading, setLoading] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const [browsePath, setBrowsePath] = useState('')
  const [browseEntries, setBrowseEntries] = useState([])
  const [browseParent, setBrowseParent] = useState('')
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseError, setBrowseError] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')

  useEffect(() => {
    if (open) {
      setLoading(true)
      setShowBrowser(false)
      setShowUrlInput(false)
      setUrlValue('')
      setSyncError('')
      fetch(`${SERVER}/api/skill-dirs`)
        .then(r => r.json())
        .then(setDirs)
        .catch(() => setDirs([]))
        .finally(() => setLoading(false))
    }
  }, [open])

  async function save(updated) {
    setDirs(updated)
    await fetch(`${SERVER}/api/skill-dirs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirs: updated }),
    })
  }

  function handleRemove(idx) {
    save(dirs.filter((_, i) => i !== idx))
  }

  async function browse(dirPath) {
    setBrowseLoading(true)
    setBrowseError('')
    try {
      const url = dirPath
        ? `${SERVER}/api/browse?path=${encodeURIComponent(dirPath)}`
        : `${SERVER}/api/browse`
      const res = await fetch(url)
      const data = await res.json()
      if (data.error) { setBrowseError(data.error); return }
      setBrowsePath(data.current)
      setBrowseParent(data.parent)
      setBrowseEntries(data.dirs)
    } catch (err) {
      setBrowseError('Failed to browse: ' + err.message)
    } finally {
      setBrowseLoading(false)
    }
  }

  function handleOpenBrowser() {
    setShowBrowser(true)
    setShowUrlInput(false)
    browse('')
  }

  function handleSelectFolder() {
    if (!browsePath || dirs.includes(browsePath)) return
    save([...dirs, browsePath])
    setShowBrowser(false)
  }

  async function handleAddUrl() {
    const trimmed = urlValue.trim()
    if (!trimmed || dirs.includes(trimmed)) return
    setSyncError('')
    setSyncing(true)
    const updated = [...dirs, trimmed]
    try {
      await save(updated)
      const res = await fetch(`${SERVER}/api/skill-dirs/sync`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setSyncError(data.error || 'Sync failed')
        return
      }
      if (data.errors?.length) {
        setSyncError(data.errors.map(e => `${e.url}: ${e.error}`).join('\n'))
        return
      }
      setUrlValue('')
      setShowUrlInput(false)
    } catch (err) {
      setSyncError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  if (!open) return null

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h3 style={titleStyle}>
          <FolderPlus size={18} />
          Skill Folders
        </h3>

        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>Loading...</div>
        ) : (
          <>
            {dirs.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.82em', marginBottom: '0.5rem' }}>
                No skill folders configured.
              </div>
            )}
            {dirs.map((d, i) => (
              <div key={i} style={dirItem}>
                <span>{d}</span>
                <button style={removeBtn} title="Remove" onClick={() => handleRemove(i)}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button style={actionBtn} onClick={handleOpenBrowser}>
            <FolderOpen size={14} />
            Browse Folders
          </button>
          <button style={actionBtn} onClick={() => { setShowUrlInput(v => !v); setShowBrowser(false) }}>
            <Globe size={14} />
            Add URL
          </button>
        </div>

        {showBrowser && (
          <div style={browserBox}>
            <div style={browserHeader}>
              <button style={upBtn} onClick={() => browse(browseParent)} title="Go up">
                <ArrowUp size={14} />
              </button>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {browsePath}
              </span>
              <button
                style={{ ...accentBtn, flex: 'none', padding: '0.25rem 0.5rem', fontSize: '0.78em' }}
                onClick={handleSelectFolder}
              >
                <Check size={12} /> Select
              </button>
            </div>
            {browseError && (
              <div style={{ padding: '0.5rem 0.6rem', fontSize: '0.78em', color: '#e04040' }}>
                {browseError}
              </div>
            )}
            {browseLoading ? (
              <div style={{ padding: '0.5rem 0.6rem', fontSize: '0.82em', color: 'var(--text-muted)' }}>
                Loading...
              </div>
            ) : (
              <div style={browserList}>
                {browseEntries.length === 0 && (
                  <div style={{ padding: '0.5rem 0.6rem', fontSize: '0.82em', color: 'var(--text-muted)' }}>
                    No subfolders
                  </div>
                )}
                {browseEntries.map(entry => (
                  <button
                    key={entry.path}
                    style={browserItem}
                    onClick={() => browse(entry.path)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <FolderOpen size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                    <span style={{ flex: 1 }}>{entry.name}</span>
                    <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {showUrlInput && (
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
            <input
              style={inputStyle}
              value={urlValue}
              onChange={e => setUrlValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !syncing) handleAddUrl() }}
              placeholder="https://github.com/user/skills-repo"
              autoFocus
              disabled={syncing}
            />
            <button style={accentBtn} onClick={handleAddUrl} disabled={syncing}>
              {syncing ? 'Cloning…' : 'Add'}
            </button>
          </div>
        )}
        {showUrlInput && syncError && (
          <div style={{ marginTop: '0.35rem', fontSize: '0.78em', color: '#e04040', whiteSpace: 'pre-wrap' }}>
            {syncError}
          </div>
        )}

        <button style={doneBtn} onClick={onClose}>Done</button>
      </div>
    </div>
  )
}
