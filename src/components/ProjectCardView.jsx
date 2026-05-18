import React, { useState, useEffect } from 'react'
import { loadSavedDocumentsForProject } from '../hooks/useSavedDocuments.js'
import { ArrowLeft, Plus, MessageSquare, FileText, BookOpen, Upload, X, Pencil, Check } from 'lucide-react'
import supabase from '../lib/supabase.js'
import { extractFileText } from '../lib/extractFileText.js'

/* ── styles ─────────────────────────────────────────────── */

const root = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-primary)',
}

const backBar = {
  padding: '0.75rem 1.5rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  fontSize: '0.85em',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  fontFamily: 'inherit',
}

const twoCol = {
  flex: 1,
  display: 'flex',
  overflow: 'hidden',
}

const leftCol = {
  flex: 1,
  overflowY: 'auto',
  padding: '1rem 2rem 2rem',
  minWidth: 0,
}

const rightCol = {
  width: 300,
  flexShrink: 0,
  overflowY: 'auto',
  borderLeft: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  padding: '1.25rem',
}

const projName = {
  fontSize: '1.5rem',
  fontWeight: 700,
  color: 'var(--text-primary)',
  marginBottom: '0.25rem',
}

const projDesc = {
  fontSize: '0.88em',
  color: 'var(--text-secondary)',
  lineHeight: 1.5,
  marginBottom: '1.25rem',
}

const chatInput = {
  width: '100%',
  padding: '0.75rem 1rem',
  fontSize: '0.9em',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  outline: 'none',
  fontFamily: 'inherit',
  marginBottom: '1.5rem',
}

const sectionHead = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '0.5rem',
}

const sectionLabel = {
  fontSize: '0.8em',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
}

const addBtn = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  padding: '2px',
  borderRadius: '4px',
}

const convRow = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  padding: '0.65rem 0.75rem',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.88em',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  marginBottom: '0.4rem',
}

const kbRow = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.5rem 0.6rem',
  borderRadius: '6px',
  background: 'var(--bg-panel)',
  marginBottom: '0.35rem',
  fontSize: '0.82em',
  color: 'var(--text-primary)',
}

const emptyHint = {
  fontSize: '0.82em',
  color: 'var(--text-muted)',
  fontStyle: 'italic',
  padding: '0.25rem 0',
}

const instrText = {
  fontSize: '0.82em',
  color: 'var(--text-secondary)',
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
}

