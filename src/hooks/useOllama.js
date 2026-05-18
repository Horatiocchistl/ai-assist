import { useState, useRef, useCallback } from 'react'
import { streamChat } from '../lib/ollama.js'
import { executeTool } from '../lib/tools.js'
import {
  contentLooksLikeLeakedTool,
  parseLeakedToolCall,
  salvageToolCallsFromContent,
} from '../lib/toolCallParse.js'

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

const TOOL_FAILURE_INSTRUCTION = `

[INSTRUCTION: Show the user the tool result above exactly. Do not provide weather numbers. Do not replace the error with your own advice—the tool output already says what they need to fix.]`

const WEATHER_QUESTION_RE = /\b(weather|temperature|forecast|rain|wind|humidity|conditions)\b/i

function parseToolArguments(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function isToolFailureResult(result) {
  if (result == null || result === '') return true
  if (typeof result !== 'string') return false
  return (
    result.startsWith('Error:')
    || /script error|exit \d+|AMBIGUOUS_LOCATION|Could not find location/i.test(result)
  )
}

function formatToolResultForModel(toolResult) {
  if (isToolFailureResult(toolResult)) {
    const body = toolResult == null || toolResult === ''
      ? 'Error: Tool returned no output.'
      : toolResult
    return body + TOOL_FAILURE_INSTRUCTION
  }
  return toolResult
}

function looksLikeWeatherForecast(text) {
  if (!text || !WEATHER_QUESTION_RE.test(text)) return false
  return /\d+\s*°|°F|°C|forecast|humidity|Partly cloudy|Heavy rain/i.test(text)
}

function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content || ''
  }
  return ''
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
    onToolStart,
    onDocumentToolActivity,
  }) => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setIsStreaming(true)

    const fullMessages = [...messages]
    const userAskedWeather = WEATHER_QUESTION_RE.test(lastUserText(fullMessages))

    try {
      let rounds = 0
      let raw = ''
      let draftCreated = null
      let draftFailed = null
      let getWeatherSucceeded = false

      while (rounds < MAX_TOOL_ROUNDS) {
        rounds++
        raw = ''
        let thinking = ''
        let toolCalls = []
        let sawToolCalls = false

        for await (const chunk of streamChat({
          model,
          messages: fullMessages,
          systemPrompt,
          tools,
          signal: controller.signal,
        })) {
          if (chunk.toolCalls?.length) {
            toolCalls = chunk.toolCalls
            sawToolCalls = true
          } else if (chunk.content || chunk.thinking) {
            if (!sawToolCalls && !contentLooksLikeLeakedTool(raw + (chunk.content || ''))) {
              raw += chunk.content || ''
              thinking += chunk.thinking || ''
              onToken?.(parseThink(raw))
            }
          }
        }

        if (!toolCalls.length) {
          const leaked = parseLeakedToolCall(raw) || salvageToolCallsFromContent(raw)[0]
          if (leaked) {
            toolCalls = [leaked]
            raw = ''
          }
        }

        if (toolCalls.length) {
          fullMessages.push({ role: 'assistant', content: raw, tool_calls: toolCalls })
          let savedReport = false
          for (const tc of toolCalls) {
            const fn = tc.function
            const toolArgs = parseToolArguments(fn.arguments)
            if (
              fn.name === 'save_markdown_report'
              || (fn.name === 'read_skill' && toolArgs?.name === 'markdown-report')
            ) {
              onDocumentToolActivity?.({ name: fn.name })
            }
            onToolStart?.({ name: fn.name })
            const toolResult = await executeTool(fn.name, toolArgs, toolContext)
            if (fn.name === 'get_weather' && !isToolFailureResult(toolResult)) {
              getWeatherSucceeded = true
            }
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
                    savedReport = true
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
              content: formatToolResultForModel(toolResult),
            })
          }
          if (savedReport) break
          onToken?.({ content: '', thinkContent: null })
          continue
        }

        if (contentLooksLikeLeakedTool(raw)) {
          raw = 'Error: Weather lookup did not complete. Please try again with a zip code or city and state (e.g. Carbondale, IL or 62901).'
        }

        break
      }

      let done = parseThink(raw)
      if (userAskedWeather && !getWeatherSucceeded && looksLikeWeatherForecast(done.content)) {
        done = {
          ...done,
          content: 'I could not run the weather lookup successfully. Please try again with a zip code or city and state (e.g. 62901 or Carbondale, IL).',
        }
      }
      onDone?.({ ...done, draftCreated, draftFailed, getWeatherSucceeded })
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
      if (chunk.content) raw += chunk.content
    }
    return raw.trim()
  }, [])

  return { send, abort, isStreaming, requestReasoning }
}
