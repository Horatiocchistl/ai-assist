# AI Assist v1

Local-first AI desktop assistant for macOS: **Electron + React** UI, **Ollama** for inference, **Express** for skills and tools, **Supabase** for projects, conversations, and RAG knowledge.

Repository: [github.com/Horatiocchistl/ai-assist](https://github.com/Horatiocchistl/ai-assist)

---

## What this project is

**AI Assist v1** is a consultant-style workspace: chat with a local model, organize work in **projects** (instructions + file knowledge + scoped chats), run **skills** from configurable folders, and save **markdown report drafts** with preview and export.

A planned **CPG (Consumer Packaged Goods)** module—Amazon product-page gap analysis against planned assets—is documented in [`amazon-gap-analyzer-plan.md`](amazon-gap-analyzer-plan.md). That work is **not implemented yet**; the current app delivers the foundation below.

---

## Features implemented

### Desktop shell

- **Electron** app (`electron/main.cjs`) starts **Ollama** (`electron-ollama`), spawns **Express** on a dynamic port (default 3001), and loads the Vite-built UI from `dist/`.
- macOS **Save as…** for reports via IPC (`electron/preload.cjs`).

### Chat

- Streaming chat with **Ministral 3 14B** (configurable via Ollama).
- Tool loop: skills, weather, datetime, markdown reports, project conversation tools.
- Optional reasoning display; abort in-flight generation.

### Projects

- Create/edit/delete projects in Supabase (`computerui_projects`).
- Per-project **instructions** and **knowledge** files (text, markdown, **PDF**, **Word .docx** via `mammoth` / `pdfjs-dist`).
- Knowledge chunked and embedded with **nomic-embed-text**; RAG injected into project chats (`knowledge_chunks`).
- Project detail view: start chat, manage files, edit metadata.

### Chats

- **Chats** view: searchable list of all conversations, rename, move to project, bulk select/delete/move.
- Sidebar: recents, new chat, navigation to Projects and Chats list.
- Conversations and messages persisted in Supabase (`computerui_conversations`, `computerui_messages`).

### Reports

- `save_markdown_report` tool writes drafts under `reports/` (gitignored content).
- **Right panel** preview after save; native **Save as…** for `.md` export.
- Server fills `{{DATE_TIME}}` when saving if the model omits it.

### Skills

- Skill directories from `skill-dirs.json` and in-app **Skill Folders** modal.
- `list_skills`, `read_skill`, `run_script` tools backed by Express (`server.js`).

### Design system

- CSS variables in `src/index.css` (sage/cream palette, green accent).
- Inline-style React components consistent across Projects, Chats, modals.
- Chats view uses a **list** layout (not project-style cards).

### Agent / team rules (`.cursor/rules/`)

- **no-unrequested-changes** — answer questions without coding unless asked.
- **ask-before-closing-gaps** — never fill ambiguous requirements without asking if/how.
- **restart-app-after-changes** — stop processes and `npm run electron:dev` after UI/server edits.

---

## Stack

| Layer | Technology |
|--------|------------|
| Desktop | Electron 42, electron-builder |
| UI | React 18, Vite 6, Tailwind (base), Lucide icons |
| LLM | Ollama (`ministral-3:14b`, `nomic-embed-text`) |
| API | Express (`server.js`) |
| Data | Supabase (Postgres + anon client in renderer) |
| Docs | mammoth, pdfjs-dist |

---

## Prerequisites

- macOS (Apple Silicon tested)
- [Ollama](https://ollama.com) with models:
  ```bash
  ollama pull ministral-3:14b
  ollama pull nomic-embed-text
  ```
- Supabase project with tables for conversations, messages, projects, and `knowledge_chunks` (see app hooks for column shapes)

---

## Setup

1. Clone and install:
   ```bash
   git clone https://github.com/Horatiocchistl/ai-assist.git
   cd ai-assist
   npm install
   ```

2. Create `.env` in the project root (not committed):
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_OLLAMA_HOST=http://localhost:11434
   ```

3. Run the desktop app:
   ```bash
   npm run electron:dev
   ```
   Builds UI → starts Ollama if needed → Express → opens the AI Assist v1 window.

### Browser-only dev (optional)

```bash
npm start
```

Vite on :5173, API on :3001 — not the full Electron experience.

---

## Project layout

```
ai-assist/
├── electron/           # Main process, preload, Ollama + Express lifecycle
├── src/
│   ├── App.jsx         # View routing: chat, chatsList, projects, projectDetail
│   ├── components/     # UI (ChatsView, ProjectsView, Sidebar, …)
│   ├── hooks/          # useConversations, useProjects, useOllama
│   └── lib/            # tools, supabase, embeddings, extractFileText
├── server.js           # Skills, reports API, weather, datetime
├── reports/            # Draft markdown (gitignored except .gitkeep)
├── amazon-gap-analyzer-plan.md   # CPG feature architecture (planned)
└── .cursor/rules/      # Cursor agent constraints
```

---

## Roadmap (planned, not built)

From [`amazon-gap-analyzer-plan.md`](amazon-gap-analyzer-plan.md):

- **CPG** as a first-class app area (not a generic project subtype).
- Playwright headed browser with consultant Amazon session (Keychain cookies).
- ASIN batches, planned assets, gap runs, pixel/OCR/vision diff, Supabase `cpg_*` tables.
- Control center: run panel, diff viewer, gap exports (CSV/PDF).

Implementation waits on product UI specs and explicit build approval.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run electron:dev` | Production build + Electron (primary) |
| `npm run electron:build` | Package `.dmg` / `.zip` for macOS |
| `npm start` | Ollama + Express + Vite dev servers |
| `npm run build` | Vite build only |
| `npm run server` | Express only |

---

## License

Private application (`package.json` `"private": true`). Add a license file if you intend to open-source.
