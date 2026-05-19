import supabase from '../lib/supabase.js'
import { extractAsin, normalizeAmazonUrl } from '../lib/extractAsin.js'
import { parseCopySpecBuffer } from '../lib/parseCopySpec.js'
import { importPlannedToSupabase } from '../lib/importPlannedToSupabase.js'

const PLANNED_BUCKET = 'planned-assets'
const ACTIVE_KEY = 'gap_active_engagement_id'

export const MAX_PLANS = 50
export const SHEET_ACCEPT = '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv'
const SIGNED_URL_TTL = 3600

function storagePath(engagementId, asin, filename) {
  return `${engagementId}/${asin}/${filename}`
}

async function listStoragePaths(prefix) {
  const paths = []
  const queue = [prefix]
  while (queue.length) {
    const folder = queue.shift()
    const { data, error } = await supabase.storage.from(PLANNED_BUCKET).list(folder, { limit: 200 })
    if (error) throw error
    for (const item of data || []) {
      const full = folder ? `${folder}/${item.name}` : item.name
      if (item.id == null) queue.push(full)
      else paths.push(full)
    }
  }
  return paths
}

export async function loadActiveEngagement() {
  const storedId = typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_KEY) : null
  if (storedId) {
    const { data } = await supabase.from('gap_engagements').select('*').eq('id', storedId).maybeSingle()
    if (data) return data
  }
  const { data } = await supabase
    .from('gap_engagements')
    .select('*')
    .eq('is_active', true)
    .order('imported_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (data) {
    localStorage.setItem(ACTIVE_KEY, data.id)
    return data
  }
  return null
}

export function setActiveEngagementId(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
}

export async function loadPlans(engagementId) {
  if (!engagementId) return []
  const { data, error } = await supabase
    .from('asin_plans')
    .select('*')
    .eq('engagement_id', engagementId)
    .order('sort_order', { ascending: true })
  if (error) {
    console.error('[asin_plans] load error:', error.message)
    return []
  }
  return data || []
}

/** All plans across engagements — for display lists (not filtered by active engagement). */
export async function loadAllPlans() {
  const { data, error } = await supabase
    .from('asin_plans')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) {
    console.error('[asin_plans] loadAll error:', error.message)
    return []
  }
  return data || []
}

export async function importFolderPayload(payload, opts) {
  const result = await importPlannedToSupabase(payload, opts)
  if (result.ok && result.engagement) {
    setActiveEngagementId(result.engagement.id)
  }
  return result
}

export async function migrateOrphanPlans() {
  const { data: orphans } = await supabase.from('asin_plans').select('id').is('engagement_id', null)
  if (!orphans?.length) return
  const eng = await ensureManualEngagement()
  await supabase.from('asin_plans').update({ engagement_id: eng.id }).is('engagement_id', null)
}

export async function ensureManualEngagement() {
  let eng = await loadActiveEngagement()
  if (eng) return eng

  await supabase.from('gap_engagements').update({ is_active: false }).eq('is_active', true)
  const { data, error } = await supabase
    .from('gap_engagements')
    .insert({ name: 'Manual plans', is_active: true, imported_at: new Date().toISOString() })
    .select()
    .single()
  if (error) throw new Error(error.message)
  setActiveEngagementId(data.id)
  return data
}

export async function createPlan(engagementId, urlInput) {
  const parsed = extractAsin(urlInput)
  if (!parsed) return { ok: false, error: 'Could not parse Amazon URL or ASIN' }

  let engId = engagementId
  if (!engId) {
    const eng = await ensureManualEngagement()
    engId = eng.id
  }

  const { data: existing } = await supabase
    .from('asin_plans')
    .select('id')
    .eq('engagement_id', engId)
    .eq('asin', parsed.asin)
    .maybeSingle()
  if (existing) return { ok: false, error: `Plan already exists for ${parsed.asin}` }

  const { count } = await supabase
    .from('asin_plans')
    .select('*', { count: 'exact', head: true })
    .eq('engagement_id', engId)
  if (count >= MAX_PLANS) return { ok: false, error: `Maximum ${MAX_PLANS} plans` }

  const { data: maxSort } = await supabase
    .from('asin_plans')
    .select('sort_order')
    .eq('engagement_id', engId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('asin_plans')
    .insert({
      engagement_id: engId,
      url: normalizeAmazonUrl(parsed.asin),
      asin: parsed.asin,
      images: [],
      sheet: null,
      copy_spec: null,
      sort_order: (maxSort?.sort_order ?? -1) + 1,
    })
    .select()
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, plan: data, engagementId: engId }
}

export async function deletePlan(plan) {
  const prefix = plan.engagement_id && plan.asin
    ? `${plan.engagement_id}/${plan.asin}`
    : plan.id
  const errors = []
  try {
    const paths = await listStoragePaths(prefix)
    if (paths.length) await supabase.storage.from(PLANNED_BUCKET).remove(paths)
  } catch (err) {
    errors.push(`Storage: ${err.message}`)
  }
  const { error } = await supabase.from('asin_plans').delete().eq('id', plan.id)
  if (error) return { ok: false, error: error.message }
  if (errors.length) return { ok: true, warning: errors.join('; ') }
  return { ok: true }
}

