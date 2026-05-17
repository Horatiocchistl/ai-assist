# Amazon Page Gap Analyzer — Architecture Plan

**Device:** Apple M5 Pro · 24GB Unified Memory · macOS  
**Stack:** Electron · React · Ministral 3 14B (vision + orchestration) · Ollama Metal · Playwright · pixelmatch · Tesseract.js · Supabase  
**Purpose:** Professional CPG consulting tool — automates what the consultant already does manually with their own credentials and browser session
**LLM:** Runs fully local — Supabase is the persistent backend

---

## Overview

A professional CPG consulting tool that automates what a consultant already does manually: open Amazon product pages in your own browser with your own credentials, scroll through them, compare what's live against what was planned, and document the gaps for your client.

The tool extends the consultant's workflow — it does not replace or simulate it. Playwright runs **your authenticated browser session** using your own Amazon login. Ministral 3 14B handles the tedious visual comparison and gap documentation that would otherwise be done by eye. Results are persisted to Supabase for client reporting and longitudinal tracking across engagements.

**Throughput target:** 25–50 ASINs/day. Accuracy is the priority — each page gets the same thoroughness you would apply manually, just without the fatigue.

---

## Use Context

**The consultant provides a list of up to 50 URLs. The tool works through them in a Chromium session logged in as the consultant, behaving like a human doing the same review manually.**

**Workflow:**
1. Consultant uploads planned assets (images, copy specs) per ASIN into the React UI
2. Pastes up to 50 Amazon product URLs into the URL list
3. Hits Run — tool opens each URL in its Chromium session in order
4. For each page: scrolls at human pace, waits for images to fully load, captures each section
5. Ministral 3 14B compares each live section against the planned assets
6. Gap report written to Supabase after each page — consultant can review as the batch runs

**Session model:**
The tool maintains a single persistent Chromium session logged in as the consultant. Cookies are stored via Keytar in macOS Keychain so the consultant only logs in once. If the session expires mid-batch, the run pauses and prompts the consultant to re-authenticate in the Chromium window before continuing.

**Human behaviour is not optional:**
The Chromium session must behave like a person doing afternoon work — realistic scroll timing with natural variation, mouse movement, time between pages. Not because of legal concerns but because Amazon's bot detection will interrupt the session with CAPTCHAs otherwise, breaking the run mid-batch. This is an engineering requirement, not a compliance position.

---

---

## Why the M5 Pro 24GB Changes the Build

| Factor | Impact |
|---|---|
| Ministral 3 14B — **single model, natively multimodal** | Handles orchestration AND vision — no second model needed, resolves memory budget entirely |
| ~14GB freed vs. two-model approach | Comfortable headroom for Electron, Chromium, KV cache, and OS |
| Accuracy-first, 25–50 ASINs/day throughput | ~3–6 min per ASIN acceptable — enables deeper per-section analysis |
| Ollama **Metal backend** auto-enabled | All model layers on GPU — no CUDA/ROCm setup |
| **Headed** Chromium faster than headless on Apple Silicon | Metal GPU-accelerated rendering; also makes Amazon auth/MFA debugging practical |

### Memory Budget

```
ministral-3:14b Q8       9.0 GB   Orchestration + vision (single model)
KV cache (8192 ctx)      2.5 GB   Mistral context window allocation
Ollama runtime buffers   0.5 GB
macOS kernel + daemons   2.0 GB
Electron + React         0.6 GB   UI renderer
Chromium (headed)        0.9 GB   Real-world headed Chromium on complex page
Node orchestrator        0.3 GB   Tool loop, diff engine
─────────────────────────────────────────────
Realistic total         ~15.8 GB   8+ GB headroom on 24GB device
```

### Performance Estimates

| Operation | Estimate | Notes |
|---|---|---|
| Ministral 3 14B inference | ~30–50 tok/sec | Metal, single model, no swap overhead |
| Ministral vision call (planned vs live) | ~10–20 sec/section | Native vision encoder, no separate model |
| Playwright page capture (full scroll) | ~20–40 sec | Thorough scroll + image-complete wait |
| pixelmatch + Tesseract OCR per section | <2 sec | Deterministic, CPU-bound |
| **Total per ASIN (PDP full)** | **~3–6 min** | Acceptable at 25–50/day target |
| 25 ASINs/day | ~75–150 min | Comfortable daytime run |
| 50 ASINs/day | ~150–300 min | Overnight batch |
| Cold model load | ~8–12 sec | Single model loads faster than two |

