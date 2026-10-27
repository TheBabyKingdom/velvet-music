const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {StateStore,ImportManager,publicState,playlistDocument,parsePlaylist} = require('../electron/library.cjs');

async function run() {
  const root = path.resolve(__dirname,'..','work','backend-smoke');
  await fs.mkdir(root,{recursive:true});
  const directory = await fs.mkdtemp(path.join(root,'run-'));
  try {
    const store = new StateStore(directory); await store.load();
    const importer = new ImportManager(store);
    const demo = path.resolve(__dirname,'..','assets','demo');
    const preview = await importer.preview([demo]);
    assert.equal(preview.tracks.length,3,'Three original WAV files should be recognized.');
    assert.equal(store.state.tracks.length,0,'Import preview must not mutate the library.');
    const report = await importer.commit(preview.token);
    assert.equal(report.imported,3);
    const retry = await importer.preview([demo]);
    assert.equal(retry.tracks.length,0);
    assert.equal(retry.duplicates.length,3,'Reimporting must not duplicate tracks.');
    importer.cancel(retry.token);
    const snapshot = publicState(store.state);
    const ids = snapshot.tracks.map(track=>track.id);
    const service = {id:'reference-one',source:'youtube',title:'A service reference',artist:'Artist',externalUrl:'https://music.youtube.com/search?q=a+song'};
    snapshot.tracks.push(service);
    snapshot.playlists=[{id:'night',name:'Late, late',description:'Mixed-source playlist',trackIds:[ids[2],service.id,ids[0],ids[2]],folderId:'sets',smart:null},{id:'smart',name:'Ambient favourites',trackIds:[],smart:{genre:'ambient',favorites:true}}];
    snapshot.folders=[{id:'sets',name:'Sets'}];
    snapshot.queue=[ids[2],ids[0],ids[1]];snapshot.queueIndex=1;snapshot.favorites=[ids[0],service.id];
    snapshot.history=[{trackId:ids[0],at:'2026-10-25T12:00:00Z',seconds:30}];
    snapshot.settings={theme:'oled',volume:0.45,repeat:'all',shuffle:true,audio:{gain:1.5,limiter:true,balance:0.2,eqMode:'31'},background:{id:'c055c225-7117-4370-8098-e26ade12c86f.gif',type:'image',url:'velvet-media://background/c055c225-7117-4370-8098-e26ade12c86f.gif'}};
    await store.update(snapshot);
    const reopened = new StateStore(directory);await reopened.load();
    const restored=publicState(reopened.state);
    assert.deepEqual(restored.queue,snapshot.queue);assert.equal(restored.queueIndex,1);
    assert.deepEqual(restored.favorites,snapshot.favorites);assert.deepEqual(restored.history,snapshot.history);
    assert.equal(restored.playlists[0].description,'Mixed-source playlist');
    assert.deepEqual(restored.playlists[0].trackIds,snapshot.playlists[0].trackIds);
    assert.equal(restored.playlists[1].smart.favorites,true);assert.equal(restored.folders[0].name,'Sets');
    assert.deepEqual(restored.settings,snapshot.settings);
    assert.ok(restored.tracks.filter(track=>track.source==='local').every(track=>track.mediaUrl.startsWith('velvet-media://track/')&&!track.filePath));
    for(const format of ['json','csv','m3u8']){
      const document=playlistDocument(reopened.state.playlists[0],reopened.state.tracks,format);
      const parsed=parsePlaylist(document,format,reopened.state.tracks,demo);
      assert.deepEqual(parsed.tracks.map(track=>track.id),snapshot.playlists[0].trackIds,format+' must retain order and repeated references.');
      assert.equal(parsed.missing.length,0);
    }
    console.log(JSON.stringify({ok:true,imported:3,duplicateDetection:true,restartRestoration:['queue','index','playlists','folders','smart-rules','favorites','history','theme','audio','background'],playlistRoundTrips:['JSON','CSV','M3U8'],publicFilePathsExposed:false}));
  } finally {
    const target=path.resolve(directory);
    if(!target.startsWith(root+path.sep)) throw new Error('Unexpected test cleanup path.');
    await fs.rm(target,{recursive:true,force:true});
  }
}
module.exports={run};
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});

