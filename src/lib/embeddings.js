const OLLAMA_HOST = import.meta.env.VITE_OLLAMA_HOST || 'http://localhost:11434'
const EMBED_MODEL = 'nomic-embed-text'

/**
 * Generate an embedding vector for a single text string.
 * Uses Ollama's /api/embed endpoint with nomic-embed-text (768 dimensions).
 */
export async function embedText(text) {
  const res = await fetch(`${OLLAMA_HOST}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  })
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(`Embedding failed: ${res.status} ${msg}`)
  }
  const data = await res.json()
  return data.embeddings[0]
}

/**
 * Generate embeddings for an array of text strings (batch).
 * Ollama supports array input for batch embedding.
 */
export async function embedChunks(chunks) {
  const res = await fetch(`${OLLAMA_HOST}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: chunks }),
  })
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(`Batch embedding failed: ${res.status} ${msg}`)
  }
  const data = await res.json()
  return data.embeddings
}
