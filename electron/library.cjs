const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const SCHEMA_VERSION = 2;
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.webm']);
const PROVIDER_HOSTS = {
  spotify: ['open.spotify.com'],
  youtube: ['www.youtube.com', 'youtube.com', 'youtu.be', 'music.youtube.com'],
  soundcloud: ['soundcloud.com', 'www.soundcloud.com', 'on.soundcloud.com'],
  audius: ['audius.co', 'www.audius.co'],
};
const cleanText = (value, max = 500) => typeof value === 'string' ? value.slice(0, max).replace(/\u0000/g, '') : '';
const id = () => crypto.randomUUID();
const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);
const clamp = (value, min, max, fallback = min) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;

function validExternalURL(value, source) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const hosts = source ? PROVIDER_HOSTS[source] || [] : Object.values(PROVIDER_HOSTS).flat();
    return hosts.includes(url.hostname.toLowerCase()) && (!url.port || url.port === '443');
  } catch { return false; }
}

function safeJson(value, depth = 0) {
  if (depth > 10) return null;
  if (typeof value === 'string') return value.slice(0, 20000);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 5000).map(item => safeJson(item, depth + 1));
  if (isRecord(value)) {
    const result = {};
    for (const [key, child] of Object.entries(value).slice(0, 300)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
      result[key.slice(0, 100)] = safeJson(child, depth + 1);
    }
    return result;
  }
  return null;
}

function defaultState() {
  return {schemaVersion: SCHEMA_VERSION, revision: 0, tracks: [], playlists: [], folders: [], queue: [], queueIndex: 0, favorites: [], history: [], settings: {}, watchedFolders: []};
}

function normalizeTrack(track, existing, trusted = false) {
  if (!isRecord(track)) return null;
  const source = ['local', 'spotify', 'youtube', 'soundcloud', 'audius'].includes(track.source) ? track.source : null;
  if (!source) return null;
  if(source==='audius' && !/^audius:[A-Za-z0-9_-]{3,60}$/.test(track.id||existing?.id||''))return null;
  if (source === 'local' && !trusted && !existing) return null;
  if (source !== 'local' && !validExternalURL(track.externalUrl, source)) return null;
  const result = {
    id: cleanText(existing?.id || track.id || id(), 120),
    title: cleanText(track.title || existing?.title || 'Untitled'),
    artist: cleanText(track.artist || existing?.artist || 'Unknown artist'),
    album: cleanText(track.album || existing?.album || ''),
    duration: clamp(track.duration ?? existing?.duration, 0, 86400),
    genre: cleanText(track.genre ?? existing?.genre ?? '', 150),
    year: cleanText(String(track.year || existing?.year || ''), 8),
    source,
    addedAt: cleanText(existing?.addedAt || track.addedAt || new Date().toISOString(), 40),
    artwork: null,
    playCount: Math.round(clamp(track.playCount ?? existing?.playCount, 0, 100000000)),
  };
  const artwork = track.artwork ?? existing?.artwork;
  if (typeof artwork === 'string' && artwork.length <= 2500000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(artwork)) result.artwork = artwork;
  if(source==='audius'){result.providerId=result.id.slice(7);result.playable=true;result.mediaUrl='velvet-media://stream/'+result.providerId;if(artwork==='velvet-media://artwork/'+result.providerId)result.artwork=artwork;}
  if (source === 'local') {
    const origin = trusted ? track : existing;
    if (!origin?.filePath || !path.isAbsolute(origin.filePath)) return null;
    result.filePath = origin.filePath;
    result.fileName = path.basename(origin.filePath);
    result.fingerprint = cleanText(origin.fingerprint, 128);
    result.fileSize = clamp(origin.fileSize, 0, Number.MAX_SAFE_INTEGER);
    result.modifiedAt = clamp(origin.modifiedAt, 0, Number.MAX_SAFE_INTEGER);
  } else {
    result.externalUrl = new URL(track.externalUrl).href;
    result.fileName = '';
  }
  return result;
}

