import React, { useState } from 'react'
import { X, Tag as TagIcon } from 'lucide-react'

export default function TagSidebar({ 
  open, 
  onClose, 
  imageType,      // 'live' | 'planned'
  imageIndex,     // null for hero, number for carousel/aplus
  existingTags,   // tags for this specific image
  allTags,        // all unique tags in section
  onAddTag,
  onRemoveTag,
  isLinkedTag     // function to check if tag is linked
}) {
  const [newTag, setNewTag] = useState('')

  const handleAddTag = async () => {
    if (!newTag.trim()) return
    await onAddTag(imageType, imageIndex, newTag)
    setNewTag('')
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 99
        }}
      />
      
      {/* Sidebar */}
      <div style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: 320,
        background: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border)',
        padding: '1rem',
        overflowY: 'auto',
        zIndex: 100,
        boxShadow: '-4px 0 12px rgba(0,0,0,0.1)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TagIcon size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: '0.9em', color: 'var(--text-primary)' }}>Image Tags</span>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              color: 'var(--text-muted)',
              display: 'flex'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Image info */}
        <div style={{ 
          padding: '0.5rem', 
          background: 'var(--bg-panel)', 
          borderRadius: 4,
          marginBottom: '1rem',
          fontSize: '0.75em',
          color: 'var(--text-secondary)'
        }}>
          <div>Type: <strong>{imageType}</strong></div>
          {imageIndex !== null && <div>Index: <strong>{imageIndex}</strong></div>}
        </div>

        {/* Add new tag */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ fontSize: '0.75em', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
            Add New Tag
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') handleAddTag()
              }}
              placeholder="Enter tag name..."
              style={{ 
                flex: 1,
                padding: '0.5rem',
                border: '1px solid var(--border)',
                borderRadius: 4,
                background: 'var(--bg-panel)',
                color: 'var(--text-primary)',
                fontSize: '0.8em'
              }}
            />
            <button
              onClick={handleAddTag}
              style={{
                padding: '0.5rem 0.75rem',
                border: 'none',
                borderRadius: 4,
                background: 'var(--accent)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.8em',
                fontWeight: 600
              }}
            >
              Add
            </button>
          </div>
        </div>

        {/* Existing tags for this image */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.75em', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
            This Image ({existingTags.length})
          </div>
          {existingTags.length === 0 ? (
            <div style={{ 
              fontSize: '0.75em', 
              color: 'var(--text-muted)', 
              fontStyle: 'italic',
              padding: '0.5rem',
              textAlign: 'center'
            }}>
              No tags yet
            </div>
          ) : (
            existingTags.map(t => (
              <div key={t.id} style={{
                padding: '0.4rem 0.6rem',
                marginBottom: '0.35rem',
                borderRadius: 4,
                background: isLinkedTag(t.tag) ? '#10b98133' : 'var(--bg-panel)',
                color: isLinkedTag(t.tag) ? '#10b981' : 'var(--text-primary)',
                border: isLinkedTag(t.tag) ? '1px solid #10b98166' : '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.8em'
              }}>
                <span>{t.tag}</span>
                <button 
                  onClick={() => onRemoveTag(t.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.1rem',
                    color: 'currentColor',
                    opacity: 0.6,
                    display: 'flex'
                  }}
                  title="Remove tag"
                >
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* All tags in section (for reference) */}
        <div>
          <div style={{ fontSize: '0.75em', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
            All Tags in Section
          </div>
          {allTags.length === 0 ? (
            <div style={{ 
              fontSize: '0.75em', 
              color: 'var(--text-muted)', 
              fontStyle: 'italic',
              padding: '0.5rem',
              textAlign: 'center'
            }}>
              No tags in this section yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {allTags.map(tag => (
                <span 
                  key={tag}
                  onClick={() => setNewTag(tag)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: 4,
                    background: isLinkedTag(tag) ? '#10b98133' : 'var(--bg-panel)',
                    color: isLinkedTag(tag) ? '#10b981' : 'var(--text-secondary)',
                    border: isLinkedTag(tag) ? '1px solid #10b98166' : '1px solid var(--border)',
                    fontSize: '0.7em',
                    cursor: 'pointer'
                  }}
                  title="Click to use this tag"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ 
          marginTop: '2rem',
          padding: '0.75rem',
          background: 'var(--bg-panel)',
          borderRadius: 4,
          fontSize: '0.7em'
        }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
            Legend
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ 
                width: 12, 
                height: 12, 
                borderRadius: 2, 
                background: '#10b981',
                border: '1px solid #10b98166'
              }} />
              <span style={{ color: 'var(--text-secondary)' }}>Linked (exists on both live & planned)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ 
                width: 12, 
                height: 12, 
                borderRadius: 2, 
                background: 'var(--bg-panel)',
                border: '1px solid var(--border)'
              }} />
              <span style={{ color: 'var(--text-secondary)' }}>Unlinked (one side only)</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
