const OLLAMA_HOST = import.meta.env.VITE_OLLAMA_HOST || 'http://localhost:11434'

async function ollamaFetch(body, signal) {
  let response
  try {
    response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new Error(`Cannot reach Ollama at ${OLLAMA_HOST}. Make sure the Ollama app is running.`)
  }
  if (!response.ok) {
    throw new Error(`Ollama error ${response.status}: ${await response.text()}`)
  }
  return response
}

function mergeToolArguments(a, b) {
  if (a == null) return b ?? ''
  if (b == null) return a
  if (typeof a === 'object' && typeof b === 'object') return { ...a, ...b }
  const sa = typeof a === 'string' ? a : JSON.stringify(a)
  const sb = typeof b === 'string' ? b : JSON.stringify(b)
  return sa + sb
}

function mergeToolCalls(existing, incoming) {
  const byKey = new Map()
  const add = (tc) => {
    const fn = tc.function || {}
    const key = fn.index ?? fn.name ?? byKey.size
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, {
        type: 'function',
        function: {
          index: fn.index,
          name: fn.name || '',
          arguments: fn.arguments ?? '',
        },
      })
      return
    }
    prev.function.name = fn.name || prev.function.name
    prev.function.arguments = mergeToolArguments(prev.function.arguments, fn.arguments)
  }
  for (const tc of existing) add(tc)
  for (const tc of incoming) add(tc)
  return [...byKey.values()].filter(tc => tc.function?.name)
}

export async function* streamChat({ model, messages, systemPrompt, tools, signal }) {
  const body = {
    model,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages,
    ],
    stream: true,
  }
  if (tools?.length) body.tools = tools

  const response = await ollamaFetch(body, signal)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let toolCalls = []
  let contentAcc = ''
  let thinkingAcc = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue
      let parsed
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }

      if (parsed.message?.tool_calls?.length) {
        toolCalls = mergeToolCalls(toolCalls, parsed.message.tool_calls)
      }
      if (parsed.message?.content) {
        contentAcc += parsed.message.content
        if (!toolCalls.length) {
          yield { content: parsed.message.content, thinking: '' }
        }
      }
      if (parsed.message?.thinking) {
        thinkingAcc += parsed.message.thinking
        if (!toolCalls.length) {
          yield { content: '', thinking: parsed.message.thinking }
        }
      }
      if (parsed.done) {
        if (toolCalls.length) {
          yield { toolCalls, content: contentAcc, thinking: thinkingAcc }
        }
        return
      }
    }
  }

  if (toolCalls.length) {
    yield { toolCalls, content: contentAcc, thinking: thinkingAcc }
  }
}

export async function listModels() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`)
    const data = await res.json()
    return data.models || []
  } catch {
    return []
  }
}
