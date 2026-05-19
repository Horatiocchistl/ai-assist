import { useState, useEffect, useCallback } from 'react'
import supabase from '../lib/supabase.js'

export function useGaps(runId, asin = null) {
  const [gaps, setGaps] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

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
  }, [runId, asin, refreshKey])

  const refetch = useCallback(() => setRefreshKey(k => k + 1), [])

  return { gaps, loading, refetch }
}
