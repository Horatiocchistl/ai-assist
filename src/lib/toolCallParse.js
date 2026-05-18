import { KNOWN_TOOL_NAMES } from './tools.js'

const LEAKED_TOOL_RE = /\b([a-z_][a-z0-9_]*)\[ARGS\]\s*(\{[\s\S]*\})/i

export function contentLooksLikeLeakedTool(text) {
  if (!text || typeof text !== 'string') return false
  return LEAKED_TOOL_RE.test(text.trim())
}

/**
 * Parse model text like get_weather[ARGS]{"location":"Chicago"} into a synthetic tool call.
 */
export function parseLeakedToolCall(content) {
  if (!content || typeof content !== 'string') return null
  const trimmed = content.trim()
  const match = trimmed.match(/^([a-z_][a-z0-9_]*)\[ARGS\]\s*(\{[\s\S]*\})\s*$/i)
  if (!match) return null
  const name = match[1]
  if (!KNOWN_TOOL_NAMES.includes(name)) return null
  try {
    const args = JSON.parse(match[2])
    return {
      type: 'function',
      function: { name, arguments: args },
    }
  } catch {
    return null
  }
}

/**
 * Extract first leaked tool call embedded in longer content.
 */
export function salvageToolCallsFromContent(content) {
  if (!content || typeof content !== 'string') return []
  const match = content.match(LEAKED_TOOL_RE)
  if (!match) return []
  const name = match[1]
  if (!KNOWN_TOOL_NAMES.includes(name)) return []
  try {
    const args = JSON.parse(match[2])
    return [{
      type: 'function',
      function: { name, arguments: args },
    }]
  } catch {
    return []
  }
}
