import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  Search, X, Plus, MoreVertical, Pencil, Trash2, FolderInput, CheckSquare,
} from 'lucide-react'
import ConfirmModal from './ConfirmModal.jsx'
import MoveToProjectModal from './MoveToProjectModal.jsx'
import { formatRelativeTime } from '../lib/relativeTime.js'

const container = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-primary)',
}

const headerBar = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '1.25rem 2rem',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
  gap: '1rem',
  flexWrap: 'wrap',
}

const title = {
  fontSize: '1.25rem',
  fontWeight: 700,
  color: 'var(--text-primary)',
}

const headerActions = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
}

const primaryBtn = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.5rem 1rem',
  fontSize: '0.85em',
  fontWeight: 500,
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  background: 'var(--accent)',
  color: '#fff',
  fontFamily: 'inherit',
}

const secondaryBtn = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.5rem 1rem',
  fontSize: '0.85em',
  fontWeight: 500,
  border: '1px solid var(--border)',
  borderRadius: '6px',
  cursor: 'pointer',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontFamily: 'inherit',
}

const dangerBtn = {
  ...secondaryBtn,
  color: '#e53e3e',
  borderColor: 'rgba(229, 62, 62, 0.35)',
}

const toolbar = {
  padding: '1rem 2rem',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
}

const searchBox = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.5rem 0.75rem',
  borderRadius: '6px',
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  maxWidth: 420,
}

const searchInput = {
  flex: 1,
  border: 'none',
  background: 'transparent',
  outline: 'none',
  color: 'var(--text-primary)',
  fontSize: '0.85em',
  fontFamily: 'inherit',
}

const list = {
  flex: 1,
  overflowY: 'auto',
  padding: '0 2rem',
}

const rowBase = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.65rem',
  padding: '0.85rem 0.25rem',
  cursor: 'pointer',
  borderBottom: '1px solid var(--border)',
  position: 'relative',
  color: 'var(--text-primary)',
}

const emptyState = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  flex: 1,
  color: 'var(--text-muted)',
  fontSize: '0.9em',
}

const menu = {
  position: 'absolute',
  right: 0,
  top: '100%',
  zIndex: 50,
  minWidth: '180px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  padding: '0.35rem 0',
}

const menuItem = (danger) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  width: '100%',
  padding: '0.45rem 0.85rem',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: '0.85em',
  color: danger ? '#e53e3e' : 'var(--text-primary)',
  textAlign: 'left',
  fontFamily: 'inherit',
})

const projectTag = {
  fontSize: '0.82em',
  color: 'var(--text-muted)',
  flexShrink: 0,
}

const iconBtn = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  padding: '4px',
  borderRadius: '4px',
  flexShrink: 0,
}

const checkbox = (checked) => ({
  width: 18,
  height: 18,
  borderRadius: 4,
  border: checked ? 'none' : '1px solid var(--border)',
  background: checked ? 'var(--accent)' : 'var(--input-bg)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  color: '#fff',
  fontSize: '11px',
  fontWeight: 700,
})

const selectedLabel = {
  fontSize: '0.85em',
  color: 'var(--text-secondary)',
}

function matchesSearch(conv, query, projectNameById) {
  if (!query.trim()) return true
  const q = query.trim().toLowerCase()
  const title = (conv.title || 'Untitled conversation').toLowerCase()
  const project = conv.projectId ? (projectNameById[conv.projectId] || '').toLowerCase() : ''
  return title.includes(q) || project.includes(q)
}

function RowMenu({ onSelect, onRename, onMove, onDelete }) {
  return (
    <div style={menu} onClick={e => e.stopPropagation()}>
      <button type="button" style={menuItem(false)} onClick={onSelect}>
        <CheckSquare size={14} /> Select
      </button>
      <button type="button" style={menuItem(false)} onClick={onRename}>
        <Pencil size={14} /> Rename
      </button>
      <button type="button" style={menuItem(false)} onClick={onMove}>
        <FolderInput size={14} /> Add to project
      </button>
      <button type="button" style={menuItem(true)} onClick={onDelete}>
        <Trash2 size={14} /> Delete
      </button>
    </div>
  )
}

function ChatRow({
  conv,
  projectName,
  isActive,
  selectMode,
  selected,
  onToggleSelect,
  onOpen,
  onRename,
  onDelete,
  onMove,
  onEnterSelectWithRow,
}) {
  const label = conv.title || 'Untitled conversation'
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(label)
  const [hover, setHover] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function commitRename() {
    const trimmed = value.trim()
    if (trimmed && trimmed !== conv.title) onRename(conv.id, trimmed)
    setEditing(false)
    setMenuOpen(false)
  }

  const relative = formatRelativeTime(conv.updatedAt || conv.createdAt)

  function handleRowClick() {
    if (selectMode) {
      onToggleSelect(conv.id)
      return
    }
    if (!editing) onOpen(conv.id)
  }

  const rowBg = hover && !selectMode ? 'var(--bg-secondary)' : 'transparent'

  return (
    <div
      style={{ ...rowBase, background: rowBg, color: 'var(--text-primary)' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); if (!menuOpen) setMenuOpen(false) }}
      onClick={handleRowClick}
    >
      {selectMode && (
        <div style={checkbox(selected)} aria-hidden>
          {selected ? '✓' : null}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.35rem' }}>
        {editing ? (
          <input
            ref={inputRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setEditing(false)
              e.stopPropagation()
            }}
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1,
              minWidth: 120,
              fontSize: 'inherit',
              padding: '0.35rem 0.5rem',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              outline: 'none',
              background: 'var(--input-bg)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <>
            <span style={{ fontWeight: 500 }}>{label}</span>
            {relative && (
              <span style={{ fontSize: '0.88em', color: 'var(--text-muted)' }}>{relative}</span>
            )}
          </>
        )}
      </div>

      {projectName && !editing && (
        <span style={projectTag}>{projectName}</span>
      )}

      {!selectMode && !editing && hover && (
        <button
          type="button"
          style={iconBtn}
          onClick={e => {
            e.stopPropagation()
            setMenuOpen(v => !v)
          }}
          aria-label="More actions"
        >
          <MoreVertical size={16} />
        </button>
      )}

      {menuOpen && !selectMode && (
        <RowMenu
          onSelect={() => { setMenuOpen(false); onEnterSelectWithRow(conv.id) }}
          onRename={() => { setValue(label); setEditing(true); setMenuOpen(false) }}
          onMove={() => { setMenuOpen(false); onMove(conv.id) }}
          onDelete={() => { setMenuOpen(false); onDelete(conv.id) }}
        />
      )}
    </div>
  )
}

