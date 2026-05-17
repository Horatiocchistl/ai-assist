import { useState, useEffect, useCallback, useRef } from 'react'
import { generateId, loadActiveProjectId, saveActiveProjectId, loadProjects, PROJECTS_KEY } from '../lib/storage.js'
import supabase from '../lib/supabase.js'
import { chunkText } from '../lib/chunker.js'
import { embedText, embedChunks } from '../lib/embeddings.js'

const RAG_MAX_CHARS = 8000

function normalizeProject(row) {
  if (!row) return null
  return { ...row, knowledge: Array.isArray(row.knowledge) ? row.knowledge : [] }
}

function mergeProjectRow(existing, data) {
  return {
    ...existing,
    ...data,
    knowledge: Array.isArray(data.knowledge) ? data.knowledge : (existing.knowledge || []),
  }
}

function newKnowledgeItem(type, label, content) {
  return { id: generateId('kb'), type, label, content, createdAt: Date.now() }
}

/** Format RAG chunks for injection into the project chat system prompt. */
export function formatRelevantKnowledge(chunks) {
  if (!chunks?.length) return ''
  const parts = ['## Relevant project knowledge\n']
  let total = parts[0].length
  for (const chunk of chunks) {
    const label = chunk.metadata?.label || chunk.label || 'Knowledge'
    const block = `### ${label}\n${chunk.content}\n`
    if (total + block.length > RAG_MAX_CHARS) break
    parts.push(block)
    total += block.length
  }
  return parts.join('\n')
}

async function ingestKnowledgeChunks(projectId, knowledgeId, label, type, content) {
  const chunks = chunkText(content)
  if (chunks.length === 0) return
  const texts = chunks.map(c => c.content)
  const embeddings = await embedChunks(texts)
  const rows = chunks.map((chunk, i) => ({
    project_id: projectId,
    knowledge_id: knowledgeId,
    content: chunk.content,
    embedding: JSON.stringify(embeddings[i]),
    metadata: { label, type, chunk_index: chunk.index },
  }))
  const { error } = await supabase.from('knowledge_chunks').insert(rows)
  if (error) throw new Error(error.message || 'Failed to store knowledge chunks')
}

async function migrateLocalStorageProjects(supabaseProjects) {
  const local = loadProjects()
  if (!local?.length) {
    try { localStorage.removeItem(PROJECTS_KEY) } catch { /* ignore */ }
    return supabaseProjects
  }

  const order = supabaseProjects.map(p => p.id)
  const byId = new Map(supabaseProjects.map(p => [p.id, { ...p }]))

  for (const localProj of local) {
    if (!localProj?.id || !byId.has(localProj.id)) continue
    const remote = byId.get(localProj.id)
    const remoteKb = remote.knowledge || []
    const localKb = Array.isArray(localProj.knowledge) ? localProj.knowledge : []
    const merged = [...remoteKb]
    let dirty = false
    for (const item of localKb) {
      if (!item?.label) continue
      const exists = merged.some(k => k.id === item.id || k.label === item.label)
      if (!exists) {
        merged.push(item)
        dirty = true
      }
    }
    if (!dirty) continue

    const { data, error } = await supabase
      .from('computerui_projects')
      .update({ knowledge: merged, updated_at: new Date().toISOString() })
      .eq('id', localProj.id)
      .select()
      .single()
    if (error) {
      console.error('Failed to migrate local knowledge for', localProj.id, error)
      continue
    }
    byId.set(localProj.id, normalizeProject(data))
  }

  try { localStorage.removeItem(PROJECTS_KEY) } catch { /* ignore */ }
  return order.map(id => byId.get(id)).filter(Boolean)
}

