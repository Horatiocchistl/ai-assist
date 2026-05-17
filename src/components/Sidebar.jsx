import React, { useState, useRef, useEffect } from 'react'
import {
  Plus,
  MessagesSquare,
  FolderOpen,
  Trash2,
  FolderCog,
  PanelLeft,
  PanelLeftClose,
} from 'lucide-react'
import ConfirmModal from './ConfirmModal.jsx'

export const SIDEBAR_EXPANDED_WIDTH = 240
export const SIDEBAR_COLLAPSED_WIDTH = 52

const s = {
  root: (expanded) => ({
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: expanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH,
    flexShrink: 0,
    overflow: 'hidden',
    transition: 'width 0.18s ease',
    background: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border)',
    fontSize: '0.82em',
    color: 'var(--text-primary)',
  }),
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.65rem 0.75rem 0.35rem',
    flexShrink: 0,
  },
  brand: {
    fontSize: '1.05em',
    fontWeight: 600,
    color: 'var(--text-primary)',
    letterSpacing: '-0.02em',
  },
  section: {
    padding: '0.65rem 0.75rem 0.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: '0.72em',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    padding: '2px',
    borderRadius: '3px',
  },
  row: (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.3rem 0.75rem',
    cursor: 'pointer',
    borderRadius: '5px',
    margin: '1px 4px',
    background: active ? 'rgba(15, 191, 62, 0.15)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-primary)',
    fontWeight: active ? 500 : 400,
    userSelect: 'none',
  }),
  convRow: (active) => ({
    display: 'flex',
    alignItems: 'center',
    padding: '0.35rem 0.75rem',
    cursor: 'pointer',
    borderRadius: '5px',
    margin: '1px 4px',
    background: active ? 'rgba(15,191,62,0.15)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    userSelect: 'none',
  }),
  projectRow: (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.35rem 0.75rem',
    cursor: 'pointer',
    borderRadius: '5px',
    margin: '1px 4px',
    background: active ? 'rgba(15,191,62,0.15)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    userSelect: 'none',
  }),
  scroll: {
    flex: 1,
    overflowY: 'auto',
    paddingBottom: '0.5rem',
    minHeight: 0,
  },
  collapsedNav: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '0.5rem 0',
    gap: '0.25rem',
  },
  collapsedBtn: (active) => ({
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    background: active ? 'rgba(15, 191, 62, 0.15)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    flexShrink: 0,
  }),
  toggleBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    padding: 4,
    borderRadius: 6,
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
}

function ConvRow({ conv, isActive, onSelect, onRename, onDelete }) {
  const label = conv.title || 'Untitled conversation'
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(label)
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function commit() {
    const trimmed = value.trim()
    if (trimmed && trimmed !== conv.title) {
      onRename(conv.id, trimmed)
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <div style={s.convRow(isActive)}>
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          style={{ flex: 1, fontSize: 'inherit', padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 3, outline: 'none', minWidth: 0, width: '100%' }}
        />
      </div>
    )
  }

  return (
    <div
      style={{ ...s.convRow(isActive), justifyContent: 'space-between', gap: '0.35rem' }}
      onClick={() => onSelect(conv.id)}
      onDoubleClick={() => { setValue(conv.title || ''); setEditing(true) }}
      title={label}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {label}
      </span>
      <button
        style={{ ...s.iconBtn, opacity: 0.5, flexShrink: 0 }}
        title="Delete conversation"
        onClick={(e) => { e.stopPropagation(); onDelete(conv.id) }}
      >
        <Trash2 size={10} />
      </button>
    </div>
  )
}

function CollapsedIconButton({ active, title, onClick, children }) {
  return (
    <button
      type="button"
      style={s.collapsedBtn(active)}
      onClick={onClick}
      title={title}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-panel)' }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? s.collapsedBtn(true).background : 'transparent' }}
    >
      {children}
    </button>
  )
}

