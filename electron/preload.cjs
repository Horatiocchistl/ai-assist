const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  saveReportAs: (opts) => ipcRenderer.invoke('reports:saveAs', opts),
  pickPlannedFolder: () => ipcRenderer.invoke('gap:pickPlannedFolder'),
  readPlannedFolder: (folderPath) => ipcRenderer.invoke('gap:readPlannedFolder', folderPath),
})
