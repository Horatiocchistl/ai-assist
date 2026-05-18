function getApiBase() {
  if (typeof window !== 'undefined' && window.location?.port && window.location.port !== '5173') {
    return window.location.origin
  }
  return 'http://localhost:3001'
}

export async function loadSavedDocumentsForConversation(conversationId) {
  if (!conversationId) return []
  const res = await fetch(`${getApiBase()}/api/conversations/${encodeURIComponent(conversationId)}/documents`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load documents')
  return data || []
}

export async function loadSavedDocumentsForProject(projectId) {
  if (!projectId) return []
  const res = await fetch(`${getApiBase()}/api/projects/${encodeURIComponent(projectId)}/documents`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load project documents')
  return data || []
}

export async function commitSaveDocument(conversationId, { reportId, projectId }) {
  const res = await fetch(`${getApiBase()}/api/conversations/${encodeURIComponent(conversationId)}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportId, projectId: projectId || null }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to save document')
  return data.document
}

export async function fetchSavedDocument(documentId) {
  const res = await fetch(`${getApiBase()}/api/documents/${encodeURIComponent(documentId)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load document')
  return data
}
