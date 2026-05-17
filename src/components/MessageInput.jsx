import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square } from 'lucide-react'

const SKILLS_SERVER = 'http://localhost:3001'

function saveCursorPosition(el) {
  const sel = window.getSelection()
  if (!sel.rangeCount || !el.contains(sel.anchorNode)) return null
  const range = sel.getRangeAt(0)
  const preRange = document.createRange()
  preRange.selectNodeContents(el)
  preRange.setEnd(range.startContainer, range.startOffset)
  return preRange.toString().length
}

function restoreCursorPosition(el, offset) {
  if (offset === null) return
  const sel = window.getSelection()
  const range = document.createRange()
  let current = 0
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    const len = node.textContent.length
    if (current + len >= offset) {
      range.setStart(node, offset - current)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
    current += len
  }
  // Fallback: put cursor at end
  range.selectNodeContents(el)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

export default function MessageInput({ onSend, onStop, isStreaming, disabled }) {
  const [plainText, setPlainText] = useState('')
  const [skillNames, setSkillNames] = useState([])
  const [hasContent, setHasContent] = useState(false)
  const editorRef = useRef(null)
  const skillsRef = useRef([])

  // Fetch skill names on mount
  useEffect(() => {
    fetch(`${SKILLS_SERVER}/api/skills`)
      .then(res => res.json())
      .then(skills => {
        const names = skills.map(s => s.name.toLowerCase())
        setSkillNames(names)
        skillsRef.current = names
      })
      .catch(() => {})
  }, [])

  function getPlainText() {
    return editorRef.current?.textContent || ''
  }

  function buildHighlightedHTML(text) {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    if (!skillsRef.current.length) return escaped || ''
    return escaped.replace(/(\/[\w-]+)/g, (match) => {
      const name = match.slice(1).toLowerCase()
      if (skillsRef.current.includes(name)) {
        return `<span style="color:#3b82f6;font-weight:600">${match}</span>`
      }
      return match
    })
  }

  function applyHighlights() {
    const el = editorRef.current
    if (!el) return
    const text = getPlainText()
    const highlighted = buildHighlightedHTML(text)
    // Only update DOM if highlights differ (avoid unnecessary re-renders)
    if (el.innerHTML !== highlighted) {
      const cursor = saveCursorPosition(el)
      el.innerHTML = highlighted
      restoreCursorPosition(el, cursor)
    }
  }

  const handleInput = useCallback(() => {
    const text = getPlainText()
    setPlainText(text)
    setHasContent(text.length > 0)
    applyHighlights()
  }, [])

  // Re-apply highlights when skillNames change
  useEffect(() => {
    applyHighlights()
  }, [skillNames])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
    // Prevent plain Enter from inserting newline (optional: allow Shift+Enter)
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const text = getPlainText().trim()
    if (!text || isStreaming) return
    onSend(text)
    setPlainText('')
    setHasContent(false)
    if (editorRef.current) {
      editorRef.current.innerHTML = ''
    }
  }

  function handlePaste(e) {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      background: 'var(--bg-panel)',
      padding: '0.85rem 1.25rem',
    }}>
      <div style={{
        display: 'flex',
        gap: '0.6rem',
        alignItems: 'flex-end',
        background: 'var(--input-bg)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '0.5rem 0.65rem 0.5rem 0.85rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <div
            ref={editorRef}
            contentEditable={!disabled}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            suppressContentEditableWarning
            style={{
              fontFamily: 'inherit',
              fontSize: '0.9em',
              lineHeight: 1.6,
              color: 'var(--text-primary)',
              outline: 'none',
              minHeight: '1.6em',
              maxHeight: '200px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
            }}
          />
          {!hasContent && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                pointerEvents: 'none',
                color: 'var(--text-muted)',
                fontFamily: 'inherit',
                fontSize: '0.9em',
                lineHeight: 1.6,
                opacity: 0.6,
              }}
            >
              Send a message… (⌘↵ to send)
            </div>
          )}
        </div>
        {isStreaming ? (
          <button
            onClick={onStop}
            title="Stop generation"
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              borderRadius: '7px',
              border: '1px solid var(--stop-border)',
              background: 'var(--stop-bg)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--stop-color)',
            }}
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!plainText.trim() || disabled}
            title="Send (⌘↵)"
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              borderRadius: '7px',
              border: 'none',
              background: plainText.trim() ? 'var(--accent)' : 'var(--border)',
              cursor: plainText.trim() ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: plainText.trim() ? '#fff' : 'var(--text-muted)',
              transition: 'background 0.15s',
            }}
          >
            <Send size={14} />
          </button>
        )}
      </div>
      <div style={{ marginTop: '0.4rem', minHeight: '1em' }} />
    </div>
  )
}
