const { contextBridge, ipcRenderer } = require('electron');
// Expose specific operations, never ipcRenderer, filesystem or shell access.
contextBridge.exposeInMainWorld('deedDesktop', {
  isDesktop: true,
  assistantStatus: () => ipcRenderer.invoke('deed:assistant-status'),
  ask: request => ipcRenderer.invoke('deed:ask', request),
  modelSetup: () => ipcRenderer.invoke('deed:model-setup'),
  downloadModel: () => ipcRenderer.invoke('deed:download-model'),
  cancelDownload: () => ipcRenderer.invoke('deed:cancel-download')
});
