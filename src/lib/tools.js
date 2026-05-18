import supabase from './supabase.js'

function getApiBase() {
  if (typeof window !== 'undefined' && window.location?.port && window.location.port !== '5173') {
    return window.location.origin
  }
  return 'http://localhost:3001'
}

// --- Skill tools ---

const SKILL_TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: 'List all available skills with their names and descriptions',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_skill',
      description: 'Read the full content of a skill by name, including its instructions and resources',
      parameters: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'The skill name' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_script',
      description: 'Run an executable script from a skill\'s scripts/ folder and return its output',
      parameters: {
        type: 'object',
        required: ['skill', 'script'],
        properties: {
          skill: { type: 'string', description: 'The skill name that contains the script' },
          script: { type: 'string', description: 'The script filename (e.g. get-datetime.sh)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_markdown_report',
      description: 'Save formatted markdown as a draft report (right panel preview). Put the FULL report body ONLY in this tool call — never in chat. After success, reply with one short confirmation sentence only.',
      parameters: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', description: 'The complete markdown report content' },
          title: { type: 'string', description: 'Optional title for the filename (defaults to first H1)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_datetime',
      description: 'Get the current date and time. Call before filling {{DATE_TIME}} in markdown-report templates (use format human for reports).',
      parameters: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['human', 'iso', 'full'], description: 'Output format (default human)' },
          timezone: { type: 'string', description: 'Optional timezone, e.g. America/Chicago' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_saved_document',
      description: 'Read a permanently saved conversation document by id. Use only when the user asks about a saved document; drafts are shown in the right preview panel.',
      parameters: {
        type: 'object',
        required: ['document_id'],
        properties: {
          document_id: { type: 'string', description: 'Saved document UUID' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'REQUIRED for all weather questions — the only allowed method. Pass location exactly as the user provided: use their zip if they gave a zip; use "City, ST" if they gave both; never shorten to city name alone when they gave more. If only an ambiguous city name, ask for state/zip before calling. On failure, tell the user the exact tool error text (do not invent weather).',
      parameters: {
        type: 'object',
        required: ['location'],
        properties: {
          location: { type: 'string', description: 'Verbatim location from the user: zip code, "City, State", or lat,lon — do not guess or simplify' },
          format: { type: 'string', enum: ['json', 'human'], description: 'Output format (default json)' },
          forecast_days: { type: 'integer', description: 'Forecast length 1-16 days (default 7). Increase to include a future date.' },
        },
      },
    },
  },
]

// --- Project / conversation tools ---

const PROJECT_TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'list_project_conversations',
      description: 'List all conversations in the current project with their titles, IDs, and timestamps',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_conversation',
      description: 'Read the full message history of a conversation given its ID',
      parameters: {
        type: 'object',
        required: ['conversation_id'],
        properties: {
          conversation_id: { type: 'string', description: 'The conversation ID to read' },
        },
      },
    },
  },
]

// --- Combined exports ---

export const SKILL_TOOLS = [...SKILL_TOOL_DEFS]
export const ALL_TOOLS = [...SKILL_TOOL_DEFS, ...PROJECT_TOOL_DEFS]

export const KNOWN_TOOL_NAMES = ALL_TOOLS.map(t => t.function.name)

const DOCUMENT_REQUEST_RE = /\b(document|report|markdown|as a doc|write up|breakdown)\b/i

export function isDocumentRequest(text) {
  return DOCUMENT_REQUEST_RE.test(text || '')
}

// --- Skill executors ---

async function execListSkills() {
  const res = await fetch(`${getApiBase()}/api/skills`)
  const skills = await res.json()
  return JSON.stringify(skills.map(s => ({ name: s.name, description: s.description })))
}

async function execReadSkill(args) {
  const res = await fetch(`${getApiBase()}/api/skills/${encodeURIComponent(args.name)}`)
  if (!res.ok) return `Error: Skill "${args.name}" not found`
  const skill = await res.json()
  const resources = skill.resources?.length
    ? `\nResources: ${skill.resources.join(', ')}`
    : ''
  let refs = ''
  if (skill.referenceContents && Object.keys(skill.referenceContents).length) {
    refs = '\n\n--- Reference files ---\n' + Object.entries(skill.referenceContents)
      .map(([p, body]) => `### ${p}\n\n${body}`)
      .join('\n\n')
  }
  return `Skill: ${skill.name}\nLocation: ${skill.location}\n\n${skill.content}${resources}${refs}`
}

async function execRunScript(args) {
  const { skill, script } = args
  if (!skill || !script) return 'Error: skill and script are required'
  try {
    const res = await fetch(`${getApiBase()}/api/run-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill, script }),
    })
    const data = await res.json()
    if (!res.ok) return `Error: ${data.error}`
    if (data.exitCode !== 0) return `Script error (exit ${data.exitCode}):\n${data.stderr || data.stdout}`
    return data.stdout || '(no output)'
  } catch (err) {
    return `Error running script: ${err.message}`
  }
}

async function execSaveMarkdownReport(args, context) {
  const { content, title } = args
  const conversationId = context?.conversationId
  if (!conversationId) return 'Error: no active conversation'
  if (!content?.trim()) return 'Error: content is required'
  try {
    const body = {
      content,
      conversationId,
      projectId: context?.projectId || null,
    }
    if (title) body.title = title
    const res = await fetch(`${getApiBase()}/api/save-markdown-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) return `Error: ${data.error || 'Failed to save report'}`
    if (data.exitCode != null && data.exitCode !== 0) {
      return `Error: save_report.py failed (exit ${data.exitCode}):\n${data.stderr || data.stdout || data.error}`
    }
    if (!data.reportId) {
      return `Error: ${data.error || 'No reportId returned'}`
    }
    return JSON.stringify({
      ok: true,
      reportId: data.reportId,
      filename: data.filename,
      draftPath: data.draftPath,
      status: 'draft',
    })
  } catch (err) {
    return `Error saving report: ${err.message}`
  }
}

async function execGetDatetime(args) {
  const { format, timezone } = args
  try {
    const body = { format: format || 'human' }
    if (timezone) body.timezone = timezone
    const res = await fetch(`${getApiBase()}/api/datetime`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) return `Error: ${data.error}`
    if (data.exitCode !== 0) return `Datetime script error (exit ${data.exitCode}):\n${data.stderr || data.stdout}`
    return data.stdout || '(no output)'
  } catch (err) {
    return `Error fetching datetime: ${err.message}`
  }
}

async function execGetWeather(args) {
  const { location, format, forecast_days } = args
  if (!location) return 'Error: location is required'
  try {
    const body = { location, format: format || 'json' }
    if (forecast_days != null) body.forecast_days = forecast_days
    const res = await fetch(`${getApiBase()}/api/weather`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) return `Error: ${data.error}`
    if (data.exitCode !== 0) return `Weather script error (exit ${data.exitCode}):\n${data.stderr || data.stdout}`
    return data.stdout || '(no output)'
  } catch (err) {
    return `Error fetching weather: ${err.message}`
  }
}

// --- Project executors ---

async function execListProjectConversations(args, context) {
  const projectId = context?.projectId
  if (!projectId) return 'No active project.'
  const { data, error } = await supabase
    .from('computerui_conversations')
    .select('id, title, created_at, updated_at')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
  if (error) return `Error: ${error.message}`
  return JSON.stringify(data.map(c => ({
    id: c.id,
    title: c.title || 'Untitled',
    created_at: c.created_at,
    updated_at: c.updated_at,
  })))
}

async function execReadSavedDocument(args) {
  const { document_id: documentId } = args
  if (!documentId) return 'Error: document_id is required'
  try {
    const res = await fetch(`${getApiBase()}/api/documents/${encodeURIComponent(documentId)}`)
    const data = await res.json()
    if (!res.ok) return `Error: ${data.error || 'Document not found'}`
    const label = data.title || data.filename || 'Document'
    return `Document: ${label}\n\n${data.content || ''}`
  } catch (err) {
    return `Error loading document: ${err.message}`
  }
}

async function execReadConversation(args) {
  const { conversation_id } = args
  if (!conversation_id) return 'Error: conversation_id is required'
  const { data, error } = await supabase
    .from('computerui_messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: true })
  if (error) return `Error: ${error.message}`
  if (!data.length) return 'No messages in this conversation.'
  return data.map(m => `[${m.role}] ${m.content}`).join('\n\n')
}

// --- Unified executor ---

export async function executeTool(name, args, context) {
  switch (name) {
    case 'list_skills': return execListSkills()
    case 'read_skill': return execReadSkill(args)
    case 'run_script': return execRunScript(args)
    case 'save_markdown_report': return execSaveMarkdownReport(args, context)
    case 'get_datetime': return execGetDatetime(args)
    case 'get_weather': return execGetWeather(args)
    case 'list_project_conversations': return execListProjectConversations(args, context)
    case 'read_conversation': return execReadConversation(args)
    case 'read_saved_document': return execReadSavedDocument(args)
    default: return `Error: Unknown tool "${name}"`
  }
}
