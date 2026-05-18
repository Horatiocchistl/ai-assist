const DOC_CONTEXT_MAX = 8000

export function findMentionedDocument(userText, savedDocs) {
  if (!userText || !savedDocs?.length) return null
  const lower = userText.toLowerCase()
  for (const doc of savedDocs) {
    const title = (doc.title || '').toLowerCase().trim()
    const base = (doc.filename || '').replace(/\.md$/i, '').toLowerCase().trim()
    if (title.length > 3 && lower.includes(title)) return doc
    if (base.length > 3 && lower.includes(base)) return doc
  }
  return null
}

export function formatDocumentContextSection(doc, content) {
  const body = content || ''
  const truncated = body.length > DOC_CONTEXT_MAX
    ? `${body.slice(0, DOC_CONTEXT_MAX)}\n\n[...document truncated...]`
    : body
  const label = doc.title || doc.filename || 'Document'
  return `## Document the user is viewing\n**${label}**\n\n${truncated}`
}