---

## Architecture Layers

### 1. Electron Shell

Desktop container — hosts the React UI renderer, bridges IPC to the Node main process, manages child processes, and stores Amazon credentials securely in the macOS Keychain.

**Responsibilities:**
- `BrowserWindow` renders the React Control Center (no dev server in production)
- IPC main ↔ renderer messaging for all orchestrator commands and log events
- `Keytar` persists the consultant's Amazon session cookies in macOS Keychain — single session, not a multi-client vault
- `process-manager.js` spawns the Ollama daemon on app launch if not already running
- Spawns Playwright Chromium runner; surfaces the window to the consultant for manual login if session expired
- Supabase JS client initialized in main process — renderer communicates via IPC
- `electron-builder` targets `arm64` `.dmg` for M-series native binary

**Key files:** `main.js` · `preload.js` · `ipc-handlers.js` · `credential-store.js` · `process-manager.js` · `supabase-client.js` · `electron-builder.yml`

---

### 2. React Control Center

Operator dashboard — manage ASINs and planned assets, launch and monitor runs, review side-by-side diffs, export gap reports.

**Responsibilities:**
- **ASIN Manager** — add/edit/group product pages to analyze; synced to Supabase `asins` table
- **Plan Asset Uploader** — drag-drop reference images to Supabase Storage, copy docs and specs per ASIN
- **Run Panel** — launch / pause / cancel with live log stream from IPC events
- **Diff Viewer** — planned vs. live screenshots side-by-side with pixelmatch heatmap overlay
- **Gap Report Table** — Critical / Warning / OK badges, filter, sort, bulk actions; reads from Supabase `gaps` table
- **Memory Monitor** — polls `Ollama /api/ps` every 3s to show live model RAM usage
- **Export** — CSV, PDF, or raw JSON gap reports per ASIN or full batch

**Key files:** `AsinManager.jsx` · `AssetUploader.jsx` · `RunPanel.jsx` · `DiffViewer.jsx` · `GapReportTable.jsx` · `MemoryMonitor.jsx` · `ExportMenu.jsx`

---

### 3. Ministral 3 14B — Unified Orchestrator + Vision Model

Ministral 3 14B is a natively multimodal model — it handles both orchestration (tool-call decisions, gap descriptions, structured JSON output) and vision comparison (planned asset vs. live capture) in a single model instance via Ollama Metal backend (`localhost:11434`). No second model is needed.

**Why Ministral 3 14B specifically:**
- Native vision encoder built in — not bolted on like LLaVA's CLIP adapter
- Supports tool use, structured output, and image input natively (Apache 2.0 licence)
- 256K context window — entire page analysis history fits in one session
- ~9GB at Q8 on disk; ~12–13GB runtime including KV cache — leaves 10+ GB headroom on 24GB device
- Single model means no memory coordination, no model-swap latency, simpler orchestrator code

**Responsibilities:**
- Receives current page screenshot + planned asset images + tool history in one prompt
- Decides next action: `scroll_next` / `capture_section` / `extract_text` / `compare_asset` / `flag_gap` / `done`
- Performs its own image-vs-image visual comparison when called with `compare_asset` — no separate vision model
- Strict JSON output enforced via Ollama `format: "json"` + low temperature (0.1)
- Prompt templates per page type: PDP, A+ Content, Brand Store, Sponsored
- `num_ctx: 8192` — fits full base64 images + tool history comfortably

**Ollama call (unified — orchestration and vision in the same call):**
```js
// orchestrator/ollama-client.js
export async function callMinistral(messages, images = []) {
  const res = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "ministral-3:14b",
      format: "json",
      stream: false,
      messages: messages.map((m, i) =>
        // attach images to the last user message
        i === messages.length - 1 && images.length
          ? { ...m, images }
          : m
      ),
      options: { temperature: 0.1, num_ctx: 8192, num_gpu: 99 },
    }),
  });
  const data = await res.json();
  return JSON.parse(data.message.content);
}
```

