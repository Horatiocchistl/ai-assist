const CHUNK_SIZE = 500   // ~500 tokens (approx chars/4 for English)
const CHUNK_OVERLAP = 50 // ~50 token overlap

/**
 * Split text into chunks of approximately CHUNK_SIZE tokens with overlap.
 * Uses paragraph/sentence boundaries where possible.
 * Returns array of { content, index }.
 */
export function chunkText(text, { chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP } = {}) {
  if (!text || !text.trim()) return []

  // Approximate token count (rough: 1 token ≈ 4 chars for English)
  const charLimit = chunkSize * 4
  const overlapChars = overlap * 4

  // First split by double newlines (paragraphs)
  const paragraphs = text.split(/\n\n+/)
  const chunks = []
  let current = ''
  let index = 0

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    // If adding this paragraph exceeds limit, finalize current chunk
    if (current.length + trimmed.length + 1 > charLimit && current.length > 0) {
      chunks.push({ content: current.trim(), index })
      index++
      // Overlap: keep the tail of the current chunk
      const tail = current.slice(-overlapChars)
      current = tail + '\n\n' + trimmed
    } else {
      current += (current ? '\n\n' : '') + trimmed
    }
  }

  // Final chunk
  if (current.trim()) {
    chunks.push({ content: current.trim(), index })
  }

  // If text is very short and produced one chunk, split by sentences if still too big
  if (chunks.length === 1 && chunks[0].content.length > charLimit) {
    return splitBySentences(chunks[0].content, charLimit, overlapChars)
  }

  return chunks
}

function splitBySentences(text, charLimit, overlapChars) {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const chunks = []
  let current = ''
  let index = 0

  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 > charLimit && current.length > 0) {
      chunks.push({ content: current.trim(), index })
      index++
      const tail = current.slice(-overlapChars)
      current = tail + ' ' + sentence
    } else {
      current += (current ? ' ' : '') + sentence
    }
  }

  if (current.trim()) {
    chunks.push({ content: current.trim(), index })
  }

  return chunks
}
