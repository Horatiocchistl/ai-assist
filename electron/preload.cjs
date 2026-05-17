const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  saveReportAs: (opts) => ipcRenderer.invoke('reports:saveAs', opts),
})
