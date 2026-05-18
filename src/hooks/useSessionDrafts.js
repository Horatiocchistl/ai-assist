/** In-memory session drafts per conversation (cleared when app closes). */

const draftsByConversation = new Map()

export function registerSessionDraft(conversationId, { reportId, filename, title }) {
  if (!conversationId || !reportId) return
  draftsByConversation.set(conversationId, {
    reportId,
    filename: filename || null,
    title: title || null,
    updatedAt: Date.now(),
  })
}

export function getSessionDraft(conversationId) {
  if (!conversationId) return null
  return draftsByConversation.get(conversationId) || null
}

export function clearSessionDraft(conversationId) {
  if (conversationId) draftsByConversation.delete(conversationId)
}

export function clearAllSessionDrafts() {
  draftsByConversation.clear()
}
