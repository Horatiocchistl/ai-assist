import supabase from './supabase.js'
import { parseCopySpecBuffer } from './parseCopySpec.js'

const PLANNED_BUCKET = 'planned-assets'
const MAX_PLANS = 50

function base64ToBytes(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function storagePath(engagementId, asin, filename) {
  return `${engagementId}/${asin}/${filename}`
}

async function listEngagementStorage(engagementId) {
  const paths = []
  const queue = [engagementId]
  while (queue.length) {
    const folder = queue.shift()
    const { data, error } = await supabase.storage.from(PLANNED_BUCKET).list(folder, { limit: 500 })
    if (error) throw error
    for (const item of data || []) {
      const full = folder ? `${folder}/${item.name}` : item.name
      if (item.id == null) queue.push(full)
      else paths.push(full)
    }
  }
  return paths
}

async function clearEngagementPlans(engagementId) {
  const paths = await listEngagementStorage(engagementId).catch(() => [])
  if (paths.length) {
    await supabase.storage.from(PLANNED_BUCKET).remove(paths)
  }
  await supabase.from('asin_plans').delete().eq('engagement_id', engagementId)
}

/**
 * @param {{ name, sourcePath, asins, errors }} payload from Electron readPlannedFolder
 * @param {{ replace?: boolean, onProgress?: (msg: string) => void }} opts
 */
export async function importPlannedToSupabase(payload, opts = {}) {
  const { replace = true, onProgress } = opts
  const report = (msg) => onProgress?.(msg)

  if (!payload?.asins?.length) {
    return { ok: false, error: payload?.errors?.join('; ') || 'No ASINs to import' }
  }

  const validAsins = payload.asins.filter(
    a => (a.ready !== false) && a.url && a.files?.some(f => f.kind === 'image')
  )
  if (!validAsins.length) {
    const hint = payload.errors?.length
      ? payload.errors.join('; ')
      : 'Each folder needs image files and an Amazon URL in a .txt file'
    return { ok: false, error: hint }
  }

  if (validAsins.length > MAX_PLANS) {
    return { ok: false, error: `Maximum ${MAX_PLANS} ASINs per engagement` }
  }

  report('Creating engagement…')
  await supabase.from('gap_engagements').update({ is_active: false }).eq('is_active', true)

  const { data: engagement, error: engErr } = await supabase
    .from('gap_engagements')
    .insert({
      name: payload.name,
      source_path: payload.sourcePath,
      imported_at: new Date().toISOString(),
      is_active: true,
    })
    .select()
    .single()

  if (engErr) return { ok: false, error: engErr.message }

  if (replace) {
    report('Clearing previous plans for this engagement…')
    await clearEngagementPlans(engagement.id)
  }

  const importErrors = [...(payload.errors || [])]
  let imported = 0

  for (let i = 0; i < validAsins.length; i++) {
    const row = validAsins[i]
    report(`Importing ${row.asin} (${i + 1}/${validAsins.length})…`)

    const url = row.url
    if (!url || !row.asin) {
      importErrors.push(`${row.folderName || row.asin}: missing URL`)
      continue
    }
    const images = []
    let sheet = null
    let copySpec = null
    let productData = null

    for (const file of row.files) {
      const bytes = file.base64 ? base64ToBytes(file.base64) : file.buffer
      if (!bytes) continue

      if (file.kind === 'image') {
        const path = storagePath(engagement.id, row.asin, file.filename)
        const { error: upErr } = await supabase.storage.from(PLANNED_BUCKET).upload(path, bytes, {
          upsert: true,
          contentType: file.mime || 'image/png',
        })
        if (upErr) {
          importErrors.push(`${row.asin}/${file.filename}: ${upErr.message}`)
          continue
        }
        images.push({
          path,
          filename: file.filename,
          label: file.label || file.filename.replace(/\.[^.]+$/, ''),
          sort_index: file.sort_index ?? images.length,
        })
      } else if (file.kind === 'copy_spec') {
        const path = storagePath(engagement.id, row.asin, file.filename)
        const { error: upErr } = await supabase.storage.from(PLANNED_BUCKET).upload(path, bytes, {
          upsert: true,
          contentType: file.mime || 'application/octet-stream',
        })
        if (upErr) {
          importErrors.push(`${row.asin} copy-spec: ${upErr.message}`)
          continue
        }
        sheet = { path, filename: file.filename }
        try {
          copySpec = parseCopySpecBuffer(bytes, file.filename)
        } catch (e) {
          importErrors.push(`${row.asin}: could not parse copy-spec — ${e.message}`)
        }
      } else if (file.kind === 'product_data') {
        const path = storagePath(engagement.id, row.asin, file.filename)
        const { error: upErr } = await supabase.storage.from(PLANNED_BUCKET).upload(path, bytes, {
          upsert: true,
          contentType: 'application/json',
        })
        if (!upErr) {
          try {
            productData = JSON.parse(new TextDecoder().decode(bytes))
          } catch {
            importErrors.push(`${row.asin}: invalid product-data.json`)
          }
        }
      }
    }

    images.sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0))
    images.forEach((img, idx) => { img.sort_index = idx })

    const { error: planErr } = await supabase.from('asin_plans').insert({
      engagement_id: engagement.id,
      asin: row.asin,
      url,
      images,
      sheet,
      copy_spec: copySpec,
      product_data: productData,
      sort_order: i,
    })

    if (planErr) {
      importErrors.push(`${row.asin}: ${planErr.message}`)
    } else {
      imported++
    }
  }

  return {
    ok: imported > 0,
    engagement,
    imported,
    errors: importErrors,
    error: imported === 0 ? importErrors.join('; ') || 'Import failed' : undefined,
  }
}
