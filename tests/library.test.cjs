const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {StateStore, ImportManager, defaultState, normalizeState, publicState, validExternalURL, parseCSV, playlistDocument, parsePlaylist} = require('../electron/library.cjs');

async function workspace(t) {
  const testRoot = path.join(__dirname, '..', 'work', 'test-libraries');
  await fs.mkdir(testRoot, {recursive:true});
  const directory = await fs.mkdtemp(path.join(testRoot, 'velvet-test-'));
  t.after(() => fs.rm(directory, {recursive:true, force:true}));
  return directory;
}
function wav(frequency = 440) {
  const frames = 4000; const rate = 8000; const data = Buffer.alloc(44 + frames * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8,4); data.write('WAVE',8); data.write('fmt ',12);
  data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22); data.writeUInt32LE(rate,24);
  data.writeUInt32LE(rate*2,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34);
  data.write('data',36); data.writeUInt32LE(frames*2,40);
  for(let i=0;i<frames;i++) data.writeInt16LE(Math.round(Math.sin(i*frequency/rate*Math.PI*2)*3000),44+i*2);
  return data;
}
function track(filePath, trackId='local-one') {
  return {id:trackId,source:'local',title:'Rain, softly',artist:'Artist "A"',album:'Room',filePath,duration:123,addedAt:'2026-10-25T00:00:00Z'};
}

test('untrusted renderer cannot register local files or replace authoritative paths', t => {
  const file = path.join(os.tmpdir(),'original.mp3');
  const initial = normalizeState({tracks:[track(file)]},defaultState(),true);
  const updated = normalizeState({tracks:[{...track(path.join(os.tmpdir(),'secret.txt')),title:'Edited'},track(path.join(os.tmpdir(),'other.mp3'),'forged')]},initial);
  assert.equal(updated.tracks.length,1);
  assert.equal(updated.tracks[0].filePath,file);
  assert.equal(updated.tracks[0].title,'Edited');
  const exposed=publicState(updated);
  assert.equal(exposed.tracks[0].filePath,undefined);
  assert.equal(exposed.tracks[0].mediaUrl,'velvet-media://track/local-one');
});

test('only explicit provider HTTPS hosts can be opened or stored', () => {
  assert.equal(validExternalURL('https://open.spotify.com/track/abc'),true);
  assert.equal(validExternalURL('https://music.youtube.com/watch?v=abc','youtube'),true);
  for(const url of ['file:///C:/secret.txt','javascript:alert(1)','https://open.spotify.com.evil.example/a','https://user:pass@soundcloud.com/a','http://youtube.com','https://youtube.com:444/a']) assert.equal(validExternalURL(url),false,url);
  const state=normalizeState({tracks:[{id:'ref',title:'Song',source:'spotify',externalUrl:'https://open.spotify.com/track/abc'},{id:'bad',title:'Bad',source:'youtube',externalUrl:'https://evil.example'}]});
  assert.equal(state.tracks.length,1);
});

test('atomic persistence restores settings, playlists, queue and prior backup after corruption', async t => {
  const directory=await workspace(t);
  const store=new StateStore(directory); await store.load();
  const file=path.join(directory,'track.wav');await fs.writeFile(file,wav());
  await store.update({tracks:[track(file)],playlists:[{id:'p',name:'Night',trackIds:['local-one']}],queue:['local-one'],favorites:['local-one'],settings:{theme:'oled',accent:'#c4ef82'}},true);
  await store.update({settings:{theme:'light'}});
  const restored=new StateStore(directory);await restored.load();
  assert.deepEqual(restored.state.queue,['local-one']);
  assert.equal(restored.state.playlists[0].name,'Night');
  assert.equal(restored.state.settings.theme,'light');
  await fs.writeFile(store.file,'{broken');
  const recovered=new StateStore(directory);await recovered.load();
  assert.match(recovered.recovery,/restored its backup/);
  assert.equal(recovered.state.settings.theme,'oled');
  assert.deepEqual(recovered.state.favorites,['local-one']);
});

test('import preview does not mutate, detects identical content and commits only once', async t => {
  const directory=await workspace(t);
  const folder=path.join(directory,'music');await fs.mkdir(folder);
  await fs.writeFile(path.join(folder,'A - First.wav'),wav());
  await fs.writeFile(path.join(folder,'Copy.wav'),wav());
  await fs.writeFile(path.join(folder,'Second.wav'),wav(220));
  await fs.writeFile(path.join(folder,'ignore.txt'),'not audio');
  const store=new StateStore(path.join(directory,'data'));await store.load();
  const progress=[];const importer=new ImportManager(store,event=>progress.push(event));
  const preview=await importer.preview([folder],'preview-one');
  assert.equal(preview.total,3);
  assert.equal(preview.tracks.length,2);
  assert.equal(preview.duplicates.length,1);
  assert.equal(store.state.tracks.length,0);
  assert.equal(preview.tracks[0].filePath,undefined);
  assert.equal(progress.at(-1).phase,'ready');
  const result=await importer.commit(preview.token);
  assert.equal(result.imported,2);
  assert.equal(store.state.tracks.length,2);
  await assert.rejects(importer.commit(preview.token),/expired/);
  const again=await importer.preview([folder]);
  assert.equal(again.tracks.length,0);
  assert.equal(again.duplicates.length,3);
  importer.cancel(again.token);
  await assert.rejects(importer.commit(again.token),/expired/);
});

