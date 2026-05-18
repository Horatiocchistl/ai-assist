import React, { useState, useCallback, useRef, useEffect } from 'react'
import CenterPanel from './components/CenterPanel.jsx'
import ProjectCardView from './components/ProjectCardView.jsx'
import ProjectCreateModal from './components/ProjectCreateModal.jsx'
import ProjectsView from './components/ProjectsView.jsx'
import Sidebar from './components/Sidebar.jsx'
import { useConversations } from './hooks/useConversations.js'
import { useProjects, formatRelevantKnowledge } from './hooks/useProjects.js'
import { useOllama } from './hooks/useOllama.js'
import { ALL_TOOLS, SKILL_TOOLS, isDocumentRequest, executeTool } from './lib/tools.js'
import { parseWeatherLocation } from './lib/weatherRequest.js'
import { registerSessionDraft, getSessionDraft, clearSessionDraft } from './hooks/useSessionDrafts.js'
import {
  loadSavedDocumentsForConversation,
  commitSaveDocument,
  fetchSavedDocument,
} from './hooks/useSavedDocuments.js'
import { findMentionedDocument, formatDocumentContextSection } from './lib/documentContext.js'
import { getLastDocumentId, setLastDocumentId } from './lib/documentPersistence.js'
import SkillDirsModal from './components/SkillDirsModal.jsx'
import ReportPreviewPanel from './components/ReportPreviewPanel.jsx'
import ChatsView from './components/ChatsView.jsx'
import GapAnalyzerView from './components/gap-analyzer/GapAnalyzerView.jsx'

const DEFAULT_MODEL = 'ministral-3:14b'
const REGULAR_SYSTEM_PROMPT = `You are a helpful AI assistant. Respond concisely and accurately.

You have access to these tools — use them when relevant:
- list_skills: Lists all available skills/workflows
- read_skill: Reads a skill's full content by name
- run_script: Runs an executable script from a skill's scripts/ folder
- get_weather: Fetches weather for a location; optional forecast_days (1-16) for future dates
- get_datetime: Current date and time (use for {{DATE_TIME}} in reports)
- save_markdown_report: Saves formatted markdown as a draft report linked to this conversation

Rules:
- When the user references a skill with /skill_name, ALWAYS call read_skill with that name to load it.
- When asked about available skills or what you can do, call list_skills.
- When a skill has scripts listed in its resources, use run_script to execute them when relevant (never for weather).
- Weather: read_skill('weather') when using /weather, then call get_weather only — no memory, no run_script, no fake tool text in chat. Pass the user's location verbatim (zip if given, full city+state if given). If only an ambiguous city name, ask for state or zip before calling. On tool error or empty result, show the user the exact tool output; do not invent weather. For a future date within 16 days, set forecast_days on get_weather.
- To save/document content as a report: read_skill('markdown-report') → get_datetime(format: human) → fill template → save_markdown_report (never run_script for save_report.py). Put ALL report markdown only in the save_markdown_report tool argument — NEVER in chat (no preview, no code block, no sections). After save succeeds: ONE short sentence (e.g. draft saved, see preview on the right). Violating this is forbidden.`