export function useProjects() {
  const [projects, setProjects] = useState([])
  const [activeProjectId, setActiveProjectId] = useState(() => loadActiveProjectId())
  const projectsRef = useRef(projects)
  projectsRef.current = projects

  const activeProject = projects.find(p => p.id === activeProjectId) || null

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('computerui_projects')
        .select('*')
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (error) {
        console.error(error)
        return
      }
      let normalized = (data || []).map(normalizeProject)
      try {
        normalized = await migrateLocalStorageProjects(normalized)
      } catch (err) {
        console.error('Local project knowledge migration failed:', err)
      }
      if (!cancelled) setProjects(normalized)
    })()
    return () => { cancelled = true }
  }, [])

  const refetchProject = useCallback(async (projectId) => {
    if (!projectId) return
    const { data, error } = await supabase
      .from('computerui_projects')
      .select('*')
      .eq('id', projectId)
      .single()
    if (error) {
      console.error(error)
      return
    }
    const normalized = normalizeProject(data)
    setProjects(prev => prev.map(p => (p.id === projectId ? normalized : p)))
  }, [])

  const createProject = useCallback(async (name = 'New Project') => {
    const id = generateId('proj')
    const { data, error } = await supabase
      .from('computerui_projects')
      .insert({ id, name, instructions: '', knowledge: [] })
      .select()
      .single()
    if (error) { console.error(error); return null }
    const normalized = normalizeProject(data)
    setProjects(prev => [normalized, ...prev])
    setActiveProjectId(id)
    saveActiveProjectId(id)
    return normalized
  }, [])

  const selectProject = useCallback((id) => {
    setActiveProjectId(id)
    saveActiveProjectId(id)
  }, [])

  const clearActiveProject = useCallback(() => {
    setActiveProjectId(null)
    saveActiveProjectId(null)
  }, [])

  const setProjectName = useCallback(async (id, name) => {
    const { data, error } = await supabase
      .from('computerui_projects')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) { console.error(error); return }
    setProjects(prev => prev.map(p => (p.id === id ? mergeProjectRow(p, data) : p)))
  }, [])

  const setProjectInstructions = useCallback(async (id, instructions) => {
    const { data, error } = await supabase
      .from('computerui_projects')
      .update({ instructions, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) { console.error(error); return }
    setProjects(prev => prev.map(p => (p.id === id ? mergeProjectRow(p, data) : p)))
  }, [])

  const addKnowledge = useCallback(async (projectId, type, label, content) => {
    const project = projectsRef.current.find(p => p.id === projectId)
    if (!project) throw new Error('Project not found')

    const item = newKnowledgeItem(type, label, content)
    const previousKnowledge = project.knowledge || []
    const knowledge = [...previousKnowledge, item]

    const { data, error } = await supabase
      .from('computerui_projects')
      .update({ knowledge, updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .select()
      .single()

    if (error) throw new Error(error.message || 'Failed to save file to project')

    try {
      await ingestKnowledgeChunks(projectId, item.id, label, type, content)
    } catch (err) {
      await supabase
        .from('computerui_projects')
        .update({ knowledge: previousKnowledge, updated_at: new Date().toISOString() })
        .eq('id', projectId)
      throw new Error(err.message || 'Failed to index file for search')
    }

    const normalized = normalizeProject(data)
    setProjects(prev => prev.map(p => (p.id === projectId ? normalized : p)))
    return item
  }, [])

  const removeKnowledge = useCallback(async (projectId, knowledgeId) => {
    const project = projectsRef.current.find(p => p.id === projectId)
    if (!project) throw new Error('Project not found')

    const previousKnowledge = project.knowledge || []
    const knowledge = previousKnowledge.filter(k => k.id !== knowledgeId)

    const { error: chunkError } = await supabase
      .from('knowledge_chunks')
      .delete()
      .eq('knowledge_id', knowledgeId)
    if (chunkError) throw new Error(chunkError.message || 'Failed to remove file index')

    const { data, error } = await supabase
      .from('computerui_projects')
      .update({ knowledge, updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .select()
      .single()

    if (error) {
      throw new Error(error.message || 'Failed to remove file from project')
    }

    const normalized = normalizeProject(data)
    setProjects(prev => prev.map(p => (p.id === projectId ? normalized : p)))
  }, [])

  const deleteProject = useCallback(async (id) => {
    const { error } = await supabase
      .from('computerui_projects')
      .delete()
      .eq('id', id)
    if (error) { console.error(error); return }
    setProjects(prev => {
      const remaining = prev.filter(p => p.id !== id)
      if (id === activeProjectId) {
        const next = remaining[0]?.id || null
        setActiveProjectId(next)
        saveActiveProjectId(next)
      }
      return remaining
    })
  }, [activeProjectId])

  const retrieveRelevantKnowledge = useCallback(async (projectId, queryText, matchCount = 5) => {
    if (!projectId || !queryText) return []
    try {
      const queryEmbedding = await embedText(queryText)
      const { data, error } = await supabase.rpc('match_knowledge_chunks', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_project_id: projectId,
        match_count: matchCount,
      })
      if (error) { console.error('RAG retrieval error:', error); return [] }
      return data || []
    } catch (err) {
      console.error('RAG retrieval failed:', err)
      return []
    }
  }, [])

  function buildProjectSystemPrompt(project, projectConversations) {
    if (!project) return ''
    const parts = []
    parts.push(`You are working within the project "${project.name}".`)
    if (project.instructions) parts.push(project.instructions)
    if (project.knowledge?.length > 0) {
      const labels = project.knowledge.map(k => `- ${k.label} (${k.type})`).join('\n')
      parts.push(`This project has these knowledge documents:\n${labels}\nOnly access their content if the user asks you to.`)
    }
    if (projectConversations?.length > 0) {
      parts.push(`This project has ${projectConversations.length} conversation(s). Only look them up if the user asks.`)
    }
    return parts.join('\n\n')
  }

  return {
    projects,
    activeProject,
    activeProjectId,
    createProject,
    selectProject,
    clearActiveProject,
    setProjectName,
    setProjectInstructions,
    addKnowledge,
    removeKnowledge,
    deleteProject,
    refetchProject,
    buildProjectSystemPrompt,
    retrieveRelevantKnowledge,
  }
}
