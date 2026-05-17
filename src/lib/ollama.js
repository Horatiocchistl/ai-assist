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
  let toolCalls = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    for (const line of chunk.split('\n')) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line)
        if (parsed.message?.tool_calls?.length) {
          toolCalls.push(...parsed.message.tool_calls)
        }
        if (parsed.message?.content || parsed.message?.thinking) {
          yield {
            content: parsed.message.content || '',
            thinking: parsed.message.thinking || '',
          }
        }
        if (parsed.done) {
          if (toolCalls.length) {
            yield { toolCalls }
          }
          return
        }
      } catch {
        // partial line, skip
      }
    }
  }
  if (toolCalls.length) {
    yield { toolCalls }
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