**Key files:** `orchestrator.js` · `ollama-client.js` · `tool-registry.js` · `prompts/pdp.txt` · `prompts/aplus.txt` · `prompts/brand-store.txt` · `schemas/gap-output.json`

---

### 5. Playwright Browser Agent

Authenticated headed Chromium session — logs into Amazon as a real user, navigates product pages, triggers lazy-load content by scrolling, and captures each page section faithfully.

**Responsibilities:**
- Persistent browser context: loads saved auth cookies from macOS Keychain via Keytar
- Runs **headed** — Metal GPU acceleration makes headed faster than headless on M5; also required for MFA/CAPTCHA handling
- Auto-login flow with MFA support if session is expired
- Scroll loop: scroll 600px → wait `networkidle` → `MutationObserver` idle → capture
- Per-section captures: Hero · Feature Bullets · A+ Content · Image Carousel · Reviews · Footer
- DOM text extraction per section for copy comparison
- Request interceptor blocks non-essential third-party requests (analytics pixels, ad calls) — same as what an ad-blocker does in normal browsing

**Key files:** `browser-session.js` · `amazon-auth.js` · `page-navigator.js` · `scroll-controller.js` · `screenshot-capture.js` · `dom-extractor.js` · `request-interceptor.js`

---

### 6. Diff & Analysis Engine

Pixel-level and semantic comparison layer — combines three approaches to find every class of gap.

| Method | Tool | What it catches |
|---|---|---|
| Pixel diff | `pixelmatch` | Exact pixel changes — generates heatmap overlay for the UI |
| Perceptual hash | `sharp` + pHash | Fast asset identity check before full pixel diff |
| OCR text extraction | `Tesseract.js` (WASM) | Live copy vs. planned copy — no external process |
| Vision comparison | Ministral 3 14B (native) | Layout, colour, asset swaps, missing modules — same model as orchestrator |

**Gap severity scoring:**

| Severity | Definition |
|---|---|
| **Critical** | Asset missing, completely wrong image, module absent |
| **Warning** | Copy drift, colour mismatch, layout shift, partial content |
| **OK** | Within acceptable tolerance |

**Key files:** `image-diff.js` · `phash.js` · `ocr-extractor.js` · `gap-scorer.js`

---

### 7. Supabase — Persistent Backend

Supabase (hosted Postgres) is the system of record for all runs, gaps, assets, and ASIN metadata. The Supabase JS client runs in the Electron main process and is exposed to the renderer via IPC — never directly in the renderer to keep the service key out of the browser context.

**Responsibilities:**
- **`asins` table** — ASIN list, page type, planned asset references, group tags
- **`runs` table** — per-run status, timestamps, ASIN FK, page type
- **`gaps` table** — per-gap records: section, type, severity, LLM description, run FK
- **`Supabase Storage`** — planned asset images, live screenshots, pixelmatch diff heatmaps (stored as blobs referenced by URL in `gaps` table)
- **Realtime subscriptions** — React Run Panel subscribes to `runs` row updates for live status; no polling needed
- **Row Level Security (RLS)** — service role key used in main process only; anon key never exposed

**Supabase client (main process only):**
```js
// electron/supabase-client.js
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service key — main process only, never renderer
);
```

**IPC handler pattern:**
```js
// electron/ipc-handlers.js
ipcMain.handle("gaps:insert", async (event, payload) => {
  const { data, error } = await supabase.from("gaps").insert(payload);
  if (error) throw error;
  return data;
});
```

**Key files:** `supabase-client.js` · `ipc-handlers.js` · `supabase/migrations/001_initial.sql` · `supabase/migrations/002_storage_buckets.sql`

---

## Agent Flow

```
01  Setup           Consultant uploads planned assets per ASIN; pastes list of up to 50 URLs
        ↓
02  Launch          Ollama daemon starts (Ministral 3 14B pre-loaded); Chromium session restores
                    from saved cookies — or surfaces login window if session expired
        ↓
03  Per URL loop ─────────────────────────────────────────────────────────────────────────────┐
        ↓                                                                                     │
04  Navigate        Opens URL; waits for initial page load                                    │
        ↓                                                                                     │
05  Scroll          Human-pace scroll (randomised speed/delay); captures each section         │
                    after confirming all viewport images are fully rendered                   │
        ↓                                                                                     │
06  Analyse         Ministral 3 14B receives live section + planned asset; flags gaps;        │
                    Tesseract extracts copy; pixelmatch generates heatmap                     │
        ↓                                                                                     │
07  Persist         Gaps + screenshots written to Supabase; React UI updates live             │
        ↓                                                                                     │
08  Next URL        Human-pace delay between pages (15–45s); loop continues ─────────────────┘
        ↓
09  Review          Consultant reviews Diff Viewer per ASIN; exports CSV or PDF for client
```

