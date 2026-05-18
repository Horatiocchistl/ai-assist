import React, { useEffect, useRef } from 'react'
import { animate, createScope, stagger } from 'animejs'
import '../styles/document-creating.css'

const PHASE_LABELS = {
  preparing: 'Preparing…',
  read_skill: 'Loading report template…',
  get_datetime: 'Adding date and time…',
  save_markdown_report: 'Saving your draft…',
}

export function documentPhaseLabel(phase) {
  return PHASE_LABELS[phase] || PHASE_LABELS.preparing
}

export default function DocumentCreatingStatus({ phase = 'preparing', active = true }) {
  const rootRef = useRef(null)
  const phaseRef = useRef(null)

  useEffect(() => {
    if (!active || !rootRef.current) return undefined

    const scope = createScope({ root: rootRef.current }).add(() => {
      animate('.doc-status-line', {
        opacity: [0, 1],
        translateY: [8, 0],
        delay: stagger(80),
        duration: 500,
        ease: 'outCubic',
      })
      animate('.doc-status-line-accent', {
        opacity: [0.55, 1],
        alternate: true,
        loop: true,
        duration: 1200,
        ease: 'inOutSine',
      })
    })
    return () => {
      scope.revert()
    }
  }, [active])

  useEffect(() => {
    if (!active || !phaseRef.current) return
    animate(phaseRef.current, {
      opacity: [0.45, 1],
      duration: 300,
      ease: 'outCubic',
    })
  }, [phase, active])

  if (!active) return null

  return (
    <div ref={rootRef} className="doc-creating" aria-live="polite" aria-busy="true">
      <h2 className="doc-creating-title">Creating your document</h2>
      <p ref={phaseRef} className="doc-status-phase" key={phase}>
        {documentPhaseLabel(phase)}
      </p>
      <div className="doc-status-lines" aria-hidden="true">
        <div className="doc-status-line" style={{ width: '92%' }} />
        <div className="doc-status-line" style={{ width: '78%' }} />
        <div className="doc-status-line doc-status-line-accent" style={{ width: '88%' }} />
        <div className="doc-status-line" style={{ width: '64%' }} />
      </div>
    </div>
  )
}
