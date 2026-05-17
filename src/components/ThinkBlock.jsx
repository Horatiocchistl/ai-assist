import React, { useState } from 'react'
import { BrainCircuit } from 'lucide-react'

export default function ThinkBlock({ content, isStreaming }) {
  const [open, setOpen] = useState(false)

  if (!content) return null

  return (
    <details
      className="think-block"
      open={open}
      onToggle={e => setOpen(e.target.open)}
    >
      <summary>
        <BrainCircuit size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
        {isStreaming ? 'Reasoning…' : 'Reasoning'}
      </summary>
      <div className="think-content">{content}</div>
    </details>
  )
}
