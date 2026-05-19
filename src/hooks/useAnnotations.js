import { useState, useEffect, useCallback } from 'react'
import supabase from '../lib/supabase.js'

/** Composite key stored in asin_annotations.section (e.g. carousel_01|planned|3). */
export function imageAnnotationKey(section, imageType, imageIndex) {
  const idx = imageIndex == null ? '' : String(imageIndex)
  return `${section}|${imageType}|${idx}`
}

/**
 * Hook for loading and saving per-image notes in comparison view.
 * @param {string} runId - The run ID
 * @param {string} asin - The ASIN
 * @returns {{annotations: Object, saveAnnotation: Function, loading: boolean}}
 */
export function useAnnotations(runId, asin) {
  const [annotations, setAnnotations] = useState({}) // annotationKey -> { note }
  const [loading, setLoading] = useState(true)

  // Load annotations for this run + ASIN on mount
  useEffect(() => {
    async function loadAnnotations() {
      if (!runId || !asin) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('asin_annotations')
        .select('*')
        .eq('run_id', runId)
        .eq('asin', asin)

      if (error) {
        console.error('[useAnnotations] load error:', error.message)
        setLoading(false)
        return
      }

      // Keyed by annotation key (stored in section column)
      const annotationsMap = {}
      for (const row of data || []) {
        annotationsMap[row.section] = {
          note: row.note,
        }
      }

      setAnnotations(annotationsMap)
      setLoading(false)
    }

    loadAnnotations()
  }, [runId, asin])

  // Upsert annotation
  const saveAnnotation = useCallback(
    async (annotationKey, note) => {
      if (!runId || !asin || !annotationKey) return

      const { error } = await supabase
        .from('asin_annotations')
        .upsert(
          {
            run_id: runId,
            asin,
            section: annotationKey,
            note,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'run_id,asin,section' }
        )

      if (error) {
        console.error('[useAnnotations] save error:', error.message)
        return
      }

      setAnnotations((prev) => ({
        ...prev,
        [annotationKey]: { note },
      }))
    },
    [runId, asin]
  )

  return { annotations, saveAnnotation, loading }
}
