import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {AudioEngine,DEFAULT_SETTINGS,EQ_FREQUENCIES,GRAPHIC_FREQUENCIES,createDefaultSettings,normalizeAudioSettings,createImpulseData,validateChainOrder,dbToGain} from '../src/audio-engine.js';

test('imported audio settings clamp unsafe values and reject invalid chain order',()=>{
  const settings=normalizeAudioSettings({gain:99,width:-5,balance:NaN,tones:{bass:30,treble:-25},eq:[{frequency:999999,gain:Infinity,q:0}],compression:{threshold:-300,ratio:80,attack:-1},reverb:{wet:5,decay:90},chainOrder:['gain','limiter']});
  assert.equal(settings.gain,2);assert.equal(settings.width,0);assert.equal(settings.balance,0);
  assert.equal(settings.tones.bass,12);assert.equal(settings.tones.treble,-12);
  assert.deepEqual(settings.eq[0],{frequency:20000,gain:0,q:.1});
  assert.equal(settings.compression.threshold,-60);assert.equal(settings.compression.ratio,20);assert.equal(settings.compression.attack,.001);
  assert.equal(settings.reverb.wet,1);assert.equal(settings.reverb.decay,8);assert.equal(settings.limiter,true);
  assert.deepEqual(settings.chainOrder,['tone','eq','compression','reverb','stereo']);
  assert.deepEqual(normalizeAudioSettings(null),createDefaultSettings());
});
test('settings and exports never mutate defaults or leak mutable references',()=>{
  const first=createDefaultSettings(),second=createDefaultSettings();first.eq[0].gain=8;first.tones.bass=7;
  assert.equal(second.eq[0].gain,0);assert.equal(DEFAULT_SETTINGS.tones.bass,0);
  const audio={playbackRate:1,preservesPitch:true};const engine=new AudioEngine(audio);
  engine.setTone('bass',6);engine.setSpeed(1.5,false);assert.equal(audio.playbackRate,1.5);assert.equal(audio.preservesPitch,false);
  engine.applySettings({tones:{clarity:3},compression:{enabled:true}});
  assert.equal(engine.settings.tones.bass,6);assert.equal(engine.settings.tones.clarity,3);assert.equal(engine.settings.compression.threshold,-24);
  const exported=engine.exportSettings();exported.tones.bass=0;assert.equal(engine.settings.tones.bass,6);
  engine.reset();assert.deepEqual(engine.exportSettings(),createDefaultSettings());assert.equal(audio.playbackRate,1);
});
test('equalizer mode and imported values remain independently editable',()=>{
  const engine=new AudioEngine({});engine.setEQ(0,{frequency:80,gain:6,q:2});engine.setGraphicEQ(5,9);engine.setEQMode(31);
  assert.deepEqual(engine.settings.eq[0],{frequency:80,gain:6,q:2});assert.equal(engine.settings.graphicEQ[5],9);assert.equal(engine.settings.eqMode,31);
  engine.setEQ(-1,{gain:12});engine.setGraphicEQ(99,12);assert.equal(engine.settings.eq.length,10);assert.equal(engine.settings.graphicEQ.length,31);
  assert.equal(EQ_FREQUENCIES.length,10);assert.equal(GRAPHIC_FREQUENCIES.length,31);
  assert.deepEqual(validateChainOrder(['stereo','reverb','compression','eq','tone']),['stereo','reverb','compression','eq','tone']);
  assert.deepEqual(validateChainOrder(['tone','tone','eq','reverb','stereo']),DEFAULT_SETTINGS.chainOrder);
});
test('reverb impulse is deterministic, stereo, finite and decays',()=>{
  const first=createImpulseData(8000,.5,.5),second=createImpulseData(8000,.5,.5);
  assert.equal(first.length,2);assert.equal(first[0].length,4000);assert.deepEqual(first,second);assert.notDeepEqual(first[0],first[1]);
  assert.ok(first.every(channel=>channel.every(Number.isFinite)));
  const energy=(a,start,end)=>a.slice(start,end).reduce((sum,x)=>sum+x*x,0)/(end-start);
  assert.ok(energy(first[0],200,800)>energy(first[0],3200,3800)*100);
  assert.equal(dbToGain(0),1);assert.ok(Math.abs(dbToGain(6)-1.9952623149688795)<1e-10);
});