function normalizeState(input, previous = defaultState(), trusted = false) {
  if (!isRecord(input)) throw new Error('Library data must be an object.');
  if (Number(input.schemaVersion || 1) > SCHEMA_VERSION) throw new Error('This library was created by a newer Velvet version.');
  const result = {...previous, schemaVersion: SCHEMA_VERSION};
  if (Array.isArray(input.tracks)) {
    const oldTracks = new Map(previous.tracks.map(track => [track.id, track]));
    const seen = new Set();
    result.tracks = input.tracks.slice(0, 100000).map(track => normalizeTrack(track, oldTracks.get(track?.id), trusted)).filter(track => track && !seen.has(track.id) && seen.add(track.id));
  }
  const trackIds = new Set(result.tracks.map(track => track.id));
  const safeIds = values => Array.isArray(values) ? values.map(value => cleanText(value, 120)).filter(value => trackIds.has(value)).slice(0, 100000) : [];
  if (Array.isArray(input.playlists)) {
    const seen = new Set();
    result.playlists = input.playlists.slice(0, 2000).filter(isRecord).map(playlist => ({
      id: cleanText(playlist.id || id(), 120), name: cleanText(playlist.name || 'Untitled playlist', 120),
      description: cleanText(playlist.description, 3000), trackIds: safeIds(playlist.trackIds || playlist.tracks),
      folderId: cleanText(playlist.folderId, 120), createdAt: cleanText(playlist.createdAt || new Date().toISOString(), 40),
      smart: isRecord(playlist.smart) ? safeJson(playlist.smart) : null,
    })).filter(playlist => !seen.has(playlist.id) && seen.add(playlist.id));
  }
  if (Array.isArray(input.folders)) result.folders = input.folders.slice(0, 200).filter(isRecord).map(folder => ({id: cleanText(folder.id || id(), 120), name: cleanText(folder.name || 'Folder', 120)}));
  if (Array.isArray(input.queue)) result.queue = safeIds(input.queue);
  if (input.queueIndex !== undefined) result.queueIndex = Math.round(clamp(input.queueIndex, 0, Math.max(0, result.queue.length - 1)));
  if (Array.isArray(input.favorites)) result.favorites = [...new Set(safeIds(input.favorites))];
  if (Array.isArray(input.history)) result.history = input.history.slice(-20000).filter(isRecord).map(event => ({trackId: cleanText(event.trackId, 120), at: cleanText(event.at || new Date().toISOString(), 40), seconds: clamp(event.seconds, 0, 86400)})).filter(event => trackIds.has(event.trackId));
  if (isRecord(input.settings)) result.settings = safeJson(input.settings);
  if (trusted && Array.isArray(input.watchedFolders)) result.watchedFolders = input.watchedFolders.slice(0, 30).filter(folder => isRecord(folder) && path.isAbsolute(folder.path || '')).map(folder => ({id: cleanText(folder.id || id(), 120), name: cleanText(folder.name || path.basename(folder.path), 120), path: folder.path}));
  result.revision = Math.max(0, Number(previous.revision) || 0) + 1;
  return result;
}

function publicTrack(track) {
  const {filePath, fingerprint, fileSize, modifiedAt, ...result} = track;
  if (track.source === 'local') result.mediaUrl = 'velvet-media://track/' + encodeURIComponent(track.id);
  if(track.source==='audius')result.mediaUrl='velvet-media://stream/'+encodeURIComponent(track.id.slice(7));
  return result;
}
function publicState(state) {
  return {...state, tracks: state.tracks.map(publicTrack), watchedFolders: state.watchedFolders.map(({id: folderId, name}) => ({id: folderId, name}))};
}

