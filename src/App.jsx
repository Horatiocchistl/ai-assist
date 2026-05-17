import React, { useState, useCallback, useRef, useEffect } from 'react'
import CenterPanel from './components/CenterPanel.jsx'
import ProjectCardView from './components/ProjectCardView.jsx'
import ProjectCreateModal from './components/ProjectCreateModal.jsx'
import ProjectsView from './components/ProjectsView.jsx'
import Sidebar from './components/Sidebar.jsx'
import { useConversations } from './hooks/useConversations.js'
import { useProjects, formatRelevantKnowledge } from './hooks/useProjects.js'
import { useOllama } from './hooks/useOllama.js'
import { ALL_TOOLS, SKILL_TOOLS } from './lib/tools.js'
import SkillDirsModal from './components/SkillDirsModal.jsx'
import ReportPreviewPanel from './components/ReportPreviewPanel.jsx'
import ChatsView from './components/ChatsView.jsx'

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
- When a skill has scripts listed in its resources, use run_script to execute them when relevant.
- For weather questions, call get_weather with location (required). For a future date within 16 days, set forecast_days high enough to include that day. Never guess weather.
- To save/document content as a report: read_skill('markdown-report') → get_datetime(format: human) → fill template → save_markdown_report (never run_script for save_report.py). Put ALL report markdown only in the save_markdown_report tool argument — NEVER in chat (no preview, no code block, no sections). After save succeeds: ONE short sentence (e.g. draft saved, see preview on the right). Violating this is forbidden.`

const PROJECT_SYSTEM_PROMPT = `You are a helpful AI assistant. Respond concisely and accurately.

You have access to these tools — use them when relevant:
- list_skills: Lists all available skills/workflows
- read_skill: Reads a skill's full content by name
- run_script: Runs an executable script from a skill's scripts/ folder
- get_datetime: Current date and time (use for {{DATE_TIME}} in reports)
- list_project_conversations: Lists conversations in the current project
- read_conversation: Reads full message history of a conversation
- save_markdown_report: Saves formatted markdown as a draft report linked to this conversation

Rules:
- When the user references a skill with /skill_name, ALWAYS call read_skill with that name to load it.
- When asked about available skills or what you can do, call list_skills.
- When a skill has scripts listed in its resources, use run_script to execute them when relevant.
- Excerpts under "Relevant project knowledge" were retrieved automatically for this message; use them when helpful.
- For other project data (full documents, other conversations), use tools only when the user asks.
- To save/document content as a report: read_skill('markdown-report') → get_datetime(format: human) → fill template → save_markdown_report (never run_script for save_report.py). Put ALL report markdown only in the save_markdown_report tool argument — NEVER in chat (no preview, no code block, no sections). After save succeeds: ONE short sentence (e.g. draft saved, see preview on the right). Violating this is forbidden.`
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
  const [model] = useState(DEFAULT_MODEL)
  const [view, setView] = useState('chat') // 'chat' | 'chatsList' | 'projects' | 'projectDetail'
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

  useEffect(() => {
    setActiveReportId(null)
    setReportError(null)
  }, [activeId])

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

    setStreamingMessage({ content: '', thinkContent: null })
    setReportError(null)

    await send({
      model,
      messages: messagesToSend,
      systemPrompt,
      tools,
      toolContext: { projectId: conv.projectId, conversationId: convId },
      onDraftCreated: ({ reportId }) => {
        setActiveReportId(reportId)
        setReportError(null)
      },
      onDraftFailed: ({ error }) => {
        setActiveReportId(null)
        setReportError(error)
      },
      onToken: ({ content, thinkContent }) => {
        setStreamingMessage({ content, thinkContent })
      },
      onDone: ({ content, thinkContent, draftCreated, draftFailed }) => {
        setStreamingMessage(null)
        let finalContent = content
        if (draftCreated?.reportId) {
          const name = draftCreated.filename ? ` (${draftCreated.filename})` : ''
          finalContent = `Document created. Preview it in the panel on the right${name}.`
        } else if (draftFailed?.error) {
          finalContent = draftFailed.error
        }
        appendMessage(convId, {
          role: 'assistant',
          content: finalContent,
          thinkContent,
        })
      },
      onError: (err) => {
        setStreamingMessage(null)
        appendMessage(convId, { role: 'assistant', content: `Error: ${err.message}`, thinkContent: null })
      },
    })
  }, [active, projects, conversations, appendMessage, createNew, send, model, buildProjectSystemPrompt, retrieveRelevantKnowledge])

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
              error={reportError}
              onClose={() => {
                setActiveReportId(null)
                setReportError(null)
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
