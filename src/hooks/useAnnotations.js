import { useState, useEffect, useCallback } from 'react'
import supabase from '../lib/supabase.js'

/**
 * Hook for loading and saving human annotations for ASIN comparison view
 * @param {string} runId - The run ID
 * @param {string} asin - The ASIN
 * @returns {{annotations: Object, saveAnnotation: Function, loading: boolean}}
 */
export function useAnnotations(runId, asin) {
  const [annotations, setAnnotations] = useState({}) // section -> { note }
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

      // Convert array to object keyed by section
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
    async (section, note) => {
      if (!runId || !asin || !section) return

      const { error } = await supabase
        .from('asin_annotations')
        .upsert(
          {
            run_id: runId,
            asin,
            section,
            note,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'run_id,asin,section' }
        )

      if (error) {
        console.error('[useAnnotations] save error:', error.message)
        return
      }

      // Update local state
      setAnnotations((prev) => ({
        ...prev,
        [section]: { note },
      }))
    },
    [runId, asin]
  )

  return { annotations, saveAnnotation, loading }
}