### Ministral 3 14B — Unified Orchestration + Vision (Steps 06–07)

```js
// Single model call — Ministral handles both the decision AND the visual comparison
// when images are provided, it uses its native vision encoder
const action = await callMinistral(
  [
    { role: "system", content: PDP_SYSTEM_PROMPT },
    { role: "user",   content: buildContext(history, currentScreenshot) },
  ],
  action.tool === "compare_asset"
    ? [plannedAssetB64, liveScreenshotB64]  // attach both images for vision comparison
    : []                                     // text-only for non-visual tool calls
);
// → { tool: "flag_gap", section: "hero", gaps: [{ type: "color_mismatch", severity: "warning", desc: "..." }] }

if (action.tool === "flag_gap") {
  await supabase.from("gaps").insert(
    action.gaps.map(g => ({ ...g, run_id: runId, section: action.section }))
  );
}
```

---

## Ollama Setup — macOS Apple Silicon

```bash
# Install Ollama (Homebrew)
brew install ollama

# Pull single model — natively multimodal, handles orchestration AND vision
ollama pull ministral-3:14b             # ~9GB, vision + tool use + structured output
ollama pull nomic-embed-text            # Copy similarity embeddings (~300MB)

# Verify Metal backend and vision capability
ollama run ministral-3:14b --verbose
# Should show: "llama_new_context_with_model: Metal ..."

# Test vision works
ollama run ministral-3:14b "describe this image" --image ./test.png

# Set context in ~/.ollama/config.json
# { "num_ctx": 8192 }
```

---

## Tech Stack

| Area | Libraries | Purpose |
|---|---|---|
| Browser automation | `playwright`, `playwright-chromium` | Auth, scroll, screenshot |
| Local LLM | `node-fetch` (Ollama REST) | Ministral 3 14B — vision + orchestration in one model |
| Image diff | `pixelmatch`, `pngjs`, `sharp` | Pixel delta, pHash, resize |
| OCR | `tesseract.js` | Extract live copy from screenshots |
| Database + storage | `@supabase/supabase-js` | Postgres persistence + blob storage + realtime |
| Electron | `electron`, `electron-builder`, `keytar` | Desktop shell, IPC, Keychain |
| React UI | `react`, `tailwindcss`, `zustand`, `react-dropzone` | Control center + diff viewer |
| Export | `papaparse`, `jspdf`, `jspdf-autotable` | CSV and PDF gap reports |

---

## Supabase Schema

```sql
-- supabase/migrations/001_initial.sql

create table asins (
  id          uuid primary key default gen_random_uuid(),
  asin        text not null,
  page_type   text,          -- pdp | aplus | brand_store | sponsored
  group_tag   text,
  created_at  timestamptz default now()
);

create table runs (
  id          uuid primary key default gen_random_uuid(),
  asin_id     uuid references asins(id),
  started_at  timestamptz,
  finished_at timestamptz,
  status      text           -- running | complete | error
);

create table gaps (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid references runs(id),
  section         text,      -- hero | bullets | aplus | carousel | reviews
  gap_type        text,      -- image_missing | image_wrong | copy_drift
                             -- color_mismatch | layout_shift | asset_swapped
  severity        text,      -- critical | warning | ok
  description     text,      -- LLM plain-English description
  planned_img_url text,      -- Supabase Storage URL
  live_img_url    text,      -- Supabase Storage URL
  diff_img_url    text,      -- pixelmatch heatmap Storage URL
  created_at      timestamptz default now()
);

-- supabase/migrations/002_storage_buckets.sql
insert into storage.buckets (id, name, public)
values
  ('planned-assets', 'planned-assets', false),
  ('live-captures',  'live-captures',  false),
  ('diff-heatmaps',  'diff-heatmaps',  false);
```

---

## File Structure