class StateStore {
  constructor(directory) { this.directory = directory; this.file = path.join(directory, 'library-v1.json'); this.state = defaultState(); this.pending = Promise.resolve(); this.recovery = null; }
  async load() {
    await fsp.mkdir(this.directory, {recursive: true});
    for (const file of [this.file, this.file + '.backup']) {
      try {
        const raw = await fsp.readFile(file, 'utf8');
        this.state = normalizeState(JSON.parse(raw), defaultState(), true);
        if (file.endsWith('.backup')) this.recovery = 'The last library file was unreadable. Velvet restored its backup.';
        return this.state;
      } catch (error) {
        if (/newer Velvet version/.test(error.message)) throw error;
        if (error.code !== 'ENOENT') this.recovery = 'The library could not be read. A recovery backup was checked; your audio files are unchanged.';
      }
    }
    return this.state;
  }
  update(partial, trusted = false) {
    this.state = normalizeState(partial, this.state, trusted);
    return this.persist();
  }
  persist() {
    const contents = JSON.stringify(this.state, null, 2);
    this.pending = this.pending.catch(() => {}).then(async () => {
      await fsp.mkdir(this.directory, {recursive: true});
      const temporary = this.file + '.' + process.pid + '.tmp';
      await fsp.writeFile(temporary, contents, {encoding: 'utf8', mode: 0o600});
      try { await fsp.copyFile(this.file, this.file + '.backup'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await fsp.rename(temporary, this.file);
      return this.state;
    });
    return this.pending;
  }
}

async function collectAudioFiles(inputs, signal) {
  const files = [];
  const visited = new Set();
  async function visit(input, depth = 0) {
    if (signal?.aborted) throw new Error('Import canceled.');
    if (depth > 32 || files.length >= 50000 || typeof input !== 'string' || !path.isAbsolute(input)) return;
    try {
      const actual = path.resolve(input);
      const canonical = process.platform === 'win32' ? actual.toLowerCase() : actual;
      if (visited.has(canonical)) return;
      visited.add(canonical);
      const info = await fsp.lstat(actual);
      if (info.isSymbolicLink()) return;
      if (info.isDirectory()) {
        const entries = await fsp.readdir(actual, {withFileTypes: true});
        for (const entry of entries) await visit(path.join(actual, entry.name), depth + 1);
      } else if (info.isFile() && AUDIO_EXTENSIONS.has(path.extname(actual).toLowerCase())) files.push(actual);
    } catch (error) { if (signal?.aborted) throw error; }
  }
  for (const input of inputs || []) await visit(input);
  return files;
}

function hashFile(file, signal) {
  return new Promise((resolve, reject) => {
    const digest = crypto.createHash('sha256');
    const stream = fs.createReadStream(file, {signal});
    stream.on('data', chunk => digest.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(digest.digest('hex')));
  });
}

let metadataModule;
async function readTrack(file, signal) {
  const info = await fsp.stat(file);
  const fingerprint = await hashFile(file, signal);
  const name = path.basename(file, path.extname(file));
  const splitName = name.includes(' - ') ? name.split(' - ') : null;
  let metadata = null;
  try {
    metadataModule ||= import('music-metadata');
    metadata = await (await metadataModule).parseFile(file, {duration: true, skipCovers: false});
  } catch { /* Files without readable tags still import with their filename. */ }
  const common = metadata?.common || {};
  const picture = common.picture?.find(value => ['image/jpeg', 'image/png', 'image/webp'].includes(value.format) && value.data.length <= 1800000);
  return normalizeTrack({
    id: id(), source: 'local', filePath: file, fingerprint, fileSize: info.size, modifiedAt: info.mtimeMs,
    title: common.title || (splitName ? splitName.slice(1).join(' - ') : name),
    artist: common.artist || (splitName ? splitName[0] : 'Unknown artist'), album: common.album || '',
    genre: common.genre?.[0] || '', year: common.year || '', duration: metadata?.format?.duration || 0,
    artwork: picture ? 'data:' + picture.format + ';base64,' + Buffer.from(picture.data).toString('base64') : null,
  }, null, true);
}

class ImportManager {
  constructor(store, progress = () => {}) { this.store = store; this.progress = progress; this.pending = new Map(); }
  async preview(paths, requestedToken) {
    const token = typeof requestedToken === 'string' && requestedToken.length < 120 ? requestedToken : id();
    const controller = new AbortController();
    const preview = {token, tracks: [], duplicates: [], unavailable: [], total: 0, controller};
    this.pending.set(token, preview);
    this.progress({token, phase: 'scanning', current: 0, total: 0, fileName: ''});
    try {
      const files = await collectAudioFiles(paths, controller.signal);
      preview.total = files.length;
      const knownPaths = new Set(this.store.state.tracks.filter(track => track.source === 'local').map(track => process.platform === 'win32' ? track.filePath.toLowerCase() : track.filePath));
      const fingerprints = new Set(this.store.state.tracks.map(track => track.fingerprint).filter(Boolean));
      for (let index = 0; index < files.length; index++) {
        if (controller.signal.aborted) throw new Error('Import canceled.');
        const file = files[index];
        this.progress({token, phase: 'reading', current: index, total: files.length, fileName: path.basename(file)});
        try {
          const canonical = process.platform === 'win32' ? file.toLowerCase() : file;
          if (knownPaths.has(canonical)) { preview.duplicates.push({fileName: path.basename(file), reason: 'Already in your library'}); continue; }
          const track = await readTrack(file, controller.signal);
          if (fingerprints.has(track.fingerprint)) { preview.duplicates.push({fileName: path.basename(file), reason: 'Identical audio file'}); continue; }
          knownPaths.add(canonical); fingerprints.add(track.fingerprint); preview.tracks.push(track);
        } catch (error) { if (controller.signal.aborted) throw error; preview.unavailable.push({fileName: path.basename(file), reason: cleanText(error.message, 300)}); }
      }
      this.progress({token, phase: 'ready', current: files.length, total: files.length, fileName: ''});
      return this.publicPreview(preview);
    } catch (error) {
      this.pending.delete(token);
      if (controller.signal.aborted) return {token, canceled: true, tracks: [], duplicates: [], unavailable: [], total: 0};
      throw error;
    }
  }
  publicPreview(preview) { return {token: preview.token, tracks: preview.tracks.map(publicTrack), duplicates: preview.duplicates, unavailable: preview.unavailable, total: preview.total}; }
  async commit(token) {
    const preview = this.pending.get(token);
    if (!preview) throw new Error('This import preview has expired. Please select the files again.');
    const knownPaths = new Set(this.store.state.tracks.map(track => track.filePath));
    const knownPrints = new Set(this.store.state.tracks.map(track => track.fingerprint).filter(Boolean));
    const fresh = preview.tracks.filter(track => !knownPaths.has(track.filePath) && !knownPrints.has(track.fingerprint));
    await this.store.update({tracks: [...this.store.state.tracks, ...fresh]}, true);
    this.pending.delete(token);
    return {imported: fresh.length, duplicates: preview.duplicates.length + preview.tracks.length - fresh.length, unavailable: preview.unavailable.length, tracks: fresh.map(publicTrack), state: publicState(this.store.state)};
  }
  cancel(token) { const preview = this.pending.get(token); if (preview) preview.controller.abort(); this.pending.delete(token); return true; }
}

function parseCSV(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) { if (char === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (char === '"') quoted = false; else field += char; }
    else if (char === '"' && !field) quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (quoted) throw new Error('The CSV file contains an unclosed quote.');
  row.push(field); if (row.some(Boolean)) rows.push(row);
  return rows;
}
const csvCell = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';

function playlistDocument(playlist, tracks, format = 'json') {
  const byId = new Map(tracks.map(track => [track.id, track]));
  const ordered = (playlist.trackIds || []).map(trackId => byId.get(trackId)).filter(Boolean);
  if (format === 'csv') return ['id,title,artist,album,source,url,path,duration', ...ordered.map(track => [track.id, track.title, track.artist, track.album, track.source, track.externalUrl || '', track.filePath || '', track.duration].map(csvCell).join(','))].join('\r\n');
  if (format === 'm3u' || format === 'm3u8') return ['#EXTM3U', '#PLAYLIST:' + playlist.name.replace(/[\r\n]/g, ' '), ...ordered.flatMap(track => ['#EXTINF:' + Math.round(track.duration || -1) + ',' + (track.artist + ' - ' + track.title).replace(/[\r\n]/g, ' '), track.filePath || track.externalUrl])].join('\n');
  return JSON.stringify({format: 'velvet-playlist', version: 1, name: playlist.name, description: playlist.description || '', tracks: ordered.map(track => {const item = publicTrack(track); delete item.mediaUrl; if (track.filePath) item.path = track.filePath; return item;})}, null, 2);
}

function parsePlaylist(text, format, libraryTracks, originDirectory = '') {
  let name = 'Imported playlist'; let description = ''; let rows;
  if (format === 'json') {
    const value = JSON.parse(text);
    if (value.format !== 'velvet-playlist' || value.version !== 1 || !Array.isArray(value.tracks)) throw new Error('Select a Velvet playlist JSON file (format velvet-playlist, version 1).');
    name = cleanText(value.name || name, 120); description = cleanText(value.description, 3000); rows = value.tracks;
  } else if (format === 'csv') {
    const csv = parseCSV(text.replace(/^\uFEFF/, ''));
    const headers = (csv.shift() || []).map(header => header.trim().toLowerCase());
    if (!headers.includes('title')) throw new Error('CSV needs a title column. Optional columns: artist, album, source, url, path, duration.');
    rows = csv.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
  } else {
    rows = []; let nextTitle = '';
    for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
      if (line.startsWith('#PLAYLIST:')) name = cleanText(line.slice(10), 120);
      else if (line.startsWith('#EXTINF:')) nextTitle = line.slice(line.indexOf(',') + 1);
      else if (!line.startsWith('#')) { rows.push({path: /^https:\/\//.test(line) ? '' : path.resolve(originDirectory, line), url: /^https:\/\//.test(line) ? line : '', title: nextTitle}); nextTitle = ''; }
    }
  }
  if (rows.length > 100000) throw new Error('This playlist exceeds the 100,000-track import limit.');
  const tracks = []; const missing = []; const duplicates = []; const seen = new Set();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const candidatePath = cleanText(row.path, 32000);
    const url = row.externalUrl || row.url;
    let match = libraryTracks.find(track => (row.id && track.id === row.id) || (candidatePath && track.filePath && path.normalize(track.filePath).toLowerCase() === path.normalize(path.resolve(originDirectory, candidatePath)).toLowerCase()) || (url && track.externalUrl === url));
    if (!match && url) {
      const source = Object.keys(PROVIDER_HOSTS).find(provider => validExternalURL(url, provider));
      if (source) match = normalizeTrack({...row, id: source==='audius'&&/^audius:[A-Za-z0-9_-]{3,60}$/.test(row.id||'')?row.id:id(), source, externalUrl: url, title: row.title || 'Service reference', artist: row.artist || 'Open in provider'}, null, false);
    }
    if (!match) { missing.push({title: cleanText(row.title || candidatePath || 'Unknown track'), reason: candidatePath ? 'Audio file is not in your library. Import its folder first.' : 'No matching imported track or supported service URL.'}); continue; }
    if (seen.has(match.id)) duplicates.push({title: match.title, reason: 'Repeated playlist entry; order is preserved.'});
    seen.add(match.id); tracks.push(publicTrack(match));
  }
  return {name, description, tracks, missing, duplicates, format};
}


class CatalogSearch {
  constructor({fetchImpl = globalThis.fetch, now = Date.now, sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)), contact = () => ''} = {}) {
    this.fetchImpl = fetchImpl; this.now = now; this.sleep = sleep; this.contact = contact;
    this.cache = new Map(); this.tail = Promise.resolve(); this.lastRequest = 0; this.pending = 0;
  }
  async search(input) {
    const query = typeof input === 'string' ? input.trim().replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ') : '';
    if (query.length < 2 || query.length > 200) throw new Error('Search using between 2 and 200 characters.');
    const key = query.toLocaleLowerCase();
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) return cached.results;
    if (this.pending >= 8) throw new Error('A few catalog searches are waiting. Try again in a moment.');
    this.pending++;
    const task = this.tail.catch(() => {}).then(async () => {
      const previous = this.cache.get(key);
      if (previous && previous.expires > this.now()) return previous.results;
      const delay = 1100 - (this.now() - this.lastRequest);
      if (delay > 0) await this.sleep(delay);
      this.lastRequest = this.now();
      const url = new URL('https://musicbrainz.org/ws/2/recording/');
      url.searchParams.set('query', query); url.searchParams.set('fmt', 'json'); url.searchParams.set('limit', '20'); url.searchParams.set('dismax', 'true');
      const rawContact = this.contact();
      const contact = typeof rawContact === 'string' && rawContact.length < 300 && !/[\r\n]/.test(rawContact) && (/^https:\/\/[^\s]+$/.test(rawContact) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawContact)) ? rawContact : '';
      let response;
      try {
        response = await this.fetchImpl(url.href, {headers: {'Accept': 'application/json', 'User-Agent': 'VelvetMusic/1.0.0 (' + (contact || 'personal desktop music catalog') + ')'}, signal: AbortSignal.timeout(8000)});
      } catch (error) { throw new Error(error.name === 'TimeoutError' || error.name === 'AbortError' ? 'The music catalog took too long to respond. Try again.' : 'The music catalog is unavailable. Check your connection and try again.'); }
      if (!response.ok) throw new Error(response.status === 503 || response.status === 429 ? 'MusicBrainz is busy or limiting requests. Wait a moment, then try again.' : 'The music catalog could not complete this search (HTTP ' + response.status + ').');
      let data;
      try {data = await response.json();} catch {throw new Error('The music catalog returned an unreadable response. Try again.');}
      const results = (Array.isArray(data.recordings) ? data.recordings : []).slice(0,20).filter(recording => /^[a-f0-9-]{36}$/.test(recording.id || '')).map(recording => ({
        id: 'mb:' + recording.id, title: cleanText(recording.title || 'Untitled recording'),
        artist: cleanText((recording['artist-credit'] || []).map(credit => (credit.name || credit.artist?.name || '') + (credit.joinphrase || '')).join('') || 'Unknown artist'),
        album: cleanText(recording.releases?.[0]?.title || ''), duration: clamp(Number(recording.length || 0) / 1000, 0, 86400),
        year: cleanText(recording['first-release-date'] || recording.releases?.[0]?.date || '', 4),
        source: 'catalog', score: clamp(recording.score, 0, 100),
      }));
      this.cache.set(key, {expires:this.now() + 10 * 60 * 1000, results});
      if (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value);
      return results;
    }).finally(() => {this.pending--;});
    this.tail = task;
    return task;
  }
}

module.exports = {CatalogSearch, SCHEMA_VERSION, AUDIO_EXTENSIONS, PROVIDER_HOSTS, validExternalURL, safeJson, defaultState, normalizeTrack, normalizeState, publicTrack, publicState, StateStore, collectAudioFiles, hashFile, readTrack, ImportManager, parseCSV, playlistDocument, parsePlaylist};

