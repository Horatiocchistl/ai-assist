import React, { useState } from 'react'
import { Plus, Pencil, Trash2, FolderOpen, MessageSquare } from 'lucide-react'
import ConfirmModal from './ConfirmModal.jsx'

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
}

const title = {
  fontSize: '1.25rem',
  fontWeight: 700,
  color: 'var(--text-primary)',
}

const newBtn = {
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
}

const grid = {
  flex: 1,
  overflowY: 'auto',
  padding: '1.5rem 2rem',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: '1rem',
  alignContent: 'start',
}

const cardStyle = {
  position: 'relative',
  padding: '1.25rem',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  cursor: 'pointer',
  transition: 'border-color 0.15s',
}

const cardTitle = {
  fontSize: '1rem',
  fontWeight: 600,
  color: 'var(--text-primary)',
  marginBottom: '0.4rem',
  paddingRight: '3.5rem',
}

const cardSnippet = {
  fontSize: '0.82em',
  color: 'var(--text-secondary)',
  lineHeight: 1.5,
  marginBottom: '0.6rem',
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
}

const cardMeta = {
  fontSize: '0.75em',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
}

const cardActions = {
  position: 'absolute',
  top: '0.75rem',
  right: '0.75rem',
  display: 'flex',
  gap: '0.25rem',
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
}

const emptyState = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  height: '100%',
  color: 'var(--text-muted)',
  fontSize: '0.9em',
}

export default function ProjectsView({
  projects,
  conversations,
  onSelectProject,
  onEditProject,
  onDeleteProject,
  onNewProject,
}) {
  const [confirmDelete, setConfirmDelete] = useState(null)

  function handleDeleteClick(e, project) {
    e.stopPropagation()
    setConfirmDelete({ id: project.id, name: project.name })
  }

  function handleConfirmDelete() {
    if (confirmDelete) {
      onDeleteProject(confirmDelete.id)
      setConfirmDelete(null)
    }
  }

  return (
    <div style={container}>
      <div style={headerBar}>
        <span style={title}>Projects</span>
        <button style={newBtn} onClick={onNewProject}>
          <Plus size={15} />
          New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div style={emptyState}>
          <FolderOpen size={36} />
          <div>No projects yet. Create one to get started.</div>
        </div>
      ) : (
        <div style={grid}>
          {projects.map(project => {
            const convCount = conversations.filter(c => c.projectId === project.id).length
            return (
              <div
                key={project.id}
                style={cardStyle}
                onClick={() => onSelectProject(project.id)}
              >
                <div style={cardActions}>
                  <button
                    style={iconBtn}
                    title="Edit project"
                    onClick={(e) => { e.stopPropagation(); onEditProject(project.id) }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    style={iconBtn}
                    title="Delete project"
                    onClick={(e) => handleDeleteClick(e, project)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={cardTitle}>{project.name || 'Untitled Project'}</div>
                <div style={cardSnippet}>
                  {project.instructions || 'No instructions set.'}
                </div>
                <div style={cardMeta}>
                  <MessageSquare size={11} />
                  {convCount} conversation{convCount !== 1 ? 's' : ''}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        heading="Delete Project"
        description={`Are you sure you want to delete "${confirmDelete?.name}"? All conversations in this project will also be deleted. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