export default function Sidebar({
  expanded,
  onToggle,
  projects,
  conversations,
  activeConvId,
  activeProjectId,
  onSelectConv,
  onSelectProject,
  onViewProjects,
  onViewChats,
  onNewProject,
  onNewConv,
  onDeleteConv,
  onRenameConv,
  onOpenSkillDirs,
}) {
  const [section, setSection] = useState('chats')
  const [confirmDelete, setConfirmDelete] = useState(null)

  const recentConvs = conversations.filter(c => !c.projectId).slice(0, 20)

  function requestDeleteConv(id) {
    const conv = conversations.find(c => c.id === id)
    setConfirmDelete({ type: 'conversation', id, name: conv?.title || 'this conversation' })
  }

  function handleConfirmDelete() {
    if (!confirmDelete) return
    onDeleteConv(confirmDelete.id)
    setConfirmDelete(null)
  }

  function goChats() {
    setSection('chats')
    onViewChats?.()
  }

  function goProjects() {
    setSection('projects')
    onViewProjects()
  }

  function handleNewChat() {
    setSection('chats')
    onNewConv(null)
  }

  if (!expanded) {
    return (
      <>
        <nav style={{ ...s.root(false), display: 'flex', flexDirection: 'column' }} aria-label="Main navigation">
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '0.5rem', flexShrink: 0 }}>
            <CollapsedIconButton active={false} title="Open sidebar" onClick={onToggle}>
              <PanelLeft size={18} />
            </CollapsedIconButton>
          </div>
          <div style={{ ...s.collapsedNav, flex: 1 }}>
            <CollapsedIconButton active={false} title="New chat" onClick={handleNewChat}>
              <Plus size={18} />
            </CollapsedIconButton>
            <CollapsedIconButton active={section === 'chats'} title="Chats" onClick={goChats}>
              <MessagesSquare size={18} />
            </CollapsedIconButton>
            <CollapsedIconButton
              active={section === 'projects'}
              title="Projects"
              onClick={goProjects}
            >
              <FolderOpen size={18} />
            </CollapsedIconButton>
          </div>
          <div style={{ paddingBottom: '0.5rem', display: 'flex', justifyContent: 'center' }}>
            <CollapsedIconButton active={false} title="Skill folders" onClick={onOpenSkillDirs}>
              <FolderCog size={18} />
            </CollapsedIconButton>
          </div>
        </nav>
        <ConfirmModal
          open={!!confirmDelete}
          heading="Delete Conversation"
          description={`Are you sure you want to delete "${confirmDelete?.name}"? All messages will be lost. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      </>
    )
  }

  return (
    <>
      <nav style={s.root(true)} aria-label="Main navigation">
        <div style={s.header}>
          <span style={s.brand}>AI Assist v1</span>
          <button type="button" style={s.toggleBtn} onClick={onToggle} title="Close sidebar">
            <PanelLeftClose size={18} />
          </button>
        </div>

        <div style={{ padding: '0 0 0.25rem', flexShrink: 0 }}>
          <div style={s.row(false)} onClick={handleNewChat}>
            <Plus size={14} />
            <span>New chat</span>
          </div>
          <div style={s.row(section === 'chats')} onClick={goChats}>
            <MessagesSquare size={14} />
            <span>Chats</span>
          </div>
          <div style={s.row(section === 'projects')} onClick={goProjects}>
            <FolderOpen size={14} />
            <span>Projects</span>
          </div>
        </div>

        <div style={s.scroll}>
          {section === 'chats' && (
            <>
              <div style={s.section}>
                <span style={s.sectionLabel}>Recents</span>
              </div>
              {recentConvs.map(conv => (
                <ConvRow
                  key={conv.id}
                  conv={conv}
                  isActive={conv.id === activeConvId}
                  onSelect={onSelectConv}
                  onRename={onRenameConv}
                  onDelete={requestDeleteConv}
                />
              ))}
              {recentConvs.length === 0 && (
                <div style={{ padding: '1rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.8em' }}>
                  Start a conversation.
                </div>
              )}
            </>
          )}

          {section === 'projects' && (
            <>
              <div style={s.section}>
                <span style={s.sectionLabel}>Projects</span>
                <button
                  type="button"
                  style={s.iconBtn}
                  title="New project"
                  onClick={onNewProject}
                >
                  <Plus size={14} />
                </button>
              </div>
              {projects.map(proj => (
                <div
                  key={proj.id}
                  style={s.projectRow(proj.id === activeProjectId)}
                  onClick={() => onSelectProject(proj.id)}
                  title={proj.name}
                >
                  <FolderOpen size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {proj.name}
                  </span>
                </div>
              ))}
              {projects.length === 0 && (
                <div style={{ padding: '1rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.8em' }}>
                  No projects yet.
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', padding: '0.5rem 0.75rem', flexShrink: 0 }}>
          <button
            type="button"
            onClick={onOpenSkillDirs}
            style={{
              width: '100%',
              padding: '0.4rem 0.6rem',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '5px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '0.82em',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <FolderCog size={12} />
            Skill Folders
          </button>
        </div>
      </nav>
      <ConfirmModal
        open={!!confirmDelete}
        heading="Delete Conversation"
        description={`Are you sure you want to delete "${confirmDelete?.name}"? All messages will be lost. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  )
}
