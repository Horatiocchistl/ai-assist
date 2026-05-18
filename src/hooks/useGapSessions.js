import supabase from '../lib/supabase.js'

export async function saveGapSession(serverRunId, asinsData, { engagementId = null, liveFiles = [] } = {}) {
  if (!serverRunId) {
    return { ok: false, error: 'Missing run id' }
  }
  const row = {
    server_run_id: serverRunId,
    asins_data: asinsData,
    completed_at: new Date().toISOString(),
    live_files: liveFiles,
  }
  if (engagementId) row.engagement_id = engagementId

  const { error } = await supabase
    .from('gap_sessions')
    .upsert(row, { onConflict: 'server_run_id' })
  if (error) {
    console.error('[gap_sessions] save error:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function loadLatestGapSession() {
  const { data, error } = await supabase
    .from('gap_sessions')
    .select('*')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[gap_sessions] load error:', error.message)
    return null
  }
  return data
}

/** First live capture image for Results thumbnail (any filename). */
export function firstLiveImagePath(liveFiles, asin) {
  const entry = (liveFiles || []).find(f => f.asin === asin)
  const png = entry?.files?.find(f => /\.png$/i.test(f.filename))
  return png?.path || entry?.files?.[0]?.path || null
}