// Actual DSP tests use Chromium's OfflineAudioContext. Set
// VELVET_PLAYWRIGHT_PATH to a local Playwright module for dependency-free CI,
// or install Playwright locally and set VELVET_AUDIO_BROWSER=msedge/chrome.
let chromium;
try{
  const module=process.env.VELVET_PLAYWRIGHT_PATH?await import(pathToFileURL(process.env.VELVET_PLAYWRIGHT_PATH).href):await import('playwright');
  chromium=module.chromium||module.default?.chromium;
}catch{}
test('real OfflineAudioContext verifies gain, tone, EQ, bypass, mono, reverb and limiter',{skip:!chromium},async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.VELVET_AUDIO_BROWSER?{channel:process.env.VELVET_AUDIO_BROWSER}:{})});
  try{
    const page=await browser.newPage();
    const module='data:text/javascript;base64,'+Buffer.from(await readFile(new URL('../src/audio-engine.js',import.meta.url),'utf8')).toString('base64');
    const result=await page.evaluate(async({module})=>{
      const {AudioEngine}=await import(module);
      async function render(settings={},frequency=1000,amplitude=.2,antiPhase=false,impulse=false){
        const rate=48000,length=rate,context=new OfflineAudioContext(2,length,rate),buffer=context.createBuffer(2,length,rate);
        for(let channel=0;channel<2;channel++){
          const data=buffer.getChannelData(channel);
          for(let i=0;i<length;i++)data[i]=impulse?(i===4800?amplitude:0):amplitude*Math.sin(2*Math.PI*frequency*i/rate)*(antiPhase&&channel?-1:1);
        }
        const source=context.createBufferSource();source.buffer=buffer;
        const engine=new AudioEngine(null,{context,source});await engine.init();engine.applySettings({limiter:false,...settings});source.start();
        const out=await context.startRendering(),data=out.getChannelData(0);
        let peak=0,squares=0,tail=0;
        for(let i=24000;i<40000;i++){peak=Math.max(peak,Math.abs(data[i]));squares+=data[i]*data[i];}
        for(let i=6000;i<18000;i++)tail+=data[i]*data[i];
        return{peak,rms:Math.sqrt(squares/16000),tail};
      }
      const flat=await render(),gain=await render({gain:2}),eq=await render({eq:[{frequency:1000,gain:6,q:1}]}),toneFlat=await render({},70),tone=await render({tones:{bass:6}},70),bypass=await render({tones:{bass:12},gain:2,bypass:true},70),mono=await render({mono:true},1000,.2,true),uncompressedLoud=await render({},1000,.6),uncompressedQuiet=await render({},1000,.06),compressed=await render({compression:{enabled:true,threshold:-30,ratio:10}},1000,.6),compressedQuiet=await render({compression:{enabled:true,threshold:-30,ratio:10}},1000,.06),loud=await render({gain:2},1000,.9),limited=await render({gain:2,limiter:true},1000,.9),reverb=await render({reverb:{enabled:true,wet:.8,decay:.5,preDelay:0}},1000,.5,false,true),dry=await render({},1000,.5,false,true);
      return{flat,gain,eq,toneFlat,tone,bypass,mono,uncompressedLoud,uncompressedQuiet,compressed,compressedQuiet,loud,limited,reverb,dry};
    },{module});
    assert.ok(result.gain.rms/result.flat.rms>1.98&&result.gain.rms/result.flat.rms<2.02,'gain must double amplitude');
    assert.ok(result.eq.rms/result.flat.rms>1.9,'parametric EQ must boost actual audio');
    assert.ok(result.tone.rms/result.toneFlat.rms>1.7,'bass shelf must boost actual low frequencies');
    assert.ok(Math.abs(result.bypass.rms/result.toneFlat.rms-1)<.02,'A/B bypass must restore flat response');
    assert.ok(result.mono.peak<1e-5,'mono must cancel anti-phase stereo');
    const inputRange=result.uncompressedLoud.rms/result.uncompressedQuiet.rms;
    const compressedRange=result.compressed.rms/result.compressedQuiet.rms;
    assert.ok(inputRange>9.8&&inputRange<10.2,'uncompressed baseline must retain the 10:1 amplitude ratio');
    assert.ok(compressedRange<inputRange*.65,'compression must reduce measured loud/quiet dynamic range despite automatic makeup gain');
    assert.ok(result.compressed.rms<result.uncompressedLoud.rms,'compression must attenuate this above-threshold loud signal relative to its own baseline');
    assert.ok(result.loud.peak>1.7,'unlimited 200% gain should expose above-full-scale peaks');
    assert.ok(result.limited.peak<1.001,'enabled limiter must keep these boosted samples below full scale');
    assert.ok(result.reverb.tail>result.dry.tail+1e-7,'convolution must create a real decay tail');
  }finally{await browser.close();}
});