const PROJECT_SYSTEM_PROMPT = `You are a helpful AI assistant. Respond concisely and accurately.

You have access to these tools — use them when relevant:
- list_skills: Lists all available skills/workflows
- read_skill: Reads a skill's full content by name
- run_script: Runs an executable script from a skill's scripts/ folder
- get_weather: Fetches weather for a location (required for all weather questions)
- get_datetime: Current date and time (use for {{DATE_TIME}} in reports)
- list_project_conversations: Lists conversations in the current project
- read_conversation: Reads full message history of a conversation
- save_markdown_report: Saves formatted markdown as a draft report linked to this conversation

Rules:
- When the user references a skill with /skill_name, ALWAYS call read_skill with that name to load it.
- When asked about available skills or what you can do, call list_skills.
- When a skill has scripts listed in its resources, use run_script to execute them when relevant (never for weather).
- Weather: read_skill('weather') when using /weather, then call get_weather only — pass location verbatim; on tool error show exact tool output to the user; never invent weather.
- Excerpts under "Relevant project knowledge" were retrieved automatically for this message; use them when helpful.
- For other project data (full documents, other conversations), use tools only when the user asks.
- To save/document content as a report: read_skill('markdown-report') → get_datetime(format: human) → fill template → save_markdown_report (never run_script for save_report.py). Put ALL report markdown only in the save_markdown_report tool argument — NEVER in chat (no preview, no code block, no sections). After save succeeds: ONE short sentence (e.g. draft saved, see preview on the right). Violating this is forbidden.`
function looksLikeReportBody(text) {
  if (!text || text.length < 80) return false
  if (text.includes('{{DATE_TIME}}')) return true
  const headings = (text.match(/^#{1,2}\s/mg) || []).length
  return headings >= 1 && text.length > 300
}

const RIGHT_WIDTH = 280
const SIDEBAR_EXPANDED_KEY = 'computerui_sidebar_expanded'

export default function App() {
  const {
    conversations,
    active,
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
  } = useConversations()
  const {
    projects,
    activeProject,
    activeProjectId,
    createProject,
    selectProject,
    clearActiveProject,
    deleteProject,
    setProjectName,
    setProjectInstructions,
    addKnowledge,
    removeKnowledge,
    refetchProject,
    buildProjectSystemPrompt,
    retrieveRelevantKnowledge,
  } = useProjects()
  const { send, abort, isStreaming, requestReasoning } = useOllama()

  const [streamingMessage, setStreamingMessage] = useState(null)
  const [documentCreating, setDocumentCreating] = useState(false)
  const [docPhase, setDocPhase] = useState('idle')
  const docRunActiveRef = useRef(false)
  const [model] = useState(DEFAULT_MODEL)
  const [view, setView] = useState('chat') // 'chat' | 'chatsList' | 'projects' | 'projectDetail' | 'gapAnalyzer'
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [startEditing, setStartEditing] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_EXPANDED_KEY)
      return v === null ? true : v === 'true'
    } catch {
      return true
    }
  })
  const [showSkillDirs, setShowSkillDirs] = useState(false)
  const [activeReportId, setActiveReportId] = useState(null)
  const [reportError, setReportError] = useState(null)
  const [savedDocuments, setSavedDocuments] = useState([])
  const [activeSavedDocument, setActiveSavedDocument] = useState(null)
  const openDocRef = useRef({ id: null, content: null, meta: null })

  const handleOpenDocumentChange = useCallback((id, content, meta) => {
    openDocRef.current = { id, content, meta }
  }, [])

  useEffect(() => {
    if (!activeId) {
      setSavedDocuments([])
      setActiveSavedDocument(null)
      setActiveReportId(null)
      setReportError(null)
      openDocRef.current = { id: null, content: null, meta: null }
      return undefined
    }
    let cancelled = false

    async function loadDocsAndPreview() {
      let docs = []
      try {
        docs = await loadSavedDocumentsForConversation(activeId)
        if (!cancelled) setSavedDocuments(docs)
      } catch {
        if (!cancelled) setSavedDocuments([])
      }

      if (!cancelled && docs.length > 0 && !active?.title?.trim()) {
        renameConversation(activeId, docs[0].title)
      }

      const draft = getSessionDraft(activeId)
      if (draft?.reportId) {
        if (!cancelled) {
          setActiveReportId(draft.reportId)
          setActiveSavedDocument(null)
        }
        return
      }

      const lastDocId = getLastDocumentId(activeId)
      const pickId = lastDocId && docs.some(d => d.id === lastDocId)
        ? lastDocId
        : docs[0]?.id
      if (pickId) {
        try {
          const full = await fetchSavedDocument(pickId)
          if (!cancelled) {
            setActiveSavedDocument(full)
            setActiveReportId(null)
          }
        } catch {
          if (!cancelled) {
            setActiveSavedDocument(null)
            setActiveReportId(null)
          }
        }
      } else if (!cancelled) {
        setActiveReportId(null)
        setActiveSavedDocument(null)
      }
    }

    loadDocsAndPreview()
    setReportError(null)
    return () => { cancelled = true }
  }, [activeId, active?.title, renameConversation])

  useEffect(() => {
    if (view === 'projectDetail' && activeProjectId) {
      refetchProject(activeProjectId)
    }
  }, [view, activeProjectId, refetchProject])

  const toggleSidebar = useCallback(() => {
    setSidebarExpanded(prev => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(next))
      } catch { /* ignore */ }
      return next
    })
  }, [])

  // Center panel right edge drag (adjusts right panel implicitly)
  const [centerWidth, setCenterWidth] = useState(null) // null = flex-1
  const centerDragging = useRef(false)
  const centerStartX = useRef(0)
  const centerStartW = useRef(0)
  const centerRef = useRef(null)

  const handleNewConv = useCallback((projectId) => {
    if (!projectId) clearActiveProject()
    createNew(projectId)
    setView('chat')
  }, [clearActiveProject, createNew])

  // Center resize
  function onCenterMouseDown(e) {
    e.preventDefault()
    centerDragging.current = true
    centerStartX.current = e.clientX
    centerStartW.current = centerRef.current?.offsetWidth || 600
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    function onMouseMove(e) {
      if (centerDragging.current) {
        const delta = e.clientX - centerStartX.current
        const newW = Math.max(320, centerStartW.current + delta)
        setCenterWidth(newW)
      }
    }
    function onMouseUp() {
      centerDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const handleSend = useCallback(async (text) => {
    let conv = active
    if (!conv) {
      conv = await createNew(activeProjectId || null)
    }
    if (!conv) return

    const convId = conv.id
    const userMsg = { role: 'user', content: text }
    const allMsgs = [...(conv.messages || []), userMsg]

    appendMessage(convId, userMsg)

    const weatherLocation = parseWeatherLocation(text)
    if (weatherLocation) {
      setStreamingMessage(null)
      setDocumentCreating(false)
      setDocPhase('idle')
      try {
        const result = await executeTool('get_weather', {
          location: weatherLocation,
          format: 'human',
        }, { projectId: conv.projectId, conversationId: convId })
        appendMessage(convId, {
          role: 'assistant',
          content: result,
          thinkContent: null,
        })
      } catch (err) {
        appendMessage(convId, {
          role: 'assistant',
          content: `Error: ${err.message}`,
          thinkContent: null,
        })
      }
      return
    }

    let messagesToSend, systemPrompt, tools

    if (conv.projectId) {
      // PROJECT MODE: full conversation history + RAG + project prompt
      const project = projects.find(p => p.id === conv.projectId)
      const projectConvs = conversations.filter(c => c.projectId === conv.projectId)
      const projectPrompt = buildProjectSystemPrompt(project, projectConvs)
      const ragChunks = await retrieveRelevantKnowledge(conv.projectId, text)
      const ragSection = formatRelevantKnowledge(ragChunks)
      systemPrompt = [PROJECT_SYSTEM_PROMPT, projectPrompt, ragSection, conv.systemPrompt]
        .filter(Boolean)
        .join('\n\n')
      messagesToSend = allMsgs
      tools = ALL_TOOLS
    } else {
      // REGULAR MODE: last 10 messages only, skill tools only
      systemPrompt = REGULAR_SYSTEM_PROMPT
      messagesToSend = allMsgs.slice(-10)
      tools = SKILL_TOOLS
    }

    let docSection = null
    if (openDocRef.current.content && openDocRef.current.meta) {
      docSection = formatDocumentContextSection(openDocRef.current.meta, openDocRef.current.content)
    } else {
      const mentioned = findMentionedDocument(text, savedDocuments)
      if (mentioned) {
        try {
          const full = await fetchSavedDocument(mentioned.id)
          docSection = formatDocumentContextSection(full, full.content)
        } catch { /* skip if fetch fails */ }
      }
    }
    if (docSection) {
      systemPrompt = [systemPrompt, docSection].filter(Boolean).join('\n\n')
    }

    const docRun = isDocumentRequest(text)
    docRunActiveRef.current = docRun
    if (docRun) {
      setDocPhase('preparing')
      setDocumentCreating(true)
      setStreamingMessage(null)
      setActiveReportId(null)
    } else {
      setDocumentCreating(false)
      setDocPhase('idle')
      setStreamingMessage({ content: '', thinkContent: null })
    }
    setReportError(null)

    const knownPhases = new Set(['read_skill', 'get_datetime', 'save_markdown_report'])

    await send({
      model,
      messages: messagesToSend,
      systemPrompt,
      tools,
      toolContext: { projectId: conv.projectId, conversationId: convId },
      onToolStart: ({ name }) => {
        if (!docRunActiveRef.current) return
        setDocPhase(knownPhases.has(name) ? name : 'preparing')
      },
      onDocumentToolActivity: () => {
        docRunActiveRef.current = true
        setDocumentCreating(true)
        setDocPhase(prev => (prev === 'idle' ? 'preparing' : prev))
      },
      onDraftCreated: ({ reportId, filename }) => {
        registerSessionDraft(convId, { reportId, filename })
        setActiveReportId(reportId)
        setActiveSavedDocument(null)
        setReportError(null)
      },
      onDraftFailed: ({ error }) => {
        setActiveReportId(null)
        setReportError(error)
      },
      onToken: ({ content, thinkContent }) => {
        if (!docRun) {
          setStreamingMessage({ content, thinkContent })
        }
      },
      onDone: ({ content, thinkContent, draftCreated, draftFailed }) => {
        setStreamingMessage(null)
        if (!draftCreated?.reportId) {
          docRunActiveRef.current = false
          setDocumentCreating(false)
          setDocPhase('idle')
        }
        let finalContent = content
        if (draftCreated?.reportId) {
          const name = draftCreated.filename ? ` (${draftCreated.filename})` : ''
          finalContent = `Document created. Preview it in the panel on the right${name}.`
        } else if (draftFailed?.error) {
          finalContent = draftFailed.error
        } else if (docRun && looksLikeReportBody(finalContent)) {
          finalContent = 'Document save did not complete. Try again — preview will appear on the right when save succeeds.'
        }
        appendMessage(convId, {
          role: 'assistant',
          content: finalContent,
          thinkContent,
        })
      },
      onError: (err) => {
        setStreamingMessage(null)
        docRunActiveRef.current = false
        setDocumentCreating(false)
        setDocPhase('idle')
        appendMessage(convId, { role: 'assistant', content: `Error: ${err.message}`, thinkContent: null })
      },
    })
  }, [active, projects, conversations, savedDocuments, appendMessage, createNew, send, model, buildProjectSystemPrompt, retrieveRelevantKnowledge])

  const handleCommitSave = useCallback(async (reportId) => {
    if (!activeId) throw new Error('No active conversation')
    const row = await commitSaveDocument(activeId, {
      reportId,
      projectId: active?.projectId || null,
    })
    clearSessionDraft(activeId)
    setActiveReportId(null)
    const full = await fetchSavedDocument(row.id)
    setActiveSavedDocument(full)
    setLastDocumentId(activeId, row.id)
    const docs = await loadSavedDocumentsForConversation(activeId)
    setSavedDocuments(docs)
    const title = row.title?.trim()
    if (title && (!active?.title?.trim() || active.title === 'Untitled conversation')) {
      await renameConversation(activeId, title)
    }
  }, [activeId, active?.projectId, active?.title, renameConversation])

  const handleSelectSavedDocument = useCallback(async (docId) => {
    const full = await fetchSavedDocument(docId)
    setActiveSavedDocument(full)
    setActiveReportId(null)
    if (activeId) setLastDocumentId(activeId, docId)
  }, [activeId])

  const handleOpenProjectDocument = useCallback(async (conversationId, documentId) => {
    const conv = conversations.find(c => c.id === conversationId)
    if (conv?.projectId) selectProject(conv.projectId)
    else clearActiveProject()
    select(conversationId)
    setView('chat')
    try {
      const full = await fetchSavedDocument(documentId)
      setActiveSavedDocument(full)
      setActiveReportId(null)
      const docs = await loadSavedDocumentsForConversation(conversationId)
      setSavedDocuments(docs)
    } catch (err) {
      setReportError(err.message)
    }
  }, [conversations, select, selectProject, clearActiveProject])

  const handleRequestReasoning = useCallback(async (msgIndex) => {
    if (!active) return
    const messages = active.messages || []
    const assistantMsg = messages[msgIndex]
    if (!assistantMsg || assistantMsg.role !== 'assistant') return
    // Find the preceding user message
    let userText = ''
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { userText = messages[i].content; break }
    }
    // Mark as loading
    updateMessageField(active.id, msgIndex, 'thinkContent', '...')
    try {
      const reasoning = await requestReasoning({ model, userText, assistantText: assistantMsg.content })
      updateMessageField(active.id, msgIndex, 'thinkContent', reasoning)
    } catch (err) {
      updateMessageField(active.id, msgIndex, 'thinkContent', `Error: ${err.message}`)
    }
  }, [active, model, requestReasoning, updateMessageField])

  const handleViewProjects = useCallback(() => {
    setView('projects')
  }, [])

  const handleViewChats = useCallback(() => {
    clearActiveProject()
    setView('chatsList')
  }, [clearActiveProject])

  const handleSelectProjectCard = useCallback((projectId) => {
    selectProject(projectId)
    setStartEditing(false)
    setView('projectDetail')
  }, [selectProject])

  const handleEditProjectCard = useCallback((projectId) => {
    selectProject(projectId)
    setStartEditing(true)
    setView('projectDetail')
  }, [selectProject])

  const handleNewConvFromProject = useCallback(async (projectId, initialText) => {
    const conv = await createNew(projectId)
    if (!conv) return
    setView('chat')
    if (initialText) {
      // Small delay so the chat view mounts before sending
      setTimeout(() => handleSend(initialText), 50)
    }
  }, [createNew, handleSend])

  const handleSelectConv = useCallback((convId) => {
    const conv = conversations.find(c => c.id === convId)
    if (conv?.projectId) {
      selectProject(conv.projectId)
    } else {
      clearActiveProject()
    }
    select(convId)
    setView('chat')
  }, [select, conversations, selectProject, clearActiveProject])

  const handleCreateProject = useCallback(async ({ name, instructions, knowledge }) => {
    const proj = await createProject(name)
    if (!proj) return
    if (instructions) await setProjectInstructions(proj.id, instructions)
    for (const k of knowledge) {
      await addKnowledge(proj.id, 'text', k.label, k.content)
    }
    setView('projects')
  }, [createProject, setProjectInstructions, addKnowledge])

  const handleViewGapAnalyzer = useCallback(() => {
    setView('gapAnalyzer')
  }, [])

  const handleProjectDetailBack = useCallback(() => {
    setView('projects')
  }, [])

  const handleProjectDetailSelectConv = useCallback((convId) => {
    select(convId)
    setView('chat')
  }, [select])

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      background: 'var(--bg-primary)',
    }}>
      <Sidebar
        expanded={sidebarExpanded}
        onToggle={toggleSidebar}
        projects={projects}
        conversations={conversations}
        activeConvId={active?.id}
        activeProjectId={activeProjectId}
        onSelectConv={handleSelectConv}
        onSelectProject={handleSelectProjectCard}
        onViewProjects={handleViewProjects}
        onViewChats={handleViewChats}
        onViewGapAnalyzer={handleViewGapAnalyzer}
        activeView={view}
        onNewProject={() => setShowCreateProject(true)}
        onNewConv={handleNewConv}
        onDeleteConv={deleteConversation}
        onRenameConv={renameConversation}
        onOpenSkillDirs={() => setShowSkillDirs(true)}
      />
      {/* MAIN CONTENT AREA */}
      {view === 'chatsList' && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ChatsView
            conversations={conversations}
            projects={projects}
            activeConvId={active?.id}
            onSelectConv={handleSelectConv}
            onDeleteConv={deleteConversation}
            onRenameConv={renameConversation}
            onNewConv={handleNewConv}
            onMoveConversation={moveConversationToProject}
            onMoveConversations={moveConversationsToProject}
            onDeleteConversations={deleteConversations}
          />
        </div>
      )}

      {view === 'gapAnalyzer' && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <GapAnalyzerView />
        </div>
      )}

      {view === 'projects' && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ProjectsView
            projects={projects}
            conversations={conversations}
            onSelectProject={handleSelectProjectCard}
            onEditProject={handleEditProjectCard}
            onDeleteProject={deleteProject}
            onNewProject={() => setShowCreateProject(true)}
          />
        </div>
      )}

      {view === 'projectDetail' && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ProjectCardView
            project={activeProject}
            conversations={conversations}
            onUpdateName={setProjectName}
            onUpdateInstructions={setProjectInstructions}
            onAddKnowledge={addKnowledge}
            onRemoveKnowledge={removeKnowledge}
            onSelectConv={handleProjectDetailSelectConv}
            onNewConv={handleNewConvFromProject}
            onOpenDocument={handleOpenProjectDocument}
            onBack={handleProjectDetailBack}
            startInEditMode={startEditing}
          />
        </div>
      )}

      {view === 'chat' && (
        <>
          {/* CENTER PANEL */}
          <div
            ref={centerRef}
            style={{
              flex: centerWidth ? 'none' : 1,
              width: centerWidth || undefined,
              minWidth: 320,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <CenterPanel
              conversation={active}
              isStreaming={isStreaming}
              streamingMessage={streamingMessage}
              onSend={handleSend}
              onStop={abort}
              onRequestReasoning={handleRequestReasoning}
            />
          </div>

          {/* CENTER RIGHT RESIZE HANDLE */}
          <div
            className="resize-handle"
            onMouseDown={onCenterMouseDown}
          />

          {/* RIGHT PANEL — document preview (fills space to window edge) */}
          <div style={{
            flex: 1,
            minWidth: RIGHT_WIDTH,
            flexShrink: 0,
            background: 'var(--bg-secondary)',
            borderLeft: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            <ReportPreviewPanel
              reportId={activeReportId}
              savedDocument={activeSavedDocument}
              savedDocuments={savedDocuments}
              error={reportError}
              documentCreating={documentCreating}
              documentPhase={docPhase}
              onPreviewReady={() => {
                docRunActiveRef.current = false
                setDocumentCreating(false)
                setDocPhase('idle')
              }}
              onCommitSave={handleCommitSave}
              onSelectSavedDocument={handleSelectSavedDocument}
              onOpenDocumentChange={handleOpenDocumentChange}
              onClose={() => {
                setActiveReportId(null)
                setActiveSavedDocument(null)
                setReportError(null)
                openDocRef.current = { id: null, content: null, meta: null }
                docRunActiveRef.current = false
                setDocumentCreating(false)
                setDocPhase('idle')
              }}
            />
          </div>
        </>
      )}

      <ProjectCreateModal
        open={showCreateProject}
        onClose={() => setShowCreateProject(false)}
        onCreate={handleCreateProject}
      />
      <SkillDirsModal
        open={showSkillDirs}
        onClose={() => setShowSkillDirs(false)}
      />
    </div>
  )
}
