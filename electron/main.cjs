const {app, BrowserWindow, ipcMain, dialog, shell, protocol, net, session, globalShortcut, Menu} = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {Readable} = require('node:stream');
const {AudiusProvider}=require('./audius.cjs');
const audius=new AudiusProvider();
const {StateStore, ImportManager, CatalogSearch, publicState, validExternalURL, parsePlaylist, playlistDocument, safeJson, AUDIO_EXTENSIONS} = require('./library.cjs');

protocol.registerSchemesAsPrivileged([{scheme: 'velvet-media', privileges: {standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true}}]);
app.setName('Velvet');
const testMode = process.argv.includes('--velvet-test') && !app.isPackaged;
if (testMode) app.setPath('userData', process.env.VELVET_TEST_USER_DATA ? path.resolve(process.env.VELVET_TEST_USER_DATA) : path.join(app.getAppPath(), 'work', 'desktop-test-user-data'));
else if (process.env.VELVET_USER_DATA) app.setPath('userData', path.resolve(process.env.VELVET_USER_DATA));
let mainWindow;
let store;
let importer;
let catalog;
let mini = false;
let previousBounds;
let quittingAfterFlush = false;
const watchers = new Map();
const watchTimers = new Map();
const safeSend = (channel, value) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, value); };
const COMMANDS = {MediaPlayPause: 'playPause', MediaNextTrack: 'next', MediaPreviousTrack: 'previous', MediaStop: 'stop', 'CommandOrControl+Alt+Space':'playPause', 'CommandOrControl+Alt+Right':'next', 'CommandOrControl+Alt+Left':'previous'};

function requireRenderer(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Request rejected from an untrusted window.');
}
function handle(channel, callback) {
  ipcMain.handle('velvet:' + channel, async (event, ...args) => {
    requireRenderer(event);
    try { return await callback(...args); }
    catch (error) { throw new Error(error?.message || 'Velvet could not complete this action.'); }
  });
}
function sendCommand(command) { safeSend('velvet:mediaCommand', command); }

function setGlobalShortcuts(enabled) {
  globalShortcut.unregisterAll();
  if (!enabled) return {enabled: false, registered: []};
  const registered = [];
  for (const [key, action] of Object.entries(COMMANDS)) if (globalShortcut.register(key, () => sendCommand(action))) registered.push(key);
  return {enabled: registered.length > 0, registered};
}

function setMiniMode(enabled) {
  const next = Boolean(enabled);
  if (!mainWindow || mini === next) return {enabled: mini};
  mini = next;
  if (mini) {
    previousBounds = mainWindow.getBounds();
    mainWindow.setMinimumSize(400, 230);
    mainWindow.setSize(460, 270);
    mainWindow.setAlwaysOnTop(true, 'floating');
  } else {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setMinimumSize(1000, 680);
    if (previousBounds) mainWindow.setBounds(previousBounds);
    else mainWindow.setSize(1440, 930);
  }
  safeSend('velvet:miniMode', mini);
  return {enabled: mini};
}

async function selectFiles() {
  const result = await dialog.showOpenDialog(mainWindow, {title: 'Add your music to Velvet', properties: ['openFile', 'multiSelections'], filters: [{name: 'Audio', extensions: [...AUDIO_EXTENSIONS].map(value => value.slice(1))}]});
  return {canceled: result.canceled, paths: result.filePaths};
}
async function selectFolder() {
  const result = await dialog.showOpenDialog(mainWindow, {title: 'Choose a music folder', properties: ['openDirectory']});
  return {canceled: result.canceled, paths: result.filePaths};
}
async function selectReadFile(title, filters) {
  const result = await dialog.showOpenDialog(mainWindow, {title, properties: ['openFile'], filters});
  if (result.canceled || !result.filePaths[0]) return null;
  const file = result.filePaths[0];
  const stat = await fsp.stat(file);
  if (stat.size > 20 * 1024 * 1024) throw new Error('Select a file smaller than 20 MB.');
  return {file, contents: await fsp.readFile(file, 'utf8')};
}
async function writeWithDialog(title, defaultPath, filters, contents) {
  const result = await dialog.showSaveDialog(mainWindow, {title, defaultPath, filters});
  if (result.canceled || !result.filePath) return {canceled: true};
  await fsp.writeFile(result.filePath, contents, 'utf8');
  return {canceled: false, fileName: path.basename(result.filePath)};
}