```
amazon-gap-analyzer/
├── electron/
│   ├── main.js                        ← App entry, spawns Ollama + Playwright
│   ├── preload.js                     ← Secure contextBridge IPC
│   ├── ipc-handlers.js                ← All IPC command routing + Supabase calls
│   ├── supabase-client.js             ← Supabase JS client (main process only)
│   ├── credential-store.js            ← Keytar: consultant session cookies in Keychain
│   ├── process-manager.js             ← Spawn/monitor Ollama daemon
│   └── electron-builder.yml           ← arm64 dmg target for M-series
│
├── orchestrator/
│   ├── orchestrator.js                ← Main agent loop
│   ├── ollama-client.js               ← Ministral 3 14B client (vision + text)
│   ├── tool-registry.js               ← Tool definitions + dispatch
│   ├── prompts/
│   │   ├── system-pdp.txt
│   │   ├── system-aplus.txt
│   │   └── system-brand-store.txt
│   └── schemas/
│       └── gap-output.json            ← JSON schema for LLM output
│
├── browser-agent/
│   ├── browser-session.js             ← Persistent Playwright context
│   ├── amazon-auth.js                 ← Login + MFA, cookies from Keychain
│   ├── page-navigator.js              ← Navigate to ASIN URL
│   ├── scroll-controller.js           ← Scroll loop + idle detection
│   ├── screenshot-capture.js          ← Per-section PNG captures
│   ├── dom-extractor.js               ← Text + structure extraction
│   └── request-interceptor.js         ← Block non-essential third-party requests (ad-blocker equivalent)
│
├── diff-engine/
│   ├── image-diff.js                  ← pixelmatch heatmap
│   ├── phash.js                       ← Perceptual hash asset check
│   ├── ocr-extractor.js               ← Tesseract.js WASM wrapper
│   └── gap-scorer.js                  ← Critical / Warning / OK
│
├── supabase/
│   └── migrations/
│       ├── 001_initial.sql            ← asins, runs, gaps tables
│       └── 002_storage_buckets.sql    ← planned-assets, live-captures, diff-heatmaps
│
└── renderer/  (React + Vite)
    ├── AsinManager.jsx
    ├── AssetUploader.jsx              ← uploads to Supabase Storage via IPC
    ├── RunPanel.jsx                   ← Supabase Realtime subscription on runs
    ├── DiffViewer.jsx                 ← Loads Storage URLs for side-by-side view
    ├── GapReportTable.jsx             ← Queries gaps table via IPC
    ├── MemoryMonitor.jsx              ← Polls Ollama /api/ps
    └── ExportMenu.jsx
```

---

## Key Architectural Decisions

### Single Model for Orchestration and Vision

Ministral 3 14B replaces the original two-model architecture (Mistral 14B + LLaVA 13B). Because it is natively multimodal, the same model call that decides what tool to invoke can also perform the visual comparison when images are passed. This eliminates model-swap latency, cuts runtime memory from ~24GB to ~16GB, and simplifies the orchestrator to a single client.

### Accuracy Over Speed

At 25–50 ASINs/day, each page gets full treatment: complete scroll capture, per-section image-complete verification, and thorough Ministral vision comparison against planned assets. No shortcuts for throughput.

### Supabase in Main Process Only

The Supabase service key must **never** be exposed in the renderer process (BrowserWindow). All Supabase operations go through IPC:

```
Renderer (React) → ipcRenderer.invoke("gaps:query", filters)
                 → Main process ipc-handlers.js
                 → supabase.from("gaps").select(...)
                 → Returns data back over IPC
```

This keeps the service key out of DevTools, prevents XSS from escalating to database access, and means no Supabase credentials are ever bundled into the renderer bundle.

---

## Next Steps

1. **`orchestrator.js`** — full agent loop with Ministral 3 14B unified tool dispatch
2. **`ollama-client.js`** — single client with image array support for vision calls
3. **`scroll-controller.js` + `screenshot-capture.js`** — Playwright scroll + image-complete verification
4. **`amazon-auth.js`** — persistent session + Keychain cookie flow
5. **`DiffViewer.jsx`** — React side-by-side viewer with heatmap overlay
6. **Supabase migrations** — schema + storage bucket setup
7. **`gap-output.json`** — JSON schema for enforcing structured LLM output
