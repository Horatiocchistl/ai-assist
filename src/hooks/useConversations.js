import { useState, useEffect, useCallback, useRef } from 'react'
import { generateId } from '../lib/storage.js'
import { getLastActiveConversationId, setLastActiveConversationId } from '../lib/documentPersistence.js'
import supabase from '../lib/supabase.js'

export function useConversations() {
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const messagesCache = useRef({})

  // Load conversations on mount
  useEffect(() => {
    supabase
      .from('computerui_conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error(error); return }
        localStorage.removeItem('computerui_conversations')
        const normalized = data.map(c => ({
          id: c.id,
          projectId: c.project_id || null,
          title: c.title || '',
          systemPrompt: c.system_prompt || '',
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          messages: [],
        }))
        setConversations(normalized)
        const nonProject = normalized.filter(c => !c.projectId)
        const storedActive = getLastActiveConversationId()
        const restored = storedActive && normalized.some(c => c.id === storedActive)
          ? storedActive
          : nonProject[0]?.id || null
        setActiveId(restored)
      })
  }, [])

  const activeConv = conversations.find(c => c.id === activeId) || null

  // Load messages for active conversation on demand
  useEffect(() => {
    if (!activeId) return
    if (messagesCache.current[activeId]) {
      setConversations(prev => prev.map(c =>
        c.id === activeId ? { ...c, messages: messagesCache.current[activeId] } : c
      ))
      return
    }
    supabase
      .from('computerui_messages')
      .select('*')
      .eq('conversation_id', activeId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.error(error); return }
        const msgs = data.map(m => ({
          role: m.role,
          content: m.content,
          thinkContent: m.think_content || null,
        }))
        messagesCache.current[activeId] = msgs
        setConversations(prev => prev.map(c =>
          c.id === activeId ? { ...c, messages: msgs } : c
        ))
      })
  }, [activeId])

  // appendMessage takes explicit convId — no closure dependency on activeId
  const appendMessage = useCallback((convId, message) => {
    const msg = {
      role: message.role,
      content: message.content,
      thinkContent: message.thinkContent || null,
    }

    // Optimistic: update local state immediately
    messagesCache.current[convId] = [...(messagesCache.current[convId] || []), msg]
    setConversations(prev => prev.map(c =>
      c.id === convId
        ? { ...c, messages: messagesCache.current[convId], updatedAt: new Date().toISOString() }
        : c
    ))

    // Persist to Supabase (fire-and-forget)
    supabase
      .from('computerui_messages')
      .insert({
        conversation_id: convId,
        role: message.role,
        content: message.content,
        think_content: message.thinkContent || null,
      })
      .then(({ error }) => { if (error) console.error('Failed to save message:', error) })
  }, [])

  const createNew = useCallback(async (projectId = null) => {
    const id = generateId('conv')
    const { data, error } = await supabase
      .from('computerui_conversations')
      .insert({ id, project_id: projectId || null, title: '', system_prompt: '' })
      .select()
      .single()
    if (error) { console.error(error); return null }
    const normalized = {
      id: data.id,
      projectId: data.project_id || null,
      title: data.title || '',
      systemPrompt: data.system_prompt || '',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      messages: [],
    }
    messagesCache.current[id] = []
    setConversations(prev => [normalized, ...prev])
    setActiveId(id)
    return normalized
  }, [])

  const select = useCallback((id) => {
    setActiveId(id)
    setLastActiveConversationId(id)
  }, [])

  useEffect(() => {
    if (activeId) setLastActiveConversationId(activeId)
  }, [activeId])

  const renameConversation = useCallback(async (id, title) => {
    const { error } = await supabase
      .from('computerui_conversations')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { console.error(error); return }
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c))
  }, [])

  const deleteConversation = useCallback(async (id) => {
    await supabase.from('computerui_messages').delete().eq('conversation_id', id)
    const { error } = await supabase
      .from('computerui_conversations')
      .delete()
      .eq('id', id)
    if (error) { console.error(error); return }
    delete messagesCache.current[id]
    setConversations(prev => {
      const remaining = prev.filter(c => c.id !== id)
      if (activeId === id) {
        const next = remaining[0]?.id || null
        setActiveId(next)
      }
      return remaining
    })
  }, [activeId])

  const moveConversationToProject = useCallback(async (id, projectId) => {
    const { data, error } = await supabase
      .from('computerui_conversations')
      .update({
        project_id: projectId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) { console.error(error); throw new Error(error.message) }
    setConversations(prev => prev.map(c => c.id === id ? {
      ...c,
      projectId: data.project_id || null,
      updatedAt: data.updated_at,
    } : c))
  }, [])

  const moveConversationsToProject = useCallback(async (ids, projectId) => {
    if (!ids.length) return
    const { error } = await supabase
      .from('computerui_conversations')
      .update({
        project_id: projectId || null,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
    if (error) { console.error(error); throw new Error(error.message) }
    const idSet = new Set(ids)
    setConversations(prev => prev.map(c => idSet.has(c.id)
      ? { ...c, projectId: projectId || null, updatedAt: new Date().toISOString() }
      : c))
  }, [])

  const deleteConversations = useCallback(async (ids) => {
    if (!ids.length) return
    const idSet = new Set(ids)
    await supabase.from('computerui_messages').delete().in('conversation_id', ids)
    const { error } = await supabase
      .from('computerui_conversations')
      .delete()
      .in('id', ids)
    if (error) { console.error(error); throw new Error(error.message) }
    for (const id of ids) delete messagesCache.current[id]
    setConversations(prev => {
      const remaining = prev.filter(c => !idSet.has(c.id))
      if (activeId && idSet.has(activeId)) {
        setActiveId(remaining[0]?.id || null)
      }
      return remaining
    })
  }, [activeId])

  const updateMessageField = useCallback((convId, msgIndex, field, value) => {
    if (messagesCache.current[convId]) {
      messagesCache.current[convId] = messagesCache.current[convId].map((m, i) =>
        i === msgIndex ? { ...m, [field]: value } : m
      )
    }
    setConversations(prev => prev.map(c =>
      c.id === convId
        ? { ...c, messages: messagesCache.current[convId] }
        : c
    ))
  }, [])

  return {
    conversations,
    active: activeConv,
    activeId,
    appendMessage,
    updateMessageField,
    createNew,
    select,
    renameConversation,
    deleteConversation,
    moveConversationToProject,
    moveConversationsToProject,
    deleteConversations,
  }
}