async function rescanWatch(folder) {
  try {
    const preview = await importer.preview([folder.path]);
    if (preview.canceled) return;
    const result = await importer.commit(preview.token);
    if (result.imported) safeSend('velvet:libraryChanged', {...result.state, watchImport: {name: folder.name, imported: result.imported}});
  } catch (error) { safeSend('velvet:watchError', {name: folder.name, message: error.message}); }
}
function attachWatcher(folder) {
  if (watchers.has(folder.id)) return;
  try {
    const watcher = fs.watch(folder.path, {recursive: true}, () => {
      clearTimeout(watchTimers.get(folder.id));
      watchTimers.set(folder.id, setTimeout(() => {watchTimers.delete(folder.id); rescanWatch(folder);}, 1500));
    });
    watcher.on('error', error => safeSend('velvet:watchError', {name: folder.name, message: error.message}));
    watchers.set(folder.id, watcher);
  } catch (error) { safeSend('velvet:watchError', {name: folder.name, message: error.message}); }
}

function registerIPC() {
  handle('searchCatalog', query => catalog.search(query));
  handle('searchSongs',query=>audius.search(query));
  handle('trendingSongs',()=>audius.trending());
  handle('readState', () => ({...publicState(store.state), recoveryMessage: store.recovery, recovery: store.recovery}));
  handle('saveState', async partial => {
    if (!partial || typeof partial !== 'object' || JSON.stringify(partial).length > 80 * 1024 * 1024) throw new Error('Library update is invalid or too large.');
    await store.update(partial);
    return publicState(store.state);
  });
  handle('chooseFiles', selectFiles);
  handle('chooseFolder', selectFolder);
  handle('previewImport', (paths, token) => {
    if (!Array.isArray(paths) || paths.length > 50000 || paths.some(value => typeof value !== 'string' || !path.isAbsolute(value))) throw new Error('Choose local music files or a folder.');
    return importer.preview(paths, token);
  });
  handle('commitImport', token => importer.commit(token));
  handle('cancelImport', token => importer.cancel(token));
  handle('openExternal', async url => {
    if (!validExternalURL(url)) throw new Error('Only HTTPS Spotify, YouTube, YouTube Music, and SoundCloud links can be opened.');
    await shell.openExternal(new URL(url).href);
    return true;
  });
  handle('showInFolder', trackId => {
    const track = store.state.tracks.find(value => value.id === trackId && value.source === 'local');
    if (!track) throw new Error('This track is not a local file.');
    shell.showItemInFolder(track.filePath);
    return true;
  });
  handle('exportLibrary', () => writeWithDialog('Export Velvet library', 'Velvet Library.json', [{name: 'JSON library', extensions: ['json']}], JSON.stringify({format: 'velvet-library', version: 1, exportedAt: new Date().toISOString(), ...publicState(store.state)}, null, 2)));
  handle('exportPlaylist', async (playlistId, format = 'json') => {
    if (!['json', 'csv', 'm3u', 'm3u8'].includes(format)) throw new Error('Choose JSON, CSV, M3U, or M3U8.');
    const playlist = store.state.playlists.find(value => value.id === playlistId);
    if (!playlist) throw new Error('Playlist not found.');
    const title = playlist.name.replace(/[<>:"/\\|?*\r\n]/g, '_').slice(0, 100);
    return writeWithDialog('Export playlist', title + '.' + format, [{name: format.toUpperCase() + ' playlist', extensions: [format]}], playlistDocument(playlist, store.state.tracks, format));
  });
  handle('importPlaylist', async () => {
    const selected = await selectReadFile('Import a playlist', [{name: 'Playlists', extensions: ['json', 'csv', 'm3u', 'm3u8']}]);
    if (!selected) return {canceled: true};
    const format = path.extname(selected.file).slice(1).toLowerCase();
    return {canceled: false, preview: parsePlaylist(selected.contents, format, store.state.tracks, path.dirname(selected.file))};
  });
  handle('exportSettings', () => writeWithDialog('Export Velvet settings', 'Velvet Settings.json', [{name: 'Velvet settings', extensions: ['json']}], JSON.stringify({format: 'velvet-settings', version: 1, settings: store.state.settings}, null, 2)));
  handle('importSettings', async () => {
    const selected = await selectReadFile('Import Velvet settings', [{name: 'Velvet settings', extensions: ['json']}]);
    if (!selected) return {canceled: true};
    const value = JSON.parse(selected.contents);
    if (value.format !== 'velvet-settings' || value.version !== 1 || !value.settings || typeof value.settings !== 'object' || Array.isArray(value.settings)) throw new Error('Select a Velvet settings export (version 1).');
    return {canceled: false, preview: {settings: safeJson(value.settings)}};
  });
  handle('setMiniMode', setMiniMode);
  handle('setGlobalShortcuts', setGlobalShortcuts);
  handle('getVersion', () => app.getVersion());
  handle('chooseBackground', chooseBackground);
  handle('clearBackground', async backgroundId => {
    if (typeof backgroundId === 'string' && /^[a-f0-9-]{36}\.(jpg|jpeg|png|webp|gif|mp4|webm|mov)$/.test(backgroundId)) await fsp.rm(path.join(app.getPath('userData'), 'backgrounds', backgroundId), {force:true});
    return true;
  });
  handle('watchFolder', async () => {
    const selected = await selectFolder();
    if (selected.canceled || !selected.paths[0]) return {canceled: true};
    const folderPath = path.resolve(selected.paths[0]);
    let folder = store.state.watchedFolders.find(value => value.path.toLowerCase() === folderPath.toLowerCase());
    if (!folder) {
      if (store.state.watchedFolders.length >= 30) throw new Error('You can watch up to 30 music folders.');
      folder = {id: require('node:crypto').randomUUID(), name: path.basename(folderPath), path: folderPath};
      await store.update({watchedFolders: [...store.state.watchedFolders, folder]}, true);
      attachWatcher(folder);
    }
    const preview = await importer.preview([folderPath]);
    return {canceled: false, folder: {id: folder.id, name: folder.name}, preview, state: publicState(store.state)};
  });
  handle('unwatchFolder', async folderId => {
    watchers.get(folderId)?.close(); watchers.delete(folderId); clearTimeout(watchTimers.get(folderId)); watchTimers.delete(folderId);
    await store.update({watchedFolders: store.state.watchedFolders.filter(folder => folder.id !== folderId)}, true);
    return publicState(store.state);
  });
}

async function chooseBackground() {
  const result = await dialog.showOpenDialog(mainWindow, {title: 'Choose your Velvet background', properties: ['openFile'], filters: [{name: 'Images, GIFs, and videos', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov']}]});
  if (result.canceled || !result.filePaths[0]) return {canceled: true};
  const original = result.filePaths[0];
  const info = await fsp.stat(original);
  if (!info.isFile() || info.size > 200 * 1024 * 1024 || info.size < 12) throw new Error('Choose an image or video under 200 MB.');
  const extension = path.extname(original).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm', '.mov'].includes(extension)) throw new Error('Choose JPG, PNG, WebP, GIF, MP4, WebM, or MOV.');
  const handle = await fsp.open(original, 'r');
  let bytes;
  try {bytes = Buffer.alloc(32); await handle.read(bytes, 0, 32, 0);} finally {await handle.close();}
  const signatures = {
    '.jpg': bytes[0] === 0xff && bytes[1] === 0xd8,
    '.jpeg': bytes[0] === 0xff && bytes[1] === 0xd8,
    '.png': bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    '.gif': /^GIF8[79]a/.test(bytes.toString('ascii',0,6)),
    '.webp': bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP',
    '.mp4': bytes.toString('ascii',4,8) === 'ftyp',
    '.mov': ['ftyp', 'moov', 'wide', 'mdat'].includes(bytes.toString('ascii',4,8)),
    '.webm': bytes.subarray(0,4).equals(Buffer.from([26,69,223,163])),
  };
  if (!signatures[extension]) throw new Error('The selected file does not match its image or video format.');
  const directory = path.join(app.getPath('userData'), 'backgrounds');
  await fsp.mkdir(directory, {recursive:true});
  const backgroundId = require('node:crypto').randomUUID() + extension;
  await fsp.copyFile(original, path.join(directory, backgroundId), fs.constants.COPYFILE_EXCL);
  return {canceled:false, background:{id:backgroundId,name:path.basename(original),type:['.mp4','.webm','.mov'].includes(extension)?'video':'image',url:'velvet-media://background/'+backgroundId}};
}
async function registerMediaProtocol() {
  const mimeTypes = {'.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.webm': 'video/webm', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp'};
  protocol.handle('velvet-media', async request => {
    try {
      const url = new URL(request.url);
      if (!['track', 'background', 'stream', 'artwork'].includes(url.hostname) || url.search || url.hash || !['GET', 'HEAD'].includes(request.method)) return new Response('Invalid media request', {status: 400});
      const trackId = decodeURIComponent(url.pathname.slice(1));
      if(url.hostname==='stream')return await audius.stream(trackId,request);
      if(url.hostname==='artwork')return await audius.artwork(trackId);
      const track = url.hostname === 'background'
        ? (/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp|gif|mp4|webm|mov)$/.test(trackId) ? {filePath:path.join(app.getPath('userData'), 'backgrounds', trackId)} : null)
        : store.state.tracks.find(value => value.id === trackId && value.source === 'local');
      if (!track) return new Response('This track is no longer in your library.', {status: 404});
      const stat = await fsp.stat(track.filePath);
      if (!stat.isFile()) return new Response('Audio file unavailable', {status: 404});
      const headers = {'Content-Type': mimeTypes[path.extname(track.filePath).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store'};
      let start = 0; let end = stat.size - 1; let status = 200;
      const range = request.headers.get('Range');
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) return new Response(null, {status: 416, headers: {...headers, 'Content-Range': 'bytes */' + stat.size}});
        if (!match[1]) start = Math.max(0, stat.size - Number(match[2]));
        else start = Number(match[1]);
        if (match[1] && match[2]) end = Math.min(end, Number(match[2]));
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start < 0 || start >= stat.size) return new Response(null, {status: 416, headers: {...headers, 'Content-Range': 'bytes */' + stat.size}});
        status = 206; headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
      }
      headers['Content-Length'] = String(end - start + 1);
      if (request.method === 'HEAD') return new Response(null, {status, headers});
      const stream = fs.createReadStream(track.filePath, {start, end});
      return new Response(Readable.toWeb(stream), {status, headers});
    } catch { return new Response('The original audio file has moved or is unavailable. Reimport its folder to restore playback.', {status: 404}); }
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 930, minWidth: 1000, minHeight: 680,
    icon:path.join(__dirname,'..','assets','icon.png'),
    backgroundColor: '#10100f', title: 'Velvet — Your music, your way',
    titleBarStyle: 'hidden', titleBarOverlay: {color: '#111210', symbolColor: '#e9eadf', height: 36},
    autoHideMenuBar: true, show: false,
    webPreferences: {preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, spellcheck: false},
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => { if (code !== -3) console.error('Velvet failed to load:', description); });
  mainWindow.once('ready-to-show', () => {if (!testMode) mainWindow.show();});
  let closeInProgress = false;
  mainWindow.on('close', event => {
    const windowToClose = mainWindow;
    if (closeInProgress || !windowToClose || windowToClose.isDestroyed()) return;
    event.preventDefault(); closeInProgress = true;
    let closeTimer;
    let prepare;
    try {
      prepare = windowToClose.webContents.isDestroyed() || windowToClose.webContents.isCrashed?.()
        ? Promise.resolve()
        : windowToClose.webContents.executeJavaScript("import(new URL('./app.js', location.href).href).then(m => m.prepareToClose())");
    } catch(error) {prepare = Promise.reject(error);}
    Promise.race([prepare, new Promise(resolve => {closeTimer = setTimeout(resolve, 1500);})])
      .catch(error => console.warn('Renderer close preparation did not finish:', error.message))
      .finally(() => {clearTimeout(closeTimer); if (!windowToClose.isDestroyed()) windowToClose.destroy();});
  });
  mainWindow.on('closed', () => {mainWindow = null;});
  await mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  if (process.argv.includes('--devtools') && !app.isPackaged) mainWindow.webContents.openDevTools({mode: 'detach'});
  if (testMode) {
    try {await require('../tests/desktop-smoke.cjs').run({window:mainWindow,app,store}); await store.pending; app.exit(0);}
    catch(error) {console.error('DESKTOP_SMOKE_FAILED', error.stack || error); app.exit(1);}
  }
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) {if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus();} });
  app.whenReady().then(async () => {
    store = new StateStore(app.getPath('userData'));
    const freshLibrary = !fs.existsSync(store.file) && !fs.existsSync(store.file + '.backup');
    await store.load();
    try {
      const demoDirectory = path.join(app.getAppPath(), 'assets', 'demo');
      const manifest = JSON.parse(await fsp.readFile(path.join(demoDirectory, 'library.json'), 'utf8'));
      const demoTracks = (Array.isArray(manifest) ? manifest : manifest.tracks || []).filter(track => track && typeof track.fileName === 'string' && /^[a-z0-9_-]+\.(wav|mp3|ogg|flac)$/.test(track.fileName)).map(track => ({...track, source:'local', filePath:path.join(demoDirectory, track.fileName)})).filter(track => fs.existsSync(track.filePath));
      if (freshLibrary && demoTracks.length) await store.update({tracks:demoTracks}, true);
      else if (demoTracks.length) {
        const paths = new Map(demoTracks.map(track => [track.id, track.filePath]));
        let changed = false;
        const tracks = store.state.tracks.map(track => {if (track.source === 'local' && paths.has(track.id) && track.filePath !== paths.get(track.id)) {changed = true; return {...track,filePath:paths.get(track.id)};} return track;});
        if (changed) await store.update({tracks}, true);
      }
    } catch (error) {console.warn('Bundled listening session was not loaded:', error.message);}
    importer = new ImportManager(store, progress => safeSend('velvet:importProgress', progress));
    catalog = new CatalogSearch({contact:()=>store.state.settings.catalogContact || process.env.VELVET_CATALOG_CONTACT || 'https://github.com/TheBabyKingdom'});
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.on('will-download', event => event.preventDefault());
    session.defaultSession.webRequest.onBeforeRequest({urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*']}, (_details, callback) => callback({cancel: true}));
    await registerMediaProtocol();
    registerIPC();
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label: 'File', submenu: [{label: 'Import music', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('importFiles')}, {label: 'Import folder', accelerator: 'CmdOrCtrl+Shift+O', click: () => sendCommand('importFolder')}, {type: 'separator'}, {role: 'quit'}]},
      {label: 'Edit', submenu: [{role: 'undo'}, {role: 'redo'}, {type: 'separator'}, {role: 'cut'}, {role: 'copy'}, {role: 'paste'}, {role: 'selectAll'}]},
      {label: 'View', submenu: [{role: 'resetZoom'}, {role: 'zoomIn'}, {role: 'zoomOut'}, {role: 'togglefullscreen'}, {label: 'Mini player', accelerator: 'CmdOrCtrl+Shift+M', click: () => setMiniMode(!mini)}]},
    ]));
    await createWindow();
    if (store.state.settings.globalShortcuts) setGlobalShortcuts(true);
    for (const folder of store.state.watchedFolders) {attachWatcher(folder); rescanWatch(folder);}
  }).catch(error => {console.error(error); dialog.showErrorBox('Velvet could not start', error.message); app.quit();});
}
app.on('window-all-closed', () => app.quit());
app.on('will-quit', event => {
  if (store && !quittingAfterFlush) {
    event.preventDefault(); quittingAfterFlush = true;
    setTimeout(async () => {try {await store.pending;} catch(error) {console.error('The final library update could not be saved:', error.message);} app.quit();}, 50);
    return;
  }
  globalShortcut.unregisterAll();
  for (const watcher of watchers.values()) watcher.close();
  for (const timer of watchTimers.values()) clearTimeout(timer);
});

