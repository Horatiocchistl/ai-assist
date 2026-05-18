import supabase from '../lib/supabase.js'

const LIVE_BUCKET = 'live-captures'
const IMAGE_RE = /\.(png|jpe?g|webp)$/i

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

async function fetchLiveFilesFromStorage(runId) {
  if (!runId) return []
  const liveFiles = []
  const { data: asinEntries, error } = await supabase.storage.from(LIVE_BUCKET).list(runId, { limit: 200 })
  if (error) {
    console.error('[gap_sessions] live-captures list:', error.message)
    return []
  }
  for (const ent of asinEntries || []) {
    if (ent.id != null) continue
    const asin = ent.name
    const prefix = `${runId}/${asin}`
    const { data: files, error: fileErr } = await supabase.storage
      .from(LIVE_BUCKET)
      .list(prefix, { limit: 200 })
    if (fileErr) continue
    const uploaded = []
    for (const f of files || []) {
      if (f.id == null) continue
      if (IMAGE_RE.test(f.name) || f.name === 'product-data.json') {
        uploaded.push({ path: `${prefix}/${f.name}`, filename: f.name })
      }
    }
    if (uploaded.length) liveFiles.push({ asin, files: uploaded })
  }
  return liveFiles
}

/** Restore latest run from Supabase only (not local disk). */
export async function resolveLatestSession() {
  const picked = await loadLatestGapSession()
  if (!picked?.server_run_id) return null

  let liveFiles = picked.live_files?.length ? picked.live_files : []
  if (!liveFiles.length) {
    liveFiles = await fetchLiveFilesFromStorage(picked.server_run_id)
  }
  return { ...picked, live_files: liveFiles }
}

export function buildAsinsDataFromProgress(progress, asinList = []) {
  const urlByAsin = Object.fromEntries((asinList || []).map(a => [a.asin, a.url]))
  return Object.entries(progress || {}).map(([asin, p]) => ({
    asin,
    url: urlByAsin[asin] || '',
    status: p?.status === 'complete' ? 'captured' : (p?.status || 'error'),
    carouselCount: p?.carouselCount ?? 0,
    aplusCount: p?.aplusCount ?? 0,
  }))
}

export function getAsinLiveFiles(liveFiles, asin) {
  const entry = (liveFiles || []).find(f => f.asin === asin)
  return entry?.files || []
}

export function firstLiveImagePath(liveFiles, asin) {
  const files = getAsinLiveFiles(liveFiles, asin)
  const img = files.find(f => IMAGE_RE.test(f.filename || ''))
  return img?.path || null
}