/** Order planned images by sort_index (consultant review order — not paired to live by name). */
export function sortPlanImages(images = []) {
  return [...images].sort((a, b) => {
    const ai = a.sort_index ?? 9999
    const bi = b.sort_index ?? 9999
    if (ai !== bi) return ai - bi
    return (a.filename || '').localeCompare(b.filename || '', undefined, { sensitivity: 'base' })
  })
}

export async function uploadImage(plan, file, { label } = {}) {
  const filename = file.name
  const path = storagePath(plan.engagement_id, plan.asin, filename)
  const { error: upErr } = await supabase.storage.from(PLANNED_BUCKET).upload(path, file, { upsert: true })
  if (upErr) return { ok: false, error: upErr.message }

  const existing = sortPlanImages(plan.images || []).filter(img => img.filename !== filename)
  const nextIndex = existing.length
  const entry = {
    path,
    filename,
    label: label || filename.replace(/\.[^.]+$/, ''),
    sort_index: nextIndex,
  }

  const images = [...existing, entry].map((img, i) => ({ ...img, sort_index: i }))
  const { error: updErr } = await supabase.from('asin_plans').update({ images }).eq('id', plan.id)
  if (updErr) return { ok: false, error: updErr.message }
  return { ok: true, images }
}

export async function reorderPlanImages(planId, plan, fromIndex, toIndex) {
  const sorted = sortPlanImages(plan.images)
  if (fromIndex < 0 || fromIndex >= sorted.length || toIndex < 0 || toIndex >= sorted.length) {
    return { ok: false, error: 'Invalid index' }
  }
  const next = [...sorted]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  const images = next.map((img, i) => ({ ...img, sort_index: i }))
  const { error } = await supabase.from('asin_plans').update({ images }).eq('id', planId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, images }
}

export async function removeImage(planId, plan, storagePath) {
  await supabase.storage.from(PLANNED_BUCKET).remove([storagePath])
  const images = sortPlanImages(plan.images || [])
    .filter(img => img.path !== storagePath)
    .map((img, i) => ({ ...img, sort_index: i }))
  const { error } = await supabase.from('asin_plans').update({ images }).eq('id', planId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, images }
}

export async function uploadSheet(plan, file) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    return { ok: false, error: 'Copy spec must be .xlsx, .xls, or .csv' }
  }

  const path = storagePath(plan.engagement_id, plan.asin, file.name)
  if (plan.sheet?.path) {
    await supabase.storage.from(PLANNED_BUCKET).remove([plan.sheet.path]).catch(() => {})
  }

  const buf = await file.arrayBuffer()
  const { error: upErr } = await supabase.storage.from(PLANNED_BUCKET).upload(path, buf, { upsert: true })
  if (upErr) return { ok: false, error: upErr.message }

  let copySpec = null
  try {
    copySpec = parseCopySpecBuffer(new Uint8Array(buf), file.name)
  } catch (e) {
    return { ok: false, error: `Could not parse spreadsheet: ${e.message}` }
  }

  const sheet = { path, filename: file.name }
  const { error: updErr } = await supabase
    .from('asin_plans')
    .update({ sheet, copy_spec: copySpec })
    .eq('id', plan.id)
  if (updErr) return { ok: false, error: updErr.message }
  return { ok: true, sheet, copy_spec: copySpec }
}

export async function removeSheet(plan) {
  if (plan.sheet?.path) {
    await supabase.storage.from(PLANNED_BUCKET).remove([plan.sheet.path]).catch(() => {})
  }
  const { error } = await supabase
    .from('asin_plans')
    .update({ sheet: null, copy_spec: null })
    .eq('id', plan.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function uploadProductData(plan, file) {
  const path = storagePath(plan.engagement_id, plan.asin, 'product-data.json')
  const text = await file.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Invalid JSON' }
  }
  const { error: upErr } = await supabase.storage
    .from(PLANNED_BUCKET)
    .upload(path, text, { upsert: true, contentType: 'application/json' })
  if (upErr) return { ok: false, error: upErr.message }
  const { error } = await supabase.from('asin_plans').update({ product_data: parsed }).eq('id', plan.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, product_data: parsed }
}

export async function getSignedUrl(storagePath) {
  const { data, error } = await supabase.storage.from(PLANNED_BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL)
  if (error) return null
  return data.signedUrl
}

export async function getLiveSignedUrl(storagePath) {
  const { data, error } = await supabase.storage.from('live-captures').createSignedUrl(storagePath, SIGNED_URL_TTL)
  if (error) return null
  return data.signedUrl
}

/** Pre-Run complete + ready for Run: URL and at least one planned image. */
export function isPlanReady(plan) {
  return !!(plan?.url && (plan.images?.length > 0))
}

export function plansToRunAsins(plans) {
  return plans.filter(isPlanReady).map(p => ({
    asin: p.asin,
    url: p.url,
    planId: p.id,
    engagementId: p.engagement_id,
  }))
}

export async function updatePlanSortOrder(planIds) {
  for (let i = 0; i < planIds.length; i++) {
    await supabase.from('asin_plans').update({ sort_order: i }).eq('id', planIds[i])
  }
}

// Re-export for gradual migration
export { importPlannedToSupabase }
