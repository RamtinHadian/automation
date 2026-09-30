const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('popupApi', {
  onData: (cb) => ipcRenderer.on('popup:data', (_e, d) => cb(d)),
  open: () => ipcRenderer.send('popup:open'),
  close: () => ipcRenderer.send('popup:close'),
  hover: (on) => ipcRenderer.send('popup:hover', on),
});
