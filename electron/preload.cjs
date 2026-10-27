const {contextBridge, ipcRenderer, webUtils} = require('electron');
const invoke = name => (...args) => ipcRenderer.invoke('velvet:' + name, ...args);
const subscribe = channel => callback => {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('velvet', {
  readState: invoke('readState'),
  searchCatalog: invoke('searchCatalog'),
  saveState: invoke('saveState'),
  chooseFiles: invoke('chooseFiles'),
  chooseFolder: invoke('chooseFolder'),
  previewImport: invoke('previewImport'),
  commitImport: invoke('commitImport'),
  cancelImport: invoke('cancelImport'),
  openExternal: invoke('openExternal'),
  showInFolder: invoke('showInFolder'),
  exportLibrary: invoke('exportLibrary'),
  importPlaylist: invoke('importPlaylist'),
  exportPlaylist: invoke('exportPlaylist'),
  exportSettings: invoke('exportSettings'),
  importSettings: invoke('importSettings'),
  setMiniMode: invoke('setMiniMode'),
  setGlobalShortcuts: invoke('setGlobalShortcuts'),
  watchFolder: invoke('watchFolder'),
  unwatchFolder: invoke('unwatchFolder'),
  getVersion: invoke('getVersion'),
  chooseBackground: invoke('chooseBackground'),
  clearBackground: invoke('clearBackground'),
  getPathForFile: file => webUtils.getPathForFile(file),
  onImportProgress: subscribe('velvet:importProgress'),
  onLibraryChanged: subscribe('velvet:libraryChanged'),
  onWatchError: subscribe('velvet:watchError'),
  onMediaCommand: subscribe('velvet:mediaCommand'),
  onMiniMode: subscribe('velvet:miniMode'),
});

