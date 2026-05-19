import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const NOTES_ROOT = path.join(__dirname, '..', 'captures', 'notes')
const REPORTS_ROOT = path.join(__dirname, '..', 'reports')
const PLANNED_BUCKET = 'planned-assets'
const LIVE_BUCKET = 'live-captures'

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function getOllamaHost() {
  return process.env.OLLAMA_HOST || process.env.VITE_OLLAMA_HOST || 'http://localhost:11434'
}

// ─── Image download ─────────────────────────────────────────────────────────

async function downloadBase64(supabase, bucket, storagePath) {
  const { data: blob, error } = await supabase.storage.from(bucket).download(storagePath)
  if (error) throw new Error(`Download failed ${storagePath}: ${error.message}`)
  return Buffer.from(await blob.arrayBuffer()).toString('base64')
}

// ─── Notes file (external working memory) ───────────────────────────────────

function notesPath(runId, asin) {
  return path.join(NOTES_ROOT, runId, asin, 'observations.md')
}

async function ensureNotesDir(runId, asin) {
  await fs.mkdir(path.join(NOTES_ROOT, runId, asin), { recursive: true })
}

async function saveObservation(runId, asin, section, text) {
  await ensureNotesDir(runId, asin)
  const entry = `\n## ${section}\n\n${text}\n`
  await fs.appendFile(notesPath(runId, asin), entry, 'utf-8')
}

async function readObservations(runId, asin) {
  try {
    return await fs.readFile(notesPath(runId, asin), 'utf-8')
  } catch {
    return ''
  }
}

async function cleanupNotes(runId, asin) {
  try {
    await fs.rm(path.join(NOTES_ROOT, runId, asin), { recursive: true, force: true })
  } catch { /* best effort */ }
}

// ─── Skill loading ───────────────────────────────────────────────────────────

