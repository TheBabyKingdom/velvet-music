/** Capabilities describe this release. Provider references are not downloaded audio. */
export const PROVIDERS = Object.freeze({
  audius:{id:'audius',name:'Audius',color:'#bf9aff',status:'Working',description:'Search full-length public songs and play them directly in Velvet. Save favourites, add songs to playlists and keep a mixed local/streaming queue.',playback:'Working · inside Velvet',search:'Working · live catalogue',imports:'Working · saved streaming references',effects:'Working · public unprotected streams',requirements:'Internet connection. No key is required for public read-only access. Availability depends on the catalogue; gated and subscription-only recordings are excluded.',capabilities:{playback:true,librarySearch:true,catalogSearch:true,referenceImport:true,audioImport:false,effects:true,analysis:true,sync:false}},
  local: {
    id: 'local', name: 'Local files', color: '#c5f277', status: 'Working',
    description: 'Play files you own through Velvet’s audio engine. Your library stays on this computer.',
    playback: 'Working', search: 'Working', imports: 'Working', effects: 'Working',
    requirements: 'A supported local audio file. Codec support depends on the installed Electron runtime.',
    capabilities: { playback: true, librarySearch: true, catalogSearch: false, referenceImport: false, audioImport: true, effects: true, analysis: true, sync: false },
  },
  spotify: {
    id: 'spotify', name: 'Spotify', color: '#1ed760', status: 'Working · links only',
    description: 'Save Spotify references. Playable versions can be searched inside Velvet. Spotify account streaming is not connected.',
    playback: 'Planned · authenticated streaming', search: 'Planned · connected catalogue', imports: 'Working · service references', effects: 'Unavailable for this provider',
    requirements: 'Spotify determines availability. Full SDK playback needs OAuth, an approved app and Spotify Premium; it is not connected in this release.',
    capabilities: { playback: false, librarySearch: true, catalogSearch: false, referenceImport: true, audioImport: false, effects: false, analysis: false, sync: false },
    docs: 'https://developer.spotify.com/documentation/web-playback-sdk',
  },
  youtube: {
    id: 'youtube', name: 'YouTube Music', color: '#ff6c76', status: 'Working · links only',
    description: 'Save YouTube references and search for playable versions inside Velvet.',
    playback: 'Planned · official visible player', search: 'Planned · connected catalogue', imports: 'Working · service references', effects: 'Unavailable for this provider',
    requirements: 'Availability, advertisements and account requirements are controlled by YouTube. Catalogue search and in-app streaming are not connected.',
    capabilities: { playback: false, librarySearch: true, catalogSearch: false, referenceImport: true, audioImport: false, effects: false, analysis: false, sync: false },
    docs: 'https://developers.google.com/youtube/iframe_api_reference',
  },
  soundcloud: {
    id: 'soundcloud', name: 'SoundCloud', color: '#ff9955', status: 'Working · links only',
    description: 'Save public track and playlist references. Search for playable versions inside Velvet.',
    playback: 'Planned · official widget or authorised API', search: 'Planned · connected catalogue', imports: 'Working · service references', effects: 'Unavailable for this provider',
    requirements: 'Authorised API search and streaming require a registered app and OAuth. Creator, subscription or region restrictions can apply.',
    capabilities: { playback: false, librarySearch: true, catalogSearch: false, referenceImport: true, audioImport: false, effects: false, analysis: false, sync: false },
    docs: 'https://developers.soundcloud.com/docs',
  },
});
const SPOTIFY_ID = /^[a-zA-Z0-9]{22}$/, YOUTUBE_ID = /^[a-zA-Z0-9_-]{11}$/, PLAYLIST_ID = /^[a-zA-Z0-9_-]{10,160}$/;
const SC_RESERVED = new Set(['search', 'discover', 'you', 'stream', 'charts', 'upload', 'settings', 'pages', 'terms-of-use', 'mobile', 'jobs', 'people', 'tracks']);
function safeUrl(value) {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'https:' && !url.username && !url.password && !url.port ? url : null;
  } catch { return null; }
}
export function inferProvider(value) {
  const host = safeUrl(value)?.hostname.toLowerCase();
  if (host === 'open.spotify.com') return 'spotify';
  if (['youtube.com', 'www.youtube.com', 'music.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(host)) return 'youtube';
  return ['soundcloud.com', 'www.soundcloud.com'].includes(host) ? 'soundcloud' : null;
}
function reference(source, type, providerId, url, title) {
  return { id: `reference:${source}:${type}:${providerId}`, providerId, source, type, url, title, artist: 'Service reference', status: 'reference', playable: false,
    explanation: 'Open this reference in its original service. Audio, metadata lookup and playlist expansion are not imported.' };
}
/** Strictly parse share URLs without network requests or redirects. */
export function parseServiceLink(value) {
  const url = safeUrl(value), source = inferProvider(value);
  if (!url || !source) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (source === 'spotify') {
    if (parts[0]?.startsWith('intl-')) parts.shift();
    const [type, id] = parts;
    if (parts.length !== 2 || !['track', 'album', 'playlist'].includes(type) || !SPOTIFY_ID.test(id)) return null;
    return reference(source, type, id, `https://open.spotify.com/${type}/${id}`, `Spotify ${type}`);
  }
  if (source === 'youtube') {
    const isShort = url.hostname.endsWith('youtu.be');
    const id = isShort ? parts[0] : ['shorts', 'embed'].includes(parts[0]) ? parts[1] : url.searchParams.get('v');
    if (id && YOUTUBE_ID.test(id) && (isShort ? parts.length === 1 : ['watch', 'shorts', 'embed'].includes(parts[0]))) {
      return reference(source, 'track', id, `https://music.youtube.com/watch?v=${id}`, 'YouTube track');
    }
    const list = url.searchParams.get('list');
    if (parts[0] === 'playlist' && parts.length === 1 && PLAYLIST_ID.test(list || '')) {
      return reference(source, 'playlist', list, `https://music.youtube.com/playlist?list=${encodeURIComponent(list)}`, 'YouTube playlist');
    }
    return null;
  }
  if (SC_RESERVED.has(parts[0]?.toLowerCase())) return null;
  const isPlaylist = parts.length === 3 && parts[1] === 'sets';
  if (!(parts.length === 2 || isPlaylist) || parts.some(part => !/^[a-zA-Z0-9_-]+$/.test(part))) return null;
  return reference(source, isPlaylist ? 'playlist' : 'track', parts.join('/'), `https://soundcloud.com/${parts.join('/')}`, parts.at(-1).replace(/-/g, ' '));
}
export function getProviderSearchUrl(source, query) {
  const text = String(query || '').trim().slice(0, 500);
  if (!text) return null;
  if (source === 'spotify') return `https://open.spotify.com/search/${encodeURIComponent(text)}`;
  if (source === 'youtube' || source === 'youtubeMusic') return `https://music.youtube.com/search?q=${encodeURIComponent(text)}`;
  if (source === 'soundcloud') return `https://soundcloud.com/search?q=${encodeURIComponent(text)}`;
  return null;
}
/** URL helper only. It does not create a player or establish playback support. */
export function getEmbedUrl(value) {
  const track = parseServiceLink(typeof value === 'string' ? value : value?.url);
  if (!track) return null;
  if (track.source === 'spotify') return `https://open.spotify.com/embed/${track.type}/${track.providerId}`;
  if (track.source === 'youtube' && track.type === 'track') return `https://www.youtube.com/embed/${track.providerId}?autoplay=0`;
  if (track.source === 'youtube' && track.type === 'playlist') return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(track.providerId)}&autoplay=0`;
  return null;
}
const songs = [
  ['Kerala', 'Bonobo', 'Migration', 2017, 'electronic', 'focus', .55, '#fa8762', '#663992'],
  ['Friday Morning', 'Khruangbin', 'Con Todo el Mundo', 2018, 'indie', 'chill', .28, '#edb98c', '#39826c'],
  ['Show Me How', 'Men I Trust', 'Show Me How (single)', 2018, 'indie', 'dreamy', .26, '#93a69b', '#243e42'],
  ['The Less I Know the Better', 'Tame Impala', 'Currents', 2015, 'indie', 'upbeat', .72, '#da817e', '#633d83'],
  ['Pink + White', 'Frank Ocean', 'Blonde', 2016, 'rnb', 'dreamy', .42, '#9eaf9a', '#4b5066'],
  ['Good Days', 'SZA', 'Good Days (single)', 2020, 'rnb', 'dreamy', .43, '#cd819b', '#612f56'],
  ['Feather', 'Nujabes', 'Modal Soul', 2005, 'hip-hop', 'focus', .48, '#d99861', '#3a6373'],
  ['A Walk', 'Tycho', 'Dive', 2011, 'electronic', 'focus', .49, '#f5a580', '#6385a4'],
  ['Vanille fraise', 'L’Impératrice', 'Vanille fraise (single)', 2015, 'electronic', 'upbeat', .68, '#d86158', '#ffcb82'],
  ['Girl', 'The Internet', 'Ego Death', 2015, 'rnb', 'chill', .34, '#886b88', '#334542'],
  ['Casio', 'Jungle', 'For Ever', 2018, 'soul', 'upbeat', .72, '#c99d4f', '#425545'],
  ['Why Don’t You', 'Cleo Sol', 'Rose in the Dark', 2020, 'soul', 'chill', .37, '#a86a4f', '#e2c5a7'],
  ['Introvert', 'Little Simz', 'Sometimes I Might Be Introvert', 2021, 'hip-hop', 'focus', .72, '#ca5a44', '#4e284b'],
  ['Glue', 'Bicep', 'Bicep', 2017, 'electronic', 'euphoric', .78, '#da68a9', '#594ba9'],
  ['Innerbloom', 'RÜFÜS DU SOL', 'Bloom', 2016, 'electronic', 'euphoric', .72, '#e49765', '#6a436f'],
  ['Nights', 'Frank Ocean', 'Blonde', 2016, 'rnb', 'melancholy', .47, '#515c76', '#ad7891'],
  ['Time Moves Slow', 'BADBADNOTGOOD', 'IV', 2016, 'jazz', 'chill', .32, '#ad7b62', '#40334d'],
  ['Tadow', 'Masego & FKJ', 'Tadow (single)', 2017, 'rnb', 'chill', .51, '#b77c4b', '#263a41'],
  ['Redbone', 'Childish Gambino', '“Awaken, My Love!”', 2016, 'soul', 'dreamy', .48, '#8cbed2', '#25384f'],
  ['Sunset Lover', 'Petit Biscuit', 'Petit Biscuit', 2015, 'electronic', 'chill', .48, '#eaa77f', '#6d7ba0'],
  ['Weightless', 'Marconi Union', 'Weightless (Ambient Transmissions Vol. 2)', 2014, 'ambient', 'focus', .12, '#7f9b9c', '#293850'],
  ['An Ending (Ascent)', 'Brian Eno', 'Apollo: Atmospheres and Soundtracks', 1983, 'ambient', 'dreamy', .12, '#a7a6c8', '#3c4f73'],
  ['Avril 14th', 'Aphex Twin', 'Drukqs', 2001, 'ambient', 'focus', .17, '#a49d84', '#4d5861'],
  ['Open Eye Signal', 'Jon Hopkins', 'Immunity', 2013, 'electronic', 'focus', .79, '#c89a81', '#354953'],
  ['Everything In Its Right Place', 'Radiohead', 'Kid A', 2000, 'rock', 'melancholy', .42, '#d0d2c5', '#43546b'],
  ['Dreams', 'Fleetwood Mac', 'Rumours', 1977, 'rock', 'chill', .49, '#e4d4bb', '#827b70'],
  ['Everybody Wants to Rule the World', 'Tears for Fears', 'Songs from the Big Chair', 1985, 'pop', 'upbeat', .72, '#8fa0b5', '#cfaa9a'],
  ['Enjoy the Silence', 'Depeche Mode', 'Violator', 1990, 'electronic', 'melancholy', .7, '#ba656a', '#292f44'],
  ['Teardrop', 'Massive Attack', 'Mezzanine', 1998, 'electronic', 'melancholy', .37, '#a1aca1', '#273d3a'],
  ['Roads', 'Portishead', 'Dummy', 1994, 'electronic', 'melancholy', .27, '#6aa6b6', '#283c56'],
  ['So What', 'Miles Davis', 'Kind of Blue', 1959, 'jazz', 'focus', .4, '#9ba8b5', '#324459'],
  ['My Favorite Things', 'John Coltrane', 'My Favorite Things', 1961, 'jazz', 'focus', .57, '#bfa37b', '#72513e'],
  ['Feeling Good', 'Nina Simone', 'I Put a Spell on You', 1965, 'jazz', 'upbeat', .54, '#b49b81', '#3b434b'],
  ['What’s Going On', 'Marvin Gaye', 'What’s Going On', 1971, 'soul', 'chill', .5, '#a7b599', '#4c6a56'],
  ['Lovely Day', 'Bill Withers', 'Menagerie', 1977, 'soul', 'upbeat', .61, '#eac783', '#8c583e'],
  ['Doo Wop (That Thing)', 'Lauryn Hill', 'The Miseducation of Lauryn Hill', 1998, 'hip-hop', 'upbeat', .75, '#b57850', '#5d4237'],
  ['Electric Relaxation', 'A Tribe Called Quest', 'Midnight Marauders', 1993, 'hip-hop', 'chill', .58, '#b44e50', '#426c53'],
  ['Money Trees', 'Kendrick Lamar', 'good kid, m.A.A.d city', 2012, 'hip-hop', 'chill', .53, '#bcc1a4', '#5e6a6e'],
  ['Get Lucky', 'Daft Punk', 'Random Access Memories', 2013, 'electronic', 'upbeat', .81, '#c9ba84', '#323e4a'],
  ['Midnight City', 'M83', 'Hurry Up, We’re Dreaming', 2011, 'electronic', 'euphoric', .83, '#ce88a1', '#4f4a7b'],
  ['Space Song', 'Beach House', 'Depression Cherry', 2015, 'indie', 'dreamy', .42, '#ad555d', '#47394e'],
  ['Bags', 'Clairo', 'Immunity', 2019, 'indie', 'melancholy', .48, '#a67c6b', '#f0ccb7'],
  ['Here Comes the Sun', 'The Beatles', 'Abbey Road', 1969, 'rock', 'upbeat', .52, '#bdd2a8', '#48736f'],
  ['Levitating', 'Dua Lipa', 'Future Nostalgia', 2020, 'pop', 'upbeat', .83, '#9d76ce', '#e092b5'],
];
export const RECOMMENDATIONS = Object.freeze(songs.map((song, index) => Object.freeze({
  id: `discovery-${String(index + 1).padStart(3, '0')}`, title: song[0], artist: song[1], album: song[2], year: song[3], genre: song[4], mood: song[5], energy: song[6],
  colors: [song[7], song[8]], artwork: null, source: 'discovery', status: 'suggestion', playable: false, curation: 'Curated suggestion',
})));
function normalized(value) { return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function any(value) { return value === undefined || value === null || value === '' || ['all', 'any', 'all moods', 'all genres', 'all decades', 'all energy'].includes(normalized(value)); }
function genreKey(value) { return normalized(value).replace(/^r&b$/, 'rnb').replace(/^hip hop$/, 'hip-hop'); }
/** Deterministic human-curated discovery. Personalisation uses only supplied real records. */
export function getSuggestions(filters = {}) {
  const mood = normalized(filters.mood), genre = genreKey(filters.genre), query = normalized(filters.query);
  const rawDecade = parseInt(String(filters.decade || ''), 10), decade = Number.isFinite(rawDecade) && rawDecade >= 1900 ? Math.floor(rawDecade / 10) * 10 : null;
  const likedArtists = new Set((Array.isArray(filters.likedArtists) ? filters.likedArtists : []).map(normalized));
  const history = Array.isArray(filters.history) ? filters.history : [];
  const historyArtists = new Set(history.map(item => normalized(typeof item === 'string' ? item : item.artist)).filter(Boolean));
  const historyGenres = new Set(history.map(item => typeof item === 'object' ? genreKey(item.genre) : '').filter(Boolean));
  const tracks = RECOMMENDATIONS.filter(track => {
    if (!any(mood) && track.mood !== mood || !any(genre) && track.genre !== genre) return false;
    if (decade && (track.year < decade || track.year > decade + 9)) return false;
    if (query && !normalized(`${track.title} ${track.artist} ${track.album} ${track.genre}`).includes(query)) return false;
    if (!any(filters.energy)) {
      const energy = normalized(filters.energy);
      if (energy === 'low' && track.energy >= .4 || energy === 'medium' && (track.energy < .4 || track.energy >= .7) || energy === 'high' && track.energy < .7) return false;
      if (typeof filters.energy === 'number' && Math.abs(track.energy - filters.energy) > .2) return false;
    }
    return true;
  }).map((track, index) => {
    let score = 0, reason = `${track.mood[0].toUpperCase()}${track.mood.slice(1)} · ${track.genre === 'rnb' ? 'R&B' : track.genre}`;
    if (historyGenres.has(track.genre)) { score += 2; reason = 'A genre from your listening history'; }
    if (historyArtists.has(normalized(track.artist))) { score += 4; reason = 'An artist from your listening history'; }
    if (likedArtists.has(normalized(track.artist))) { score += 8; reason = 'An artist you liked'; }
    return { ...track, score, reason, _order: index, links: {
      spotify: getProviderSearchUrl('spotify', `${track.artist} ${track.title}`), youtube: getProviderSearchUrl('youtube', `${track.artist} ${track.title}`), soundcloud: getProviderSearchUrl('soundcloud', `${track.artist} ${track.title}`),
    } };
  });
  tracks.sort((a, b) => b.score - a.score || a._order - b._order);
  const limit = Number.isFinite(Number(filters.limit)) ? Math.max(0, Math.min(100, Math.floor(Number(filters.limit)))) : 18;
  return tracks.slice(0, limit).map(({ _order, ...track }) => track);
}