test('CSV and JSON round trips retain commas, quotes, service references and playlist order', () => {
  const local=normalizeState({tracks:[track(path.join(os.tmpdir(),'a.wav'))]},defaultState(),true).tracks[0];
  const reference=normalizeState({tracks:[{id:'ref',source:'spotify',title:'Reference',artist:'Artist',externalUrl:'https://open.spotify.com/track/abc'}]}).tracks[0];
  const tracks=[local,reference];
  const playlist={id:'mix',name:'Late, late',description:'Description',trackIds:['ref','local-one','ref']};
  const csv=playlistDocument(playlist,tracks,'csv');
  const parsedCSV=parsePlaylist(csv,'csv',tracks);
  assert.deepEqual(parsedCSV.tracks.map(value=>value.id),playlist.trackIds);
  assert.equal(parsedCSV.tracks[1].artist,'Artist "A"');
  const parsedJSON=parsePlaylist(playlistDocument(playlist,tracks,'json'),'json',tracks);
  assert.equal(parsedJSON.name,playlist.name);
  assert.equal(parsedJSON.description,playlist.description);
  assert.equal(parsedJSON.duplicates.length,1);
  assert.deepEqual(parsedJSON.tracks.map(value=>value.id),playlist.trackIds);
  assert.deepEqual(parseCSV('"line\nbreak","quote ""inside"""\r\nx,y'),[['line\nbreak','quote "inside"'],['x','y']]);
});

test('M3U import reports missing tracks and resolves local relative paths without importing them', () => {
  const directory=path.join(os.tmpdir(),'velvet-m3u');
  const local=normalizeState({tracks:[track(path.join(directory,'song.wav'))]},defaultState(),true).tracks[0];
  const parsed=parsePlaylist('#EXTM3U\n#PLAYLIST:Travel\n#EXTINF:123,Artist - Song\nsong.wav\nmissing.wav\nhttps://soundcloud.com/artist/track','m3u8',[local],directory);
  assert.equal(parsed.name,'Travel');
  assert.equal(parsed.tracks[0].id,local.id);
  assert.equal(parsed.tracks[1].source,'soundcloud');
  assert.equal(parsed.missing.length,1);
});

test('newer schema is rejected, hostile settings keys are stripped, invalid queue entries removed', () => {
  assert.throws(()=>normalizeState({schemaVersion:2}),/newer/);
  const input=JSON.parse('{"settings":{"__proto__":{"polluted":true},"theme":"dark","constructor":"x"},"queue":["unknown"]}');
  const state=normalizeState(input);
  assert.equal({}.polluted,undefined);
  assert.equal(Object.hasOwn(state.settings,'__proto__'),false);
  assert.deepEqual(state.queue,[]);
});



test('catalog metadata search serializes requests, caches results and maps only metadata', async () => {
  const {CatalogSearch}=require('../electron/library.cjs');
  let clock=10000; const requests=[]; const waits=[];
  const search=new CatalogSearch({
    now:()=>clock, sleep:async milliseconds=>{waits.push(milliseconds);clock+=milliseconds;},
    contact:()=> 'https://example.test/maintainer',
    fetchImpl:async (url,options)=>{
      requests.push({url,options,at:clock});
      return {ok:true,json:async()=>({recordings:[{id:'b2d3fa20-7c1c-4b4c-9df6-9230ce537b89',title:'A Song',length:123000,score:98,'artist-credit':[{name:'Artist A',joinphrase:' & '},{artist:{name:'Artist B'}}],releases:[{title:'Album',date:'2020-01-02'}]}]})};
    },
  });
  const [first,second]=await Promise.all([search.search('A Song'),search.search('Another Song')]);
  assert.equal(requests.length,2);
  assert.ok(requests[1].at-requests[0].at>=1100);
  assert.deepEqual(waits,[1100]);
  assert.equal(first[0].source,'catalog');
  assert.equal(first[0].duration,123);
  assert.equal(first[0].artist,'Artist A & Artist B');
  assert.equal(first[0].year,'2020');
  assert.equal(first[0].mediaUrl,undefined);
  assert.match(requests[0].options.headers['User-Agent'],/VelvetMusic\/1\.0\.0/);
  assert.equal(new URL(requests[0].url).searchParams.get('dismax'),'true');
  assert.deepEqual(await search.search(' a song '),first);
  assert.equal(requests.length,2);
  await assert.rejects(search.search('x'),/between 2 and 200/);
});

test('catalog network failure returns an explanation and next request can recover', async () => {
  const {CatalogSearch}=require('../electron/library.cjs');
  let failed=false;
  const search=new CatalogSearch({now:()=>100000,sleep:async()=>{},fetchImpl:async()=>{if(!failed){failed=true;return {ok:false,status:503};} return {ok:true,json:async()=>({recordings:[]})};}});
  await assert.rejects(search.search('first search'),/limiting requests/);
  assert.deepEqual(await search.search('second search'),[]);
});

