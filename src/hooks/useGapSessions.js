import supabase from '../lib/supabase.js'

export async function saveGapSession(serverRunId, asinsData) {
  if (!serverRunId) {
    return { ok: false, error: 'Missing run id' }
  }
  const { error } = await supabase
    .from('gap_sessions')
    .upsert(
      { server_run_id: serverRunId, asins_data: asinsData, completed_at: new Date().toISOString() },
      { onConflict: 'server_run_id' }
    )
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
