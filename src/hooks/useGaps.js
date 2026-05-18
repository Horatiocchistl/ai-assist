import { useState, useEffect } from 'react'
import supabase from '../lib/supabase.js'

/**
 * Hook for loading gap analysis results from the gaps table
 * @param {string} runId - The run ID
 * @param {string|null} asin - Optional ASIN to filter gaps for a specific product
 * @returns {{gaps: Array, loading: boolean}}
 */
export function useGaps(runId, asin = null) {
  const [gaps, setGaps] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadGaps() {
      if (!runId) {
        setLoading(false)
        return
      }

      let query = supabase.from('gaps').select('*').eq('run_id', runId)

      if (asin) {
        query = query.eq('asin', asin)
      }

      const { data, error } = await query.order('severity', { ascending: true })

      if (error) {
        console.error('[useGaps] load error:', error.message)
        setLoading(false)
        return
      }

      setGaps(data || [])
      setLoading(false)
    }

    loadGaps()
  }, [runId, asin])

  return { gaps, loading }
}
