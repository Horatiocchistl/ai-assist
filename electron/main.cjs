require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const treeKill = require('tree-kill')
const portfinder = require('portfinder')
const http = require('http')
const { ElectronOllama } = require('electron-ollama')

let mainWindow
let expressProcess
let serverPort
let ollamaInstance

const DEFAULT_PORT = 3001

async function findAvailablePort() {
  try {
    return await portfinder.getPortPromise({ port: DEFAULT_PORT })
  } catch {
    return DEFAULT_PORT
  }
}

function waitForExpress(port, maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const check = () => {
      attempts++
      http.get(`http://localhost:${port}/api/health`, { timeout: 1000 }, (res) => {
        if (res.statusCode === 200) resolve(true)
        else retry()
      }).on('error', retry)
      function retry() {
        if (attempts >= maxAttempts) reject(new Error('Express server failed to start'))
        else setTimeout(check, 500)
      }
    }
    check()
  })
}

async function startOllama() {
  ollamaInstance = new ElectronOllama({
    basePath: app.getPath('userData'),
  })

  if (!(await ollamaInstance.isRunning())) {
    console.log('[ollama] Not running, starting...')
    try {
      const metadata = await ollamaInstance.getMetadata('latest')
      await ollamaInstance.serve(metadata.version, {
        serverLog: (msg) => console.log('[ollama]', msg),
        downloadLog: (pct, msg) => console.log('[ollama download]', pct + '%', msg),
      })
      console.log('[ollama] Started successfully')
    } catch (err) {
      console.error('[ollama] Failed to start:', err.message)
      return false
    }
  } else {
    console.log('[ollama] Already running')
  }
  return true
}

async function startExpressServer() {
  serverPort = await findAvailablePort()
  const serverPath = path.join(__dirname, '..', 'server.js')

  expressProcess = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(serverPort), NODE_ENV: 'production' },
    stdio: 'pipe',
    cwd: path.join(__dirname, '..')
  })

  expressProcess.stdout.on('data', (d) => console.log('[express]', d.toString().trim()))
  expressProcess.stderr.on('data', (d) => console.error('[express]', d.toString().trim()))
  expressProcess.on('error', (err) => console.error('Failed to start Express:', err))

  await waitForExpress(serverPort)
  console.log(`[express] Running on port ${serverPort}`)
}

function killExpress() {
  return new Promise((resolve) => {
    if (expressProcess && expressProcess.pid) {
      treeKill(expressProcess.pid, 'SIGTERM', (err) => {
        if (err) console.error('Error killing Express:', err)
        resolve()
      })
    } else {
      resolve()
    }
  })
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'AI Assist v1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  mainWindow.loadURL(`http://localhost:${serverPort}`)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

ipcMain.handle('gap:pickPlannedFolder', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Choose planned engagement folder',
  })
  if (canceled || !filePaths?.[0]) return { canceled: true }
  return { canceled: false, path: filePaths[0] }
})

function serializeImportRow(a) {
  return {
    asin: a.asin,
    url: a.url,
    folderName: a.folderName,
    warnings: a.warnings,
    txtFiles: a.txtFiles,
    imageNames: a.imageNames,
    ready: a.ready,
    files: a.files.map(f => ({
      kind: f.kind,
      filename: f.filename,
      label: f.label,
      sort_index: f.sort_index,
      mime: f.mime,
      base64: f.buffer.toString('base64'),
    })),
  }
}

ipcMain.handle('gap:readPlannedFolder', async (_, folderPath) => {
  if (!folderPath) return { error: 'No folder path' }
  try {
    const { readPlannedFolderForImport } = await import('../browser-agent/scan-planned-folder.js')
    const data = await readPlannedFolderForImport(folderPath)
    return {
      name: data.name,
      sourcePath: data.sourcePath,
      asins: data.asins.map(serializeImportRow),
      needsUrl: (data.needsUrl || []).map(serializeImportRow),
      errors: data.errors,
    }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('reports:saveAs', async (_, { content, defaultFilename }) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: defaultFilename || 'report.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (canceled || !filePath) return { canceled: true }
  fs.writeFileSync(filePath, content, 'utf-8')
  return { canceled: false, filePath }
})

app.on('ready', async () => {
  // 1. Start Ollama (auto-downloads if needed)
  const ollamaOk = await startOllama()
  if (!ollamaOk) {
    dialog.showMessageBox(null, {
      type: 'warning',
      title: 'Ollama Failed to Start',
      message: 'Could not start Ollama. LLM features may not work.',
      detail: 'The app will continue but chat responses will fail. Check console for details.',
      buttons: ['Continue Anyway'],
    })
  }

  // 2. Start Express server
  try {
    await startExpressServer()
  } catch (err) {
    dialog.showErrorBox('Startup Error', `Could not start backend server: ${err.message}`)
    app.quit()
    return
  }

  // 3. Open window
  await createWindow()
})

app.on('window-all-closed', async () => {
  await killExpress()
  app.quit()
})

app.on('before-quit', async () => {
  await killExpress()
})
