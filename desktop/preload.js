const { contextBridge, ipcRenderer } = require('electron');

// The web app detects the desktop shell through window.desktop and shows extra controls only there.
contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  getSettings: () => ipcRenderer.invoke('desktop:get'),
  setSettings: (patch) => ipcRenderer.invoke('desktop:set', patch),
  notify: (n) => ipcRenderer.send('desktop:notify', n),
  focus: () => ipcRenderer.send('desktop:focus'),
  onSettings: (cb) => {
    const fn = (_e, s) => cb(s);
    ipcRenderer.on('desktop:settings', fn);
    return () => ipcRenderer.removeListener('desktop:settings', fn);
  },
  onOpenNotification: (cb) => {
    const fn = (_e, n) => cb(n);
    ipcRenderer.on('desktop:open-notification', fn);
    return () => ipcRenderer.removeListener('desktop:open-notification', fn);
  },
});
