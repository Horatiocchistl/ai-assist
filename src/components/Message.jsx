import React from 'react'
import ReactMarkdown from 'react-markdown'
import { BrainCircuit } from 'lucide-react'
import ThinkBlock from './ThinkBlock.jsx'
export default function Message({ message, msgIndex, isStreaming, onRequestReasoning }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: '1.25rem',
      }}>
        <div style={{
          maxWidth: '72%',
          background: 'var(--user-bubble-bg)',
          border: '1px solid var(--user-bubble-border)',
          borderRadius: '12px 12px 2px 12px',
          padding: '0.65rem 1rem',
          color: 'var(--text-primary)',
          fontSize: '0.9em',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}>
          {message.content}
        </div>
      </div>
    )
  }

  const hasReasoning = message.thinkContent && message.thinkContent !== '...'
  const isLoadingReasoning = message.thinkContent === '...'

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'flex-start',
      marginBottom: '1.5rem',
    }}>
      <div style={{ maxWidth: '88%', minWidth: 0 }}>
        {hasReasoning && (
          <ThinkBlock
            content={message.thinkContent}
            isStreaming={false}
          />
        )}
        <div className="prose" style={{
          color: 'var(--text-primary)',
          fontSize: '0.9em',
        }}>
          <ReactMarkdown>{message.content || (isStreaming ? '▌' : '')}</ReactMarkdown>
        </div>
        {!isStreaming && message.content && !hasReasoning && (
          <button
            onClick={() => onRequestReasoning?.(msgIndex)}
            disabled={isLoadingReasoning}
            style={{
              marginTop: '0.4rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '0.25rem 0.6rem',
              fontSize: '0.75em',
              color: 'var(--text-muted)',
              cursor: isLoadingReasoning ? 'wait' : 'pointer',
              opacity: isLoadingReasoning ? 0.6 : 1,
            }}
          >
            <BrainCircuit size={12} />
            {isLoadingReasoning ? 'Analyzing...' : 'Reasoning'}
          </button>
        )}
      </div>
    </div>
  )
}
