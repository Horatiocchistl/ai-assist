import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(cors())
app.use(express.json())

const HOME = process.env.HOME || '/home/node'
const REPORTS_DIR = path.join(__dirname, 'reports')
const SKILL_DIRS_FILE = path.join(__dirname, 'skill-dirs.json')
const SKILL_CACHE_DIR = path.join(HOME, '.computerui', 'skill-cache')
const REMOTE_CACHE_TTL_MS = 60 * 60 * 1000
const DEFAULT_SKILL_DIRS = [
  path.join(HOME, '.agents', 'skills'),
  path.join(__dirname, '.agents', 'skills'),
]

function isRemoteSkillDir(entry) {
  return /^https:\/\//i.test(entry.trim())
}

function ensureReportsDir() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true })
}

function generateReportId() {
  return `rpt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
}

function slugifyReportTitle(text) {
  let s = String(text || '').toLowerCase().trim()
  s = s.replace(/[^\w\s-]/g, '')
  s = s.replace(/[\s_-]+/g, '-')
  s = s.replace(/^-+|-+$/g, '')
  return s || 'report'
}

function extractReportTitle(content) {
  for (const line of String(content).split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('# ')) return trimmed.slice(2).trim()
  }
  return 'report'
}

function buildReportFilename(content, titleOverride, dateStrOverride) {
  const title = titleOverride?.trim() || extractReportTitle(content)
  const dateStr = dateStrOverride || new Date().toISOString().slice(0, 10)
  return `${dateStr}-${slugifyReportTitle(title)}.md`
}

const UNFILLED_PLACEHOLDER_RE = /\{\{[A-Z0-9_]+\}\}/g

function findUnfilledPlaceholders(content) {
  const matches = content.match(UNFILLED_PLACEHOLDER_RE)
  return matches ? [...new Set(matches)] : []
}

function fillDateTimePlaceholders(content, dateTimeStr) {
  return content.split('{{DATE_TIME}}').join(dateTimeStr)
}

function isSafeReportId(reportId) {
  return typeof reportId === 'string' && /^rpt_\d+_[a-f0-9]+$/.test(reportId)
}

ensureReportsDir()

function cacheKeyForUrl(url) {
  return crypto.createHash('sha256').update(url.trim()).digest('hex').slice(0, 16)
}

function parseGitHubUrl(url) {
  let parsed
  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') return null
  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const owner = parts[0]
  const repo = parts[1].replace(/\.git$/, '')
  let branch = null
  let subpath = ''
  if (parts[2] === 'tree' && parts[3]) {
    branch = parts[3]
    subpath = parts.slice(4).join('/')
  }
  return {
    owner,
    repo,
    branch,
    subpath,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
  }
}

function cacheDirForUrl(url) {
  return path.join(SKILL_CACHE_DIR, cacheKeyForUrl(url))
}

function isCacheFresh(cacheDir) {
  const marker = path.join(cacheDir, '.computerui-sync')
  try {
    if (!fs.existsSync(marker)) return false
    const age = Date.now() - fs.statSync(marker).mtimeMs
    return age < REMOTE_CACHE_TTL_MS
  } catch {
    return false
  }
}

function touchCacheMarker(cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(path.join(cacheDir, '.computerui-sync'), String(Date.now()))
}

async function rmDir(dir) {
  await fs.promises.rm(dir, { recursive: true, force: true })
}

async function syncGitHubUrl(url) {
  const gh = parseGitHubUrl(url)
  if (!gh) throw new Error('Only https://github.com/owner/repo URLs are supported')

  const repoCache = cacheDirForUrl(url)
  const scanRoot = gh.subpath ? path.join(repoCache, gh.subpath) : repoCache

  if (fs.existsSync(repoCache) && isCacheFresh(repoCache)) {
    return scanRoot
  }

  if (fs.existsSync(repoCache)) {
    await rmDir(repoCache)
  }

  fs.mkdirSync(SKILL_CACHE_DIR, { recursive: true })
  const cloneArgs = ['clone', '--depth', '1']
  if (gh.branch) cloneArgs.push('--branch', gh.branch)
  cloneArgs.push(gh.cloneUrl, repoCache)

  await execFileAsync('git', cloneArgs, { timeout: 120000 })

  if (gh.subpath) {
    const resolved = path.resolve(repoCache, gh.subpath)
    if (!resolved.startsWith(path.resolve(repoCache))) {
      throw new Error('Invalid subpath in GitHub URL')
    }
    if (!fs.existsSync(resolved)) {
      throw new Error(`Path not found in repo: ${gh.subpath}`)
    }
  }

  touchCacheMarker(repoCache)
  return scanRoot
}

async function resolveSkillDir(entry) {
  const trimmed = entry.trim()
  if (!trimmed) return null
  if (!isRemoteSkillDir(trimmed)) {
    return fs.existsSync(trimmed) ? trimmed : null
  }
  try {
    return await syncGitHubUrl(trimmed)
  } catch (err) {
    console.error(`Failed to resolve skill dir ${trimmed}:`, err.message)
    return null
  }
}

async function resolveSkillDirs() {
  const resolved = []
  for (const entry of getSkillDirs()) {
    const dir = await resolveSkillDir(entry)
    if (dir) resolved.push(dir)
  }
  return resolved
}

async function syncAllRemoteSkillDirs() {
  const errors = []
  for (const entry of getSkillDirs()) {
    if (!isRemoteSkillDir(entry)) continue
    try {
      await syncGitHubUrl(entry)
    } catch (err) {
      errors.push({ url: entry, error: err.message })
    }
  }
  return { ok: errors.length === 0, errors }
}

function loadSkillDirs() {
  try {
    if (fs.existsSync(SKILL_DIRS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SKILL_DIRS_FILE, 'utf-8'))
      if (Array.isArray(data)) return data
    }
  } catch { /* fall through to defaults */ }
  return DEFAULT_SKILL_DIRS
}

function saveSkillDirs(dirs) {
  fs.writeFileSync(SKILL_DIRS_FILE, JSON.stringify(dirs, null, 2))
  console.log(`Saved skill dirs to ${SKILL_DIRS_FILE}:`, dirs)
}

function getSkillDirs() {
  return loadSkillDirs()
}

function parseSkillFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const yaml = match[1]
  const result = {}
  for (const line of yaml.split('\n')) {
    const [key, ...rest] = line.split(':')
    if (key && rest.length) result[key.trim()] = rest.join(':').trim()
  }
  return result
}

function scanSkillsRecursive(dir, skills, depth = 0) {
  if (depth > 5 || !fs.existsSync(dir)) return
  const skillMdPath = path.join(dir, 'SKILL.md')
  if (fs.existsSync(skillMdPath)) {
    const content = fs.readFileSync(skillMdPath, 'utf-8')
    const meta = parseSkillFrontmatter(content)
    skills.push({
      name: meta.name || path.basename(dir),
      description: meta.description || '',
      location: skillMdPath,
    })
  }
  // Always recurse into subdirs (even if we found a SKILL.md here)
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue
      scanSkillsRecursive(path.join(dir, entry.name), skills, depth + 1)
    }
  } catch { /* permission denied etc */ }
}

async function scanSkills() {
  const skills = []
  const dirs = await resolveSkillDirs()
  for (const dir of dirs) {
    scanSkillsRecursive(dir, skills)
  }
  return skills
}

app.get('/api/skills', async (req, res) => {
  try {
    res.json(await scanSkills())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/skills/:name', async (req, res) => {
  const skills = await scanSkills()
  const skill = skills.find(s => s.name === req.params.name)
  if (!skill) return res.status(404).json({ error: 'Skill not found' })
  const content = fs.readFileSync(skill.location, 'utf-8')
  const skillDir = path.dirname(skill.location)
  const resources = []
  const referenceContents = {}
  for (const sub of ['scripts', 'references', 'assets']) {
    const subDir = path.join(skillDir, sub)
    if (fs.existsSync(subDir)) {
      fs.readdirSync(subDir).forEach(f => {
        resources.push(`${sub}/${f}`)
        if (sub === 'references' && f.endsWith('.md')) {
          try {
            referenceContents[`${sub}/${f}`] = fs.readFileSync(path.join(subDir, f), 'utf-8')
          } catch { /* skip unreadable */ }
        }
      })
    }
  }
  res.json({ ...skill, content, resources, referenceContents })
})

app.get('/api/skill-dirs', (req, res) => {
  res.json(getSkillDirs())
})

app.post('/api/skill-dirs', (req, res) => {
  const { dirs } = req.body
  if (!Array.isArray(dirs)) return res.status(400).json({ error: 'dirs must be an array' })
  const cleaned = dirs.map(d => d.trim()).filter(Boolean)
  saveSkillDirs(cleaned)
  res.json(cleaned)
})

app.post('/api/skill-dirs/sync', async (req, res) => {
  try {
    const result = await syncAllRemoteSkillDirs()
    res.json(result)
  } catch (err) {
    res.status(500).json({ ok: false, errors: [{ url: '', error: err.message }] })
  }
})

async function resolveWeatherScriptPath() {
  const skills = await scanSkills()
  const found = skills.find(s => s.name === 'weather')
  if (!found) return null
  const skillDir = path.dirname(found.location)
  const candidates = [
    path.join(skillDir, 'scripts', 'get_weather.py'),
    path.join(skillDir, 'get_weather.py'),
  ]
  for (const scriptPath of candidates) {
    if (fs.existsSync(scriptPath)) return { scriptPath, skillDir }
  }
  return null
}

async function resolveMarkdownReportScriptPath() {
  const skills = await scanSkills()
  const found = skills.find(s => s.name === 'markdown-report')
  if (!found) return null
  const skillDir = path.dirname(found.location)
  const candidates = [
    path.join(skillDir, 'scripts', 'save_report.py'),
    path.join(skillDir, 'save_report.py'),
  ]
  for (const scriptPath of candidates) {
    if (fs.existsSync(scriptPath)) return { scriptPath, skillDir }
  }
  return null
}

async function resolveDatetimeScriptPath() {
  const skills = await scanSkills()
  const found = skills.find(s => s.name === 'datetime')
  if (!found) return null
  const skillDir = path.dirname(found.location)
  const candidates = [
    path.join(skillDir, 'scripts', 'get_datetime.py'),
    path.join(skillDir, 'get_datetime.py'),
  ]
  for (const scriptPath of candidates) {
    if (fs.existsSync(scriptPath)) return { scriptPath, skillDir }
  }
  return null
}

async function runGetDatetime(format = 'human', timezone) {
  const resolved = await resolveDatetimeScriptPath()
  if (!resolved) return null
  const { scriptPath, skillDir } = resolved
  const fmt = ['human', 'iso', 'full'].includes(format) ? format : 'human'
  const pyArgs = [scriptPath, '--format', fmt]
  if (timezone && typeof timezone === 'string' && timezone.trim()) {
    pyArgs.push('--timezone', timezone.trim())
  }
  const env = { ...process.env, SKILL_DIR: skillDir }
  const { stdout } = await execFileAsync(
    'python3',
    pyArgs,
    {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      cwd: skillDir,
      env,
    },
  )
  return (stdout || '').trim()
}

app.post('/api/datetime', async (req, res) => {
  const { format = 'human', timezone } = req.body || {}
  const fmt = format === 'iso' || format === 'full' ? format : 'human'
  try {
    const resolved = await resolveDatetimeScriptPath()
    if (!resolved) {
      return res.status(404).json({ error: 'datetime skill or get_datetime.py not found' })
    }
    const { scriptPath, skillDir } = resolved
    const pyArgs = [scriptPath, '--format', fmt]
    if (timezone && typeof timezone === 'string' && timezone.trim()) {
      pyArgs.push('--timezone', timezone.trim())
    }
    const env = { ...process.env, SKILL_DIR: skillDir }
    const { stdout, stderr } = await execFileAsync(
      'python3',
      pyArgs,
      {
        timeout: 15000,
        maxBuffer: 1024 * 1024,
        cwd: skillDir,
        env,
      },
    )
    res.json({ stdout: stdout || '', stderr: stderr || '', exitCode: 0 })
  } catch (err) {
    const exitCode = err.code === 'ENOENT' ? 127 : (typeof err.code === 'number' ? err.code : 1)
    res.json({
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || '',
      exitCode,
    })
  }
})

app.post('/api/save-markdown-report', async (req, res) => {
  const { content, title, conversationId, projectId } = req.body || {}
  if (!conversationId || typeof conversationId !== 'string') {
    return res.status(400).json({ error: 'conversationId is required' })
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'content is required' })
  }
  try {
    const resolved = await resolveMarkdownReportScriptPath()
    if (!resolved) {
      return res.status(404).json({ error: 'markdown-report skill or save_report.py not found' })
    }
    ensureReportsDir()
    const createdAt = new Date().toISOString()
    const dateStr = createdAt.slice(0, 10)

    let body = content
    let dateTimeDisplay = null
    if (body.includes('{{DATE_TIME}}')) {
      dateTimeDisplay = await runGetDatetime('human')
      if (!dateTimeDisplay) {
        return res.status(404).json({
          error: 'datetime skill or get_datetime.py not found (required for {{DATE_TIME}})',
          exitCode: 1,
        })
      }
      body = fillDateTimePlaceholders(body, dateTimeDisplay)
    }

    const unfilled = findUnfilledPlaceholders(body)
    if (unfilled.length) {
      return res.status(400).json({
        error: `Unfilled placeholders: ${unfilled.join(', ')}`,
        exitCode: 1,
      })
    }

    const reportId = generateReportId()
    const displayFilename = buildReportFilename(body, title, dateStr)
    const mdFilename = `${reportId}.md`
    const inputPath = path.join(REPORTS_DIR, `${reportId}.input.md`)
    const outputPath = path.join(REPORTS_DIR, mdFilename)
    const metaPath = path.join(REPORTS_DIR, `${reportId}.meta.json`)

    fs.writeFileSync(inputPath, body, 'utf-8')

    const { scriptPath, skillDir } = resolved
    const env = { ...process.env, SKILL_DIR: skillDir }
    const { stdout, stderr } = await execFileAsync(
      'python3',
      [scriptPath, '--input', inputPath, '--output', mdFilename],
      {
        timeout: 15000,
        maxBuffer: 1024 * 1024,
        cwd: REPORTS_DIR,
        env,
      },
    )
    try { fs.unlinkSync(inputPath) } catch { /* best effort */ }

    if (!fs.existsSync(outputPath)) {
      return res.status(500).json({
        error: 'save_report.py did not create output file',
        stdout: stdout || '',
        stderr: stderr || '',
      })
    }

    const meta = {
      reportId,
      conversationId,
      projectId: projectId || null,
      filename: displayFilename,
      dateTimeDisplay,
      status: 'draft',
      createdAt,
    }
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')

    res.json({
      reportId,
      filename: displayFilename,
      draftPath: outputPath,
      stdout: stdout?.trim() || '',
    })
  } catch (err) {
    const exitCode = err.code === 'ENOENT' ? 127 : (typeof err.code === 'number' ? err.code : 1)
    res.json({
      error: err.message || 'Failed to save report',
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || '',
      exitCode,
    })
  }
})

app.get('/api/reports/:id', (req, res) => {
  const reportId = req.params.id
  if (!isSafeReportId(reportId)) {
    return res.status(400).json({ error: 'Invalid report id' })
  }
  const metaPath = path.join(REPORTS_DIR, `${reportId}.meta.json`)
  const mdPath = path.join(REPORTS_DIR, `${reportId}.md`)
  if (!fs.existsSync(metaPath) || !fs.existsSync(mdPath)) {
    return res.status(404).json({ error: 'Report not found' })
  }
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    const content = fs.readFileSync(mdPath, 'utf-8')
    res.json({ ...meta, content, draftPath: mdPath })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/weather', async (req, res) => {
  const { location, format = 'json', forecast_days: forecastDaysRaw } = req.body || {}
  if (!location || typeof location !== 'string' || !location.trim()) {
    return res.status(400).json({ error: 'location is required' })
  }
  const fmt = format === 'human' ? 'human' : 'json'
  let forecastDays = 7
  if (forecastDaysRaw != null && forecastDaysRaw !== '') {
    const n = Number(forecastDaysRaw)
    if (!Number.isInteger(n) || n < 1 || n > 16) {
      return res.status(400).json({ error: 'forecast_days must be an integer from 1 to 16' })
    }
    forecastDays = n
  }
  try {
    const resolved = await resolveWeatherScriptPath()
    if (!resolved) {
      return res.status(404).json({ error: 'Weather skill or get_weather.py not found' })
    }
    const { scriptPath, skillDir } = resolved
    const env = { ...process.env, SKILL_DIR: skillDir }
    if (!env.SSL_CERT_FILE && fs.existsSync('/etc/ssl/cert.pem')) {
      env.SSL_CERT_FILE = '/etc/ssl/cert.pem'
    }
    const pyArgs = [scriptPath, location.trim(), '--format', fmt, '--forecast-days', String(forecastDays)]
    const { stdout, stderr } = await execFileAsync(
      'python3',
      pyArgs,
      {
        timeout: 15000,
        maxBuffer: 1024 * 1024,
        cwd: skillDir,
        env,
      },
    )
    res.json({ stdout: stdout || '', stderr: stderr || '', exitCode: 0 })
  } catch (err) {
    const exitCode = err.code === 'ENOENT' ? 127 : (typeof err.code === 'number' ? err.code : 1)
    res.json({
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || '',
      exitCode,
    })
  }
})

app.post('/api/run-script', async (req, res) => {
  const { skill, script } = req.body
  if (!skill || !script) return res.status(400).json({ error: 'skill and script are required' })

  // Prevent path traversal in script name
  if (script.includes('..') || script.includes('/') || script.includes('\\')) {
    return res.status(400).json({ error: 'Invalid script name' })
  }

  try {
    const skills = await scanSkills()
    const found = skills.find(s => s.name === skill)
    if (!found) return res.status(404).json({ error: `Skill "${skill}" not found` })

    const skillDir = path.dirname(found.location)
    const scriptPath = path.resolve(skillDir, 'scripts', script)

    if (!scriptPath.startsWith(path.resolve(skillDir))) {
      return res.status(400).json({ error: 'Invalid script path' })
    }

    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ error: `Script "${script}" not found in skill "${skill}"` })
    }

    try { fs.chmodSync(scriptPath, 0o755) } catch { /* best effort */ }

    execFile(scriptPath, [], {
      timeout: 10000,
      maxBuffer: 1024 * 1024,
      cwd: skillDir,
      env: { ...process.env, SKILL_DIR: skillDir },
    }, (error, stdout, stderr) => {
      const exitCode = error ? (error.code || 1) : 0
      res.json({ stdout: stdout || '', stderr: stderr || '', exitCode })
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/browse', (req, res) => {
  const dir = req.query.path || HOME
  try {
    const resolved = path.resolve(dir)
    const entries = fs.readdirSync(resolved, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(e => ({ name: e.name, path: path.join(resolved, e.name) }))
    res.json({ current: resolved, parent: path.dirname(resolved), dirs: entries })
  } catch (err) {
    res.status(400).json({ error: `Cannot read directory: ${err.message}` })
  }
})

// Health check for Electron startup
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Serve React static files in production
const distPath = path.join(__dirname, 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
}

app.get('/api/fetch-url', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'url parameter required' })
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'AI-Assist-v1/1.0' },
      signal: AbortSignal.timeout(10000),
    })
    const html = await response.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    res.json({ url, text: text.slice(0, 50000) })
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch URL', detail: e.message })
  }
})

app.get('/api/models', async (req, res) => {
  try {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://host.docker.internal:11434'
    const response = await fetch(`${ollamaHost}/api/tags`)
    const data = await response.json()
    res.json(data)
  } catch (e) {
    res.status(503).json({ error: 'Ollama not reachable', detail: e.message })
  }
})

// ─── Gap Analyzer ─────────────────────────────────────────────────────────────

// In-memory run registry — single-consultant tool, one run at a time
const gapRuns = new Map() // runId -> { status, asins, logs, listeners, abortController }

// GET /api/gap-analyzer/config  — returns which integrations are configured
app.get('/api/gap-analyzer/config', (req, res) => {
  res.json({
    apifyConfigured: !!process.env.APIFY_TOKEN,
  })
})

function gapRunId() {
  return `gap_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`
}

function createRun(asins) {
  const runId = gapRunId()
  const run = {
    runId,
    status: 'running',
    asins,
    logs: [],
    listeners: new Set(),
    abortController: new AbortController(),
  }
  gapRuns.set(runId, run)
  return run
}

function emitToRun(run, event) {
  const line = `data: ${JSON.stringify(event)}\n\n`
  run.logs.push(event)
  for (const res of run.listeners) {
    try { res.write(line) } catch { /* client disconnected */ }
  }
}

// POST /api/gap-analyzer/run  — start a new run
app.post('/api/gap-analyzer/run', async (req, res) => {
  const { asins } = req.body
  if (!Array.isArray(asins) || asins.length === 0) {
    return res.status(400).json({ error: 'asins array required' })
  }
  if (asins.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 ASINs per run' })
  }

  // Stop any currently active run first
  for (const [, existing] of gapRuns) {
    if (existing.status === 'running') {
      existing.abortController.abort()
      existing.status = 'stopped'
    }
  }

  const run = createRun(asins)

  // Import and start the orchestrator asynchronously — don't await
  ;(async () => {
    try {
      const { runAnalysis } = await import('./browser-agent/run-orchestrator.js')
      await runAnalysis(
        run.runId,
        asins,
        (event) => emitToRun(run, event),
        run.abortController.signal
      )
      run.status = 'complete'
    } catch (err) {
      emitToRun(run, { type: 'log', level: 'error', msg: `Fatal run error: ${err.message}` })
      run.status = 'error'
    } finally {
      emitToRun(run, { type: 'run_status', status: run.status })
      // Close all SSE connections
      for (const res of run.listeners) {
        try { res.end() } catch { /* already closed */ }
      }
      run.listeners.clear()
    }
  })()

  res.json({ runId: run.runId })
})

// GET /api/gap-analyzer/run/:runId/stream  — SSE event stream
app.get('/api/gap-analyzer/run/:runId/stream', (req, res) => {
  const run = gapRuns.get(req.params.runId)
  if (!run) return res.status(404).json({ error: 'Run not found' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Replay all events logged so far (client may connect after run starts)
  for (const event of run.logs) {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  // If run already finished, close immediately
  if (run.status !== 'running') {
    res.write(`data: ${JSON.stringify({ type: 'run_status', status: run.status })}\n\n`)
    res.end()
    return
  }

  run.listeners.add(res)

  req.on('close', () => {
    run.listeners.delete(res)
  })
})

// POST /api/gap-analyzer/run/:runId/stop  — abort a running run
app.post('/api/gap-analyzer/run/:runId/stop', (req, res) => {
  const run = gapRuns.get(req.params.runId)
  if (!run) return res.status(404).json({ error: 'Run not found' })
  if (run.status !== 'running') return res.json({ status: run.status })

  run.abortController.abort()
  run.status = 'stopped'
  emitToRun(run, { type: 'log', level: 'warn', msg: 'Run stopped by user' })
  emitToRun(run, { type: 'run_status', status: 'stopped' })

  res.json({ status: 'stopped' })
})

// GET /api/gap-analyzer/captures/:runId/:asin/:filename  — serve captured screenshots
app.get('/api/gap-analyzer/captures/:runId/:asin/:filename', (req, res) => {
  const { runId, asin, filename } = req.params
  // Path traversal guard
  if ([runId, asin, filename].some(p => p.includes('..') || p.includes('/'))) {
    return res.status(400).json({ error: 'Invalid path' })
  }
  const filePath = path.join(__dirname, 'captures', runId, asin, filename)
  if (!fs.existsSync(filePath)) return res.status(404).end()
  res.sendFile(filePath)
})

// ─── End Gap Analyzer ──────────────────────────────────────────────────────────

// Catch-all: serve index.html for client-side routing (production)
if (fs.existsSync(distPath)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

const PORT = process.env.PORT || 3001
app.listen(PORT, '0.0.0.0', () => {
  console.log(`AI Assist v1 server running on :${PORT}`)
})