async function loadSkillSchema() {
  const schemaPath = path.join(__dirname, '..', 'gap-analysis', 'references', 'schema.json')
  try {
    const raw = await fs.readFile(schemaPath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function buildSystemPrompt() {
  const skillPath = path.join(__dirname, '..', 'gap-analysis')
  const parts = []

  try {
    const main = await fs.readFile(path.join(skillPath, 'SKILL.md'), 'utf-8')
    parts.push(main)
  } catch { /* skill not found */ }

  for (const ref of ['sections.md', 'gap-types.md', 'severity.md', 'cpg-context.md']) {
    try {
      const content = await fs.readFile(path.join(skillPath, 'references', ref), 'utf-8')
      parts.push(content)
    } catch { /* skip missing refs */ }
  }

  return parts.join('\n\n---\n\n')
}

// ─── Ollama call ─────────────────────────────────────────────────────────────

async function callOllama(systemPrompt, userText, images = []) {
  const userMsg = { role: 'user', content: userText }
  if (images.length) userMsg.images = images

  const res = await fetch(`${getOllamaHost()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'ministral-3:14b',
      format: 'json',
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        userMsg,
      ],
      options: { temperature: 0.1, num_ctx: 8192, num_gpu: 99 },
    }),
  })

  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`)
  const data = await res.json()

  try {
    return JSON.parse(data.message.content)
  } catch {
    return { raw: data.message.content }
  }
}

// ─── Tool implementations ─────────────────────────────────────────────────────

async function toolListSections(supabase, runId, asin) {
  const { data, error } = await supabase.storage
    .from(LIVE_BUCKET)
    .list(`${runId}/${asin}`, { limit: 200 })

  if (error) return { sections: [], files: [] }

  const files = (data || []).filter(f => f.id != null).map(f => f.name)
  const sections = []

  if (files.find(f => f === 'hero_viewport.png')) sections.push('hero')

  const carouselNums = files
    .filter(f => /^carousel_\d+\.png$/i.test(f))
    .map(f => parseInt(f.match(/(\d+)/)[1]))
    .sort((a, b) => a - b)
  carouselNums.forEach(n => sections.push(`carousel_${String(n).padStart(2, '0')}`))

  const aplusNums = files
    .filter(f => /^aplus_\d+\.png$/i.test(f))
    .map(f => parseInt(f.match(/(\d+)/)[1]))
    .sort((a, b) => a - b)
  aplusNums.forEach(n => sections.push(`aplus_${String(n).padStart(2, '0')}`))

  if (files.find(f => f === 'product-data.json')) sections.push('copy')

  return { sections, files }
}

async function toolViewPlannedImage(supabase, engagementId, asin, index) {
  const { data: plan } = await supabase
    .from('asin_plans')
    .select('images, engagement_id')
    .eq('asin', asin)
    .eq('engagement_id', engagementId)
    .single()

  if (!plan?.images?.length) return { error: 'No planned images found' }

  const sorted = [...plan.images].sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0))
  const img = sorted[index ?? 0]
  if (!img) return { error: `No planned image at index ${index}` }

  const base64 = await downloadBase64(supabase, PLANNED_BUCKET, img.path)
  return { base64, filename: img.filename, label: img.label, index, total: sorted.length }
}

async function toolViewLiveSection(supabase, runId, asin, section) {
  let filename
  if (section === 'hero') {
    filename = 'hero_viewport.png'
  } else {
    const m = section.match(/^(carousel|aplus)_(\d+)$/)
    if (!m) return { error: `Unknown section: ${section}` }
    filename = `${m[1]}_${parseInt(m[2])}.png`
  }

  const storagePath = `${runId}/${asin}/${filename}`
  try {
    const base64 = await downloadBase64(supabase, LIVE_BUCKET, storagePath)
    return { base64, section, filename }
  } catch (err) {
    return { error: err.message }
  }
}

async function toolReadAnnotations(supabase, runId, asin, section) {
  const { data } = await supabase
    .from('asin_annotations')
    .select('section, note, severity')
    .eq('run_id', runId)
    .eq('asin', asin)

  const relevant = (data || []).filter(r => r.section?.startsWith(section))
  if (!relevant.length) return { notes: [] }
  return {
    notes: relevant.map(r => ({
      key: r.section,
      note: r.note,
      severity: r.severity,
    })),
  }
}

async function toolReadCopySpec(supabase, engagementId, asin) {
  const { data } = await supabase
    .from('asin_plans')
    .select('copy_spec')
    .eq('asin', asin)
    .eq('engagement_id', engagementId)
    .single()

  if (!data?.copy_spec) return { copy_spec: null }
  return { copy_spec: data.copy_spec }
}

async function toolReadProductData(supabase, runId, asin) {
  const storagePath = `${runId}/${asin}/product-data.json`
  try {
    const { data: blob, error } = await supabase.storage.from(LIVE_BUCKET).download(storagePath)
    if (error) return { product_data: null }
    const text = await blob.text()
    return { product_data: JSON.parse(text) }
  } catch {
    return { product_data: null }
  }
}

async function toolWriteGapFinding(supabase, runId, asin, finding) {
  const { category, section, gap_type, severity, description } = finding
  const { error } = await supabase.from('gaps').insert({
    run_id: runId,
    asin,
    category: category || null,
    section: section || null,
    gap_type: gap_type || null,
    severity: severity || null,
    description: description || null,
  })
  if (error) throw new Error(`Gap insert failed: ${error.message}`)
  return { ok: true }
}

async function toolWriteReport(runId, asin, markdown) {
  await fs.mkdir(REPORTS_ROOT, { recursive: true })
  const filename = `gap_${runId}_${asin}.md`
  await fs.writeFile(path.join(REPORTS_ROOT, filename), markdown, 'utf-8')
  return { ok: true, filename }
}

// ─── Tool dispatch ────────────────────────────────────────────────────────────

async function dispatchTool(name, args, ctx) {
  const { supabase, runId, asin, engagementId, emit } = ctx

  switch (name) {
    case 'list_gap_sections':
      return toolListSections(supabase, runId, asin)

    case 'view_planned_image':
      emit({ type: 'llm_progress', msg: `Viewing planned image ${args.index ?? 0}…` })
      return toolViewPlannedImage(supabase, engagementId, asin, args.index ?? 0)

    case 'view_live_section':
      emit({ type: 'llm_progress', msg: `Viewing live capture: ${args.section}…` })
      return toolViewLiveSection(supabase, runId, asin, args.section)

    case 'read_annotations':
      return toolReadAnnotations(supabase, runId, asin, args.section)

    case 'read_copy_spec':
      return toolReadCopySpec(supabase, engagementId, asin)

    case 'read_product_data':
      return toolReadProductData(supabase, runId, asin)

    case 'save_observation':
      await saveObservation(runId, asin, args.section, args.text)
      emit({ type: 'llm_progress', msg: `Notes saved: ${args.section}` })
      return { ok: true }

    case 'read_observations':
      return { observations: await readObservations(runId, asin) }

    case 'write_gap_finding': {
      const result = await toolWriteGapFinding(supabase, runId, asin, args)
      emit({ type: 'llm_gap', gap: args })
      return result
    }

    case 'write_report':
      return toolWriteReport(runId, asin, args.markdown)

    case 'complete_analysis':
      return { ok: true, done: true }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ─── Tool definitions (sent to Ollama) ───────────────────────────────────────

const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'list_gap_sections',
      description: 'List the sections available for this ASIN based on actual captured files. Call this first.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'view_planned_image',
      description: 'View one planned asset image by index. Returns base64 image. Process one at a time.',
      parameters: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: 'Image index (0-based)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'view_live_section',
      description: 'View the live capture for one section. Returns base64 image. Process one section at a time.',
      parameters: {
        type: 'object',
        required: ['section'],
        properties: {
          section: { type: 'string', description: 'Section name: hero, carousel_01, carousel_02, aplus_01, etc.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_annotations',
      description: 'Read the human consultant\'s notes for a section.',
      parameters: {
        type: 'object',
        required: ['section'],
        properties: {
          section: { type: 'string', description: 'Section name' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_copy_spec',
      description: 'Read the planned copy specification for this ASIN.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_product_data',
      description: 'Read the live product data: title, bullets, specs, description.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_observation',
      description: 'Save your observation for a section to your working notes. Call after each section.',
      parameters: {
        type: 'object',
        required: ['section', 'text'],
        properties: {
          section: { type: 'string', description: 'Section name or "plan" or "copy"' },
          text: { type: 'string', description: 'Your observation text' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_observations',
      description: 'Read all your accumulated notes. Call this when ready to synthesise findings.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_gap_finding',
      description: 'Write one gap finding. Call once per finding.',
      parameters: {
        type: 'object',
        required: ['category', 'gap_type', 'severity', 'description'],
        properties: {
          category: { type: 'string', description: 'One of: image_assets, text_on_images, carousel_order, aplus_content, product_text, image_text_diff, cpg_custom' },
          section: { type: 'string', description: 'Page section this finding relates to' },
          gap_type: { type: 'string', description: 'Gap type from schema' },
          severity: { type: 'string', description: 'Severity from schema: flag, review, or note' },
          description: { type: 'string', description: 'Clear, specific description of what you observed' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_report',
      description: 'Write the final markdown narrative report summarising all findings.',
      parameters: {
        type: 'object',
        required: ['markdown'],
        properties: {
          markdown: { type: 'string', description: 'Full markdown report content' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_analysis',
      description: 'Signal that analysis is complete. Call this last.',
      parameters: { type: 'object', properties: {} },
    },
  },
]

// ─── Main tool loop ───────────────────────────────────────────────────────────

async function runToolLoop(systemPrompt, initialUserText, ctx, maxTurns = 40) {
  const messages = [{ role: 'user', content: initialUserText }]
  let gapCount = 0
  let done = false

  for (let turn = 0; turn < maxTurns && !done; turn++) {
    const body = {
      model: 'ministral-3:14b',
      stream: false,
      tools: TOOL_DEFS,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      options: { temperature: 0.1, num_ctx: 8192, num_gpu: 99 },
    }

    const res = await fetch(`${getOllamaHost()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`)
    const data = await res.json()
    const msg = data.message

    messages.push(msg)

    if (!msg.tool_calls?.length) {
      // No more tool calls — LLM is done
      done = true
      break
    }

    // Execute each tool call
    for (const tc of msg.tool_calls) {
      const name = tc.function?.name
      let args = {}
      try {
        args = typeof tc.function?.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : (tc.function?.arguments ?? {})
      } catch { /* malformed args — use empty */ }

      let result
      try {
        result = await dispatchTool(name, args, ctx)
        if (result?.done) done = true
        if (name === 'write_gap_finding') gapCount++
      } catch (err) {
        result = { error: err.message }
      }

      // If this tool returned image base64, inject it into the tool result message
      const toolContent = result?.base64
        ? JSON.stringify({ ...result, base64: '[image attached]' })
        : JSON.stringify(result)

      const toolMsg = { role: 'tool', content: toolContent }

      // Attach base64 image to the follow-up user message so the LLM can see it
      if (result?.base64) {
        messages.push({ role: 'tool', content: toolContent })
        messages.push({ role: 'user', content: 'Image attached above.', images: [result.base64] })
      } else {
        messages.push(toolMsg)
      }
    }
  }

  return gapCount
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function analyzeLlmGaps(runId, asin, engagementId, emit) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase not configured')

  emit({ type: 'llm_progress', msg: `Starting analysis for ${asin}…` })

  const systemPrompt = await buildSystemPrompt()
  if (!systemPrompt.trim()) {
    throw new Error('gap-analysis skill not found — check skill-dirs.json includes the gap-analysis folder')
  }

  const ctx = { supabase, runId, asin, engagementId, emit }

  const initialPrompt = `You are analyzing ASIN ${asin} from run ${runId}.

Start by calling list_gap_sections to see what sections are available, then follow the workflow in the skill instructions. Work one section at a time. Save your observations after each section before moving to the next.`

  emit({ type: 'llm_progress', msg: 'LLM tool loop started…' })

  let gapCount = 0
  try {
    gapCount = await runToolLoop(systemPrompt, initialPrompt, ctx)
  } finally {
    await cleanupNotes(runId, asin)
  }

  emit({ type: 'llm_complete', count: gapCount })
}