export default function ChatsView({
  conversations,
  projects = [],
  activeConvId,
  onSelectConv,
  onDeleteConv,
  onRenameConv,
  onNewConv,
  onMoveConversation,
  onMoveConversations,
  onDeleteConversations,
}) {
  const [search, setSearch] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [moveModal, setMoveModal] = useState(null)

  const projectNameById = useMemo(
    () => Object.fromEntries(projects.map(p => [p.id, p.name])),
    [projects],
  )

  const sortedChats = useMemo(
    () => [...conversations].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0),
    ),
    [conversations],
  )

  const filteredChats = useMemo(
    () => sortedChats.filter(c => matchesSearch(c, search, projectNameById)),
    [sortedChats, search, projectNameById],
  )

  const selectedCount = selectedIds.size

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllFiltered() {
    setSelectedIds(new Set(filteredChats.map(c => c.id)))
  }

  function enterSelectWithRow(id) {
    setSelectMode(true)
    setSelectedIds(new Set([id]))
  }

  function handleConfirmDelete() {
    if (!confirmDelete) return
    const { ids } = confirmDelete
    if (ids.length === 1) onDeleteConv(ids[0])
    else onDeleteConversations(ids)
    setConfirmDelete(null)
    exitSelectMode()
  }

  async function handleMovePick(projectId) {
    if (!moveModal) return
    const { ids } = moveModal
    try {
      if (ids.length === 1) await onMoveConversation(ids[0], projectId)
      else await onMoveConversations(ids, projectId)
    } catch (err) {
      console.error(err)
    }
    setMoveModal(null)
    exitSelectMode()
  }

  return (
    <div style={container}>
      <div style={headerBar}>
        <span style={title}>Chats</span>
        <div style={headerActions}>
          {selectMode ? (
            <>
              <span style={selectedLabel}>{selectedCount} selected</span>
              <button
                type="button"
                style={secondaryBtn}
                onClick={selectAllFiltered}
                disabled={filteredChats.length === 0}
              >
                Select all
              </button>
              <button
                type="button"
                style={secondaryBtn}
                disabled={selectedCount === 0}
                onClick={() => setMoveModal({ ids: [...selectedIds] })}
              >
                <FolderInput size={14} />
                Move to project
              </button>
              <button
                type="button"
                style={dangerBtn}
                disabled={selectedCount === 0}
                onClick={() => setConfirmDelete({
                  ids: [...selectedIds],
                  name: `${selectedCount} conversation${selectedCount === 1 ? '' : 's'}`,
                })}
              >
                <Trash2 size={14} />
                Delete
              </button>
              <button type="button" style={secondaryBtn} onClick={exitSelectMode}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" style={secondaryBtn} onClick={() => setSelectMode(true)}>
                Select
              </button>
              <button type="button" style={primaryBtn} onClick={() => onNewConv(null)}>
                <Plus size={15} />
                New chat
              </button>
            </>
          )}
        </div>
      </div>

      <div style={toolbar}>
        <div style={searchBox}>
          <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            style={searchInput}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search chats..."
            aria-label="Search chats"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{ ...iconBtn, padding: 2 }}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {sortedChats.length === 0 ? (
        <div style={emptyState}>No conversations yet. Start a new chat.</div>
      ) : filteredChats.length === 0 ? (
        <div style={emptyState}>No chats match your search.</div>
      ) : (
        <div style={list}>
          {filteredChats.map(conv => (
            <ChatRow
              key={conv.id}
              conv={conv}
              projectName={conv.projectId ? projectNameById[conv.projectId] : null}
              isActive={conv.id === activeConvId}
              selectMode={selectMode}
              selected={selectedIds.has(conv.id)}
              onToggleSelect={toggleSelect}
              onOpen={onSelectConv}
              onRename={onRenameConv}
              onDelete={(id) => {
                const c = conversations.find(x => x.id === id)
                setConfirmDelete({ ids: [id], name: c?.title || 'this conversation' })
              }}
              onMove={(id) => setMoveModal({ ids: [id] })}
              onEnterSelectWithRow={enterSelectWithRow}
            />
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        heading={confirmDelete?.ids?.length > 1 ? 'Delete conversations' : 'Delete conversation'}
        description={`Are you sure you want to delete "${confirmDelete?.name}"? All messages will be lost. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <MoveToProjectModal
        open={!!moveModal}
        count={moveModal?.ids?.length || 0}
        projects={projects}
        onSelect={handleMovePick}
        onClose={() => setMoveModal(null)}
      />
    </div>
  )
}
