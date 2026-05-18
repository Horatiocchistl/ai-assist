import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAPTURES_ROOT = path.join(__dirname, '..', 'captures')
const BUCKET = 'live-captures'

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

/**
 * Upload local capture files to Supabase live-captures bucket.
 * @returns {Promise<Array<{ asin: string, files: Array<{ path: string, filename: string }> }>>}
 */
export async function syncLiveCaptures(runId) {
  const supabase = getSupabase()
  if (!supabase) {
    console.warn('[sync-live-captures] Supabase not configured — skip upload')
    return []
  }

  const runDir = path.join(CAPTURES_ROOT, runId)
  let entries
  try {
    entries = await fs.readdir(runDir, { withFileTypes: true })
  } catch {
    return []
  }

  const liveFiles = []

  for (const ent of entries) {
    if (!ent.isDirectory()) continue
    const asin = ent.name
    const asinDir = path.join(runDir, asin)
    const names = await fs.readdir(asinDir)
    const uploaded = []

    for (const name of names) {
      if (name === 'product-data.json' || name.endsWith('.png')) {
        const localPath = path.join(asinDir, name)
        const storagePath = `${runId}/${asin}/${name}`
        const buf = await fs.readFile(localPath)
        const contentType = name.endsWith('.png') ? 'image/png' : 'application/json'
        const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
          upsert: true,
          contentType,
        })
        if (error) {
          console.error(`[sync-live-captures] ${storagePath}:`, error.message)
        } else {
          uploaded.push({ path: storagePath, filename: name })
        }
      }
    }

    if (uploaded.length) {
      liveFiles.push({ asin, files: uploaded })
    }
  }

  if (liveFiles.length > 0) {
    try {
      await fs.rm(runDir, { recursive: true, force: true })
      console.log(`[sync-live-captures] removed local staging folder ${runId}`)
    } catch (err) {
      console.warn(`[sync-live-captures] cleanup failed for ${runId}:`, err.message)
    }
  }

  return liveFiles
}
