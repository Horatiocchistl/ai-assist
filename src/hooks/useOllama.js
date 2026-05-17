import { useState, useRef, useCallback } from 'react'
import { streamChat } from '../lib/ollama.js'
import { executeTool } from '../lib/tools.js'

function parseThink(raw) {
  const match = raw.match(/^<think>([\s\S]*?)<\/think>\s*/i)
  if (match) {
    return { thinkContent: match[1].trim(), content: raw.slice(match[0].length) }
  }
  const partial = raw.match(/^<think>([\s\S]*)$/i)
  if (partial) {
    return { thinkContent: partial[1], content: '' }
  }
  return { thinkContent: null, content: raw }
}

const MAX_TOOL_ROUNDS = 5

function parseToolArguments(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function useOllama() {
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef(null)

  const send = useCallback(async ({
    model,
    messages,
    systemPrompt,
    tools,
    toolContext,
    onToken,
    onDone,
    onError,
    onDraftCreated,
    onDraftFailed,
  }) => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setIsStreaming(true)

    const fullMessages = [...messages]

    try {
      let rounds = 0
      let raw = ''
      let draftCreated = null
      let draftFailed = null
      while (rounds < MAX_TOOL_ROUNDS) {
        rounds++
        raw = ''
        let thinking = ''
        let toolCalls = []

        for await (const chunk of streamChat({
          model,
          messages: fullMessages,
          systemPrompt,
          tools,
          signal: controller.signal,
        })) {
          if (chunk.toolCalls) {
            toolCalls = chunk.toolCalls
          } else {
            raw += chunk.content || ''
            thinking += chunk.thinking || ''
            onToken?.(parseThink(raw))
          }
        }

        if (toolCalls.length) {
          // Tool call round — execute tools and loop back
          fullMessages.push({ role: 'assistant', content: raw, tool_calls: toolCalls })
          for (const tc of toolCalls) {
            const fn = tc.function
            const toolResult = await executeTool(fn.name, parseToolArguments(fn.arguments), toolContext)
            if (fn.name === 'save_markdown_report') {
              if (typeof toolResult === 'string' && toolResult.startsWith('Error:')) {
                console.error('[save_markdown_report]', toolResult)
                draftFailed = { error: toolResult }
                onDraftFailed?.(draftFailed)
              } else {
                try {
                  const parsed = JSON.parse(toolResult)
                  if (parsed.ok && parsed.reportId) {
                    draftCreated = {
                      reportId: parsed.reportId,
                      filename: parsed.filename,
                    }
                    onDraftCreated?.(draftCreated)
                  } else {
                    draftFailed = { error: `Error: ${parsed.error || 'Failed to save report'}` }
                    console.error('[save_markdown_report]', draftFailed.error)
                    onDraftFailed?.(draftFailed)
                  }
                } catch {
                  draftFailed = { error: 'Error: Invalid response from save_markdown_report' }
                  console.error('[save_markdown_report]', draftFailed.error, toolResult)
                  onDraftFailed?.(draftFailed)
                }
              }
            }
            fullMessages.push({
              role: 'tool',
              tool_name: fn.name,
              content: toolResult,
            })
          }
          // Reset streaming UI for next round
          onToken?.({ content: '', thinkContent: null })
          continue
        }

        // No tool calls — done
        break
      }

      const done = parseThink(raw)
      onDone?.({ ...done, draftCreated, draftFailed })
    } catch (err) {
      if (err.name !== 'AbortError') {
        onError?.(err)
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [])

  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const requestReasoning = useCallback(async ({ model, userText, assistantText }) => {
    const reasoningPrompt = `Explain your reasoning for the following answer using this structured format:

Problem: [restate the core question]
Fact 1: [relevant fact]
Fact 2: [relevant fact]
Step 1 (Label): [reasoning step]
Step 2 (Label): [reasoning step]
Conclusion: [final answer]

User question: ${userText}
Your answer: ${assistantText}

Provide ONLY the structured reasoning above. No extra prose.`

    const messages = [{ role: 'user', content: reasoningPrompt }]
    let raw = ''
    for await (const chunk of streamChat({ model, messages })) {
      raw += chunk.content
    }
    return raw.trim()
  }, [])

  return { send, abort, isStreaming, requestReasoning }
}
