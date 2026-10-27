/** Actual Web Audio rendering checks. Called by the Electron desktop test harness. */
const assert = require('node:assert/strict');
async function checksInRenderer() {
  const {AudioEngine} = await import(new URL('./audio-engine.js', location.href).href);
  async function render(settings = {}, options = {}) {
    const rate=48000,length=rate,context=new OfflineAudioContext(2,length,rate),buffer=context.createBuffer(2,length,rate);
    const {frequency=1000,amplitude=.2,antiPhase=false,impulse=false,transition=false}=options;
    for(let channel=0;channel<2;channel++){
      const data=buffer.getChannelData(channel);
      for(let i=0;i<length;i++)data[i]=impulse?(i===4800?amplitude:0):amplitude*Math.sin(2*Math.PI*frequency*i/rate)*(antiPhase&&channel?-1:1);
    }
    const source=context.createBufferSource();source.buffer=buffer;
    const engine=new AudioEngine(null,{context,source});await engine.init();engine.applySettings({limiter:false,...settings});source.start();
    let output;
    if(transition){
      const pause=context.suspend(.3073),rendering=context.startRendering();await pause;engine.applySettings({gain:2,tones:{bass:3}});await context.resume();output=await rendering;
    }else output=await context.startRendering();
    const data=output.getChannelData(0);let peak=0,fullPeak=0,squares=0,tail=0,maxDelta=0,finite=true;
    for(let i=24000;i<40000;i++){peak=Math.max(peak,Math.abs(data[i]));squares+=data[i]*data[i];}
    for(let i=6000;i<18000;i++)tail+=data[i]*data[i];
    for(let i=14000;i<22000;i++)maxDelta=Math.max(maxDelta,Math.abs(data[i]-data[i-1]));
    for(let i=0;i<data.length;i++){fullPeak=Math.max(fullPeak,Math.abs(data[i]));if(!Number.isFinite(data[i]))finite=false;}
    return{peak,fullPeak,rms:Math.sqrt(squares/16000),tail,maxDelta,finite};
  }
  const flat=await render();
  const gain=await render({gain:2});
  const eq=await render({eq:[{frequency:1000,gain:6,q:1}]});
  const graphic=await render({eqMode:31,graphicEQ:Array.from({length:31},(_,i)=>i===17?6:0)});
  const toneFlat=await render({},{frequency:70});
  const tone=await render({tones:{bass:6}},{frequency:70});
  const bypass=await render({tones:{bass:12},gain:2,bypass:true},{frequency:70});
  const mono=await render({mono:true},{antiPhase:true});
  const stereo=await render({},{antiPhase:true});
  const compressed=await render({compression:{enabled:true,threshold:-30,ratio:10}},{amplitude:.6});
  const loud=await render({gain:2},{amplitude:.9});
  const limited=await render({gain:2,limiter:true},{amplitude:.9});
  const reverb=await render({reverb:{enabled:true,wet:.8,decay:.5,preDelay:0}},{amplitude:.5,impulse:true});
  const dry=await render({},{amplitude:.5,impulse:true});
  const smooth=await render({},{transition:true});
  return{flat,gain,eq,graphic,toneFlat,tone,bypass,mono,stereo,compressed,loud,limited,reverb,dry,smooth};
}
exports.run=async function run(windowOrOptions){
  const window=windowOrOptions.window||windowOrOptions;
  const result=await window.webContents.executeJavaScript(`(${checksInRenderer.toString()})()`);
  try {
  for(const [name,metric]of Object.entries(result))assert.ok(metric.finite,`${name} must contain only finite audio samples`);
  assert.ok(result.gain.rms/result.flat.rms>1.98&&result.gain.rms/result.flat.rms<2.02,'gain must double actual amplitude');
  assert.ok(result.eq.rms/result.flat.rms>1.9,'parametric EQ must boost actual audio');
  assert.ok(result.graphic.rms/result.flat.rms>1.9,'31-band graphic EQ must boost actual audio');
  assert.ok(result.tone.rms/result.toneFlat.rms>1.7,'bass shelf must boost actual low frequencies');
  assert.ok(Math.abs(result.bypass.rms/result.toneFlat.rms-1)<.02,'A/B bypass must restore flat response');
  assert.ok(result.mono.peak<1e-5,'mono must cancel anti-phase stereo');
  assert.ok(result.stereo.rms>.1,'stereo baseline must retain anti-phase signal');
  assert.ok(result.compressed.rms<.15,'compression must lower sustained loud signals');
  assert.ok(result.loud.peak>1.7,'unlimited 200% gain must expose above-full-scale peaks');
  assert.ok(result.limited.fullPeak<1.001,'default limiter must keep every boosted sample, including attack, below full scale');
  assert.ok(result.reverb.tail>result.dry.tail+1e-7,'convolution must create a real decay tail');
  assert.ok(result.smooth.maxDelta<.07,'gain/preset transitions must avoid discontinuous amplitude steps');
  assert.ok(result.smooth.rms/result.flat.rms>1.9,'smoothed settings must settle to the new audio amplitude');
  } catch(error) {error.metrics=result;throw error;}
  console.log('AUDIO_OFFLINE_OK',JSON.stringify(result));
  return result;
};

