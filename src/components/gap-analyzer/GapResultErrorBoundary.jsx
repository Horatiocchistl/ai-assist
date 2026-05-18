import React from 'react'

export default class GapResultErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[GapResultView crash]', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ color: '#c05820', fontSize: '0.85em', fontWeight: 600 }}>Results view error</div>
          <pre style={{
            fontFamily: 'monospace', fontSize: '0.72em',
            color: 'var(--text-secondary)',
            background: 'var(--bg-panel)',
            padding: '0.75rem', borderRadius: 6,
            maxWidth: '100%', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            border: '1px solid var(--border)',
          }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              fontSize: '0.8em', padding: '0.3rem 0.9rem',
              border: '1px solid var(--border)', borderRadius: 6,
              cursor: 'pointer',
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
            }}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
