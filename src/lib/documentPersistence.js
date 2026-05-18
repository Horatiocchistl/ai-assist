const ACTIVE_CONV_KEY = 'computerui_active_id'
const lastDocKey = (conversationId) => `ai-assist:last-doc:${conversationId}`

export function getLastActiveConversationId() {
  try {
    return localStorage.getItem(ACTIVE_CONV_KEY)
  } catch {
    return null
  }
}

export function setLastActiveConversationId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_CONV_KEY, id)
    else localStorage.removeItem(ACTIVE_CONV_KEY)
  } catch { /* ignore */ }
}

export function getLastDocumentId(conversationId) {
  if (!conversationId) return null
  try {
    return localStorage.getItem(lastDocKey(conversationId))
  } catch {
    return null
  }
}

export function setLastDocumentId(conversationId, documentId) {
  if (!conversationId || !documentId) return
  try {
    localStorage.setItem(lastDocKey(conversationId), documentId)
  } catch { /* ignore */ }
}
