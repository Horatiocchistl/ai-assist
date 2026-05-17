import React, { useEffect, useRef } from 'react'
import Message from './Message.jsx'
import MessageInput from './MessageInput.jsx'

export default function CenterPanel({
  conversation,
  isStreaming,
  streamingMessage,
  onSend,
  onStop,
  onRequestReasoning,
}) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation?.messages, streamingMessage])

  const messages = conversation?.messages || []

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-center)',
      minWidth: 0,
    }}>
      {/* Header */}
      <div style={{
        borderBottom: '1px solid var(--border)',
        padding: '0.65rem 1.5rem',
        background: 'var(--bg-panel)',
        flexShrink: 0,
        minHeight: '40px',
      }} />

      {/* Message list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1.5rem',
      }}>
        {messages.length === 0 && !streamingMessage && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-muted)',
            gap: '0.5rem',
          }}>
            <div style={{ fontSize: '2.5rem' }}>◌</div>
            <div style={{ fontSize: '0.9em', fontWeight: 500 }}>AI Assist v1</div>
            <div style={{ fontSize: '0.8em' }}>Start a conversation</div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <Message
            key={idx}
            message={msg}
            msgIndex={idx}
            isStreaming={false}
            onRequestReasoning={onRequestReasoning}
          />
        ))}

        {/* Live streaming message — shown only while generating */}
        {isStreaming && streamingMessage && (
          <Message
            message={{
              role: 'assistant',
              content: streamingMessage.content,
              thinkContent: streamingMessage.thinkContent,
            }}
            isStreaming={true}
          />
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <MessageInput
        onSend={onSend}
        onStop={onStop}
        isStreaming={isStreaming}
        disabled={false}
      />
    </div>
  )
}