const accentBtn = {
  padding: '0.4rem 0.85rem',
  fontSize: '0.82em',
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

const inputStyle = {
  width: '100%',
  padding: '0.45rem 0.6rem',
  fontSize: '0.85em',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  background: 'var(--bg-panel)',
  color: 'var(--text-primary)',
  outline: 'none',
  fontFamily: 'inherit',
}

const textareaStyle = {
  ...inputStyle,
  minHeight: '60px',
  resize: 'vertical',
  lineHeight: 1.5,
}

/* ── helpers ─────────────────────────────────────────────── */

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

/* ── component ───────────────────────────────────────────── */

export default function ProjectCardView({
  project,
  conversations,
  onUpdateName,
  onUpdateInstructions,
  onAddKnowledge,
  onRemoveKnowledge,
  onSelectConv,
  onNewConv,
  onOpenDocument,
  onBack,
  startInEditMode,
}) {
  const [chatText, setChatText] = useState('')
  const [editingName, setEditingName] = useState(!!startInEditMode)
  const [nameDraft, setNameDraft] = useState(project?.name || '')
  const [showAddInstr, setShowAddInstr] = useState(!!startInEditMode)
  const [instrDraft, setInstrDraft] = useState(project?.instructions || '')
  const [showAddKb, setShowAddKb] = useState(false)
  const [kbLabel, setKbLabel] = useState('')
  const [kbContent, setKbContent] = useState('')
  const [kbError, setKbError] = useState('')
  const [ingesting, setIngesting] = useState(false)
  const [projectDocuments, setProjectDocuments] = useState([])

  useEffect(() => {
    if (!project?.id) {
      setProjectDocuments([])
      return undefined
    }
    let cancelled = false
    loadSavedDocumentsForProject(project.id)
      .then(docs => { if (!cancelled) setProjectDocuments(docs) })
      .catch(() => { if (!cancelled) setProjectDocuments([]) })
    return () => { cancelled = true }
  }, [project?.id])

  if (!project) {
    return (
      <div style={{ ...root, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        No project selected
      </div>
    )
  }

  const projConvs = conversations.filter(c => c.projectId === project.id)

  function handleChatSubmit(e) {
    if (e.key === 'Enter' && !e.shiftKey && chatText.trim()) {
      e.preventDefault()
      onNewConv(project.id, chatText.trim())
      setChatText('')
    }
  }

  function openInstrEdit() {
    setInstrDraft(project.instructions || '')
    setShowAddInstr(true)
  }

  function saveInstr() {
    onUpdateInstructions(project.id, instrDraft)
    setShowAddInstr(false)
  }

  async function handleAddKbText() {
    const label = kbLabel.trim()
    const content = kbContent.trim()
    if (!label || !content) { setKbError('Both label and content are required.'); return }
    setKbError('')
    setIngesting(true)
    try {
      await onAddKnowledge(project.id, 'text', label, content)
      setKbLabel('')
      setKbContent('')
      setShowAddKb(false)
    } catch (err) {
      setKbError(`Failed: ${err.message}`)
    } finally {
      setIngesting(false)
    }
  }

  async function handleRemoveKb(knowledgeId) {
    setKbError('')
    setIngesting(true)
    try {
      await onRemoveKnowledge(project.id, knowledgeId)
    } catch (err) {
      setKbError(`Remove failed: ${err.message}`)
    } finally {
      setIngesting(false)
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setKbError('')
    setIngesting(true)
    try {
      const text = await extractFileText(file)
      if (!text) {
        throw new Error('No text could be extracted from this file.')
      }
      const path = `projects/${project.id}/${Date.now()}_${file.name}`
      supabase.storage.from('knowledge').upload(path, file)
        .then(({ error }) => { if (error) console.warn('Storage upload failed:', error) })
      await onAddKnowledge(project.id, 'file', file.name, text)
    } catch (err) {
      setKbError(`Upload failed: ${err.message}`)
    } finally {
      setIngesting(false)
    }
    e.target.value = ''
  }

  return (
    <div style={root}>
      {/* Back link */}
      <button style={backBar} onClick={onBack}>
        <ArrowLeft size={15} /> All projects
      </button>

      <div style={twoCol}>
        {/* ── LEFT COLUMN ───────────────────────────── */}
        <div style={leftCol}>
          {editingName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <input
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { onUpdateName(project.id, nameDraft.trim()); setEditingName(false) } if (e.key === 'Escape') setEditingName(false) }}
                style={{ ...projName, border: '1px solid var(--border)', borderRadius: '6px', padding: '0.15rem 0.5rem', background: 'var(--bg-secondary)', outline: 'none', fontFamily: 'inherit', width: '100%' }}
                autoFocus
              />
              <button style={addBtn} onClick={() => { onUpdateName(project.id, nameDraft.trim()); setEditingName(false) }} title="Save name">
                <Check size={16} />
              </button>
              <button style={addBtn} onClick={() => setEditingName(false)} title="Cancel">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={projName}>{project.name || 'Untitled Project'}</div>
              <button style={{ ...addBtn, opacity: 0.4 }} onClick={() => { setNameDraft(project.name || ''); setEditingName(true) }} title="Rename project">
                <Pencil size={14} />
              </button>
            </div>
          )}
          <div style={projDesc}>
            {project.instructions
              ? project.instructions.length > 120
                ? project.instructions.slice(0, 120) + '...'
                : project.instructions
              : 'No description'}
          </div>

          {/* Chat input */}
          <input
            style={chatInput}
            value={chatText}
            onChange={e => setChatText(e.target.value)}
            onKeyDown={handleChatSubmit}
            placeholder="Type / for skills..."
          />

          {/* Conversations */}
          {projConvs.length === 0 ? (
            <div style={emptyHint}>No conversations yet. Type above to start one.</div>
          ) : (
            projConvs.map(c => (
              <div key={c.id} style={convRow} onClick={() => onSelectConv(c.id)}>
                <MessageSquare size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{c.title || 'Untitled conversation'}</div>
                  <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                    {timeAgo(c.updated_at || c.created_at)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── RIGHT COLUMN ──────────────────────────── */}
        <div style={rightCol}>
          {/* Instructions section */}
          <div style={sectionHead}>
            <span style={sectionLabel}>Instructions</span>
            <button style={addBtn} onClick={openInstrEdit} title="Edit instructions">
              <Plus size={14} />
            </button>
          </div>
          {showAddInstr ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1rem' }}>
              <textarea
                style={textareaStyle}
                value={instrDraft}
                onChange={e => setInstrDraft(e.target.value)}
                placeholder="Add instructions to tailor AI responses..."
                autoFocus
              />
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button style={accentBtn} onClick={saveInstr}>Save</button>
                <button style={{ ...accentBtn, background: 'var(--bg-panel)', color: 'var(--text-primary)' }} onClick={() => setShowAddInstr(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ ...instrText, marginBottom: '1.25rem' }}>
              {project.instructions || <span style={emptyHint}>Add instructions to tailor AI responses.</span>}
            </div>
          )}

          <div style={sectionHead}>
            <span style={sectionLabel}>Documents</span>
          </div>
          {projectDocuments.length === 0 ? (
            <div style={{ ...emptyHint, marginBottom: '1.25rem' }}>
              Saved reports from project chats appear here.
            </div>
          ) : (
            <div style={{ marginBottom: '1.25rem' }}>
              {projectDocuments.map(d => (
                <div
                  key={d.id}
                  style={{ ...kbRow, cursor: onOpenDocument ? 'pointer' : 'default' }}
                  onClick={() => onOpenDocument?.(d.conversation_id, d.id)}
                  role={onOpenDocument ? 'button' : undefined}
                  tabIndex={onOpenDocument ? 0 : undefined}
                  onKeyDown={e => {
                    if (onOpenDocument && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault()
                      onOpenDocument(d.conversation_id, d.id)
                    }
                  }}
                >
                  <BookOpen size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.title || d.filename}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Files / Knowledge section */}
          <div style={sectionHead}>
            <span style={sectionLabel}>Files</span>
            <button style={addBtn} onClick={() => setShowAddKb(v => !v)} title="Add knowledge">
              <Plus size={14} />
            </button>
          </div>

          {showAddKb && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.75rem' }}>
              <input
                style={inputStyle}
                value={kbLabel}
                onChange={e => { setKbLabel(e.target.value); setKbError('') }}
                placeholder="Label"
              />
              <textarea
                style={textareaStyle}
                value={kbContent}
                onChange={e => { setKbContent(e.target.value); setKbError('') }}
                placeholder="Text content..."
              />
              {kbError && <div style={{ fontSize: '0.78em', color: '#e04040' }}>{kbError}</div>}
              {ingesting && (
                <div style={{ fontSize: '0.78em', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: 10, height: 10, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite', display: 'inline-block' }} />
                  Embedding...
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button style={accentBtn} onClick={handleAddKbText} disabled={ingesting}>
                  <Plus size={12} /> Add Text
                </button>
                <label style={{ ...accentBtn, cursor: ingesting ? 'not-allowed' : 'pointer' }}>
                  <Upload size={12} /> Upload
                  <input
                    type="file"
                    style={{ display: 'none' }}
                    accept=".txt,.md,.pdf,.doc,.docx,.json,.csv,.js,.ts,.jsx,.tsx,.py,.html,.css,.xml,.yaml,.yml,.toml,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleFileUpload}
                    disabled={ingesting}
                  />
                </label>
                <button style={{ ...accentBtn, background: 'var(--bg-panel)', color: 'var(--text-primary)' }} onClick={() => { setShowAddKb(false); setKbError('') }}>Cancel</button>
              </div>
            </div>
          )}

          {(project.knowledge || []).length === 0 && !showAddKb && (
            <div style={{ ...emptyHint, textAlign: 'center', padding: '1.5rem 0.5rem' }}>
              <FileText size={28} style={{ margin: '0 auto 0.5rem', display: 'block', opacity: 0.3 }} />
              Add PDFs, Word docs, or other text files to reference in this project.
            </div>
          )}

          {(project.knowledge || []).map(k => (
            <div key={k.id} style={kbRow}>
              <FileText size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {k.label}
              </div>
              <button
                style={{ ...addBtn, color: 'var(--text-muted)', opacity: 0.5 }}
                title="Remove"
                onClick={() => handleRemoveKb(k.id)}
                disabled={ingesting}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
