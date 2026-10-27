/** Real local-audio DSP. Protected or embedded providers must not connect here. */
export const EQ_FREQUENCIES = Object.freeze([31,62,125,250,500,1000,2000,4000,8000,16000]);
export const GRAPHIC_FREQUENCIES = Object.freeze([20,25,31.5,40,50,63,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000,12500,16000,20000]);
export const TONE_CONTROLS = Object.freeze({
  subbass:{label:'Sub-bass',frequency:50,type:'lowshelf',q:.7,description:'The deepest low-frequency rumble, around 50 Hz.'},
  bass:{label:'Bass',frequency:120,type:'lowshelf',q:.7,description:'The weight of bass lines and kick drums.'},
  warmth:{label:'Warmth',frequency:300,type:'peaking',q:.8,description:'Body and richness in the lower midrange.'},
  mids:{label:'Mids',frequency:1000,type:'peaking',q:.7,description:'The presence of voices and instruments.'},
  clarity:{label:'Clarity',frequency:3500,type:'peaking',q:.8,description:'Definition and articulation in the upper midrange.'},
  treble:{label:'Treble',frequency:8000,type:'highshelf',q:.7,description:'High-frequency detail and brightness.'},
});
const CHAIN=Object.freeze(['tone','eq','compression','reverb','stereo']);
const DEFAULT={
  tones:{subbass:0,bass:0,warmth:0,mids:0,clarity:0,treble:0},
  eq:EQ_FREQUENCIES.map(frequency=>({frequency,gain:0,q:1})),
  eqMode:10,graphicEQ:GRAPHIC_FREQUENCIES.map(()=>0),
  gain:1,balance:0,mono:false,width:1,limiter:true,bypass:false,
  compression:{enabled:false,threshold:-24,ratio:4,attack:.01,release:.25},
  reverb:{enabled:false,wet:.18,decay:1.8,room:.55,damping:.45,preDelay:20},
  chainOrder:[...CHAIN],speed:1,preservePitch:true,visualizer:{enabled:true,style:'bars',color:'#d4b7ff',sensitivity:1},
};
function deepFreeze(value){Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object'&&!Object.isFrozen(child))deepFreeze(child);return value;}
export const DEFAULT_SETTINGS=deepFreeze(DEFAULT);
export const createDefaultSettings=()=>JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
export function clamp(value,min,max,fallback=min){const number=Number(value);return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;}
export function dbToGain(db){return 10**(clamp(db,-120,48,0)/20);}
export function validateChainOrder(order){if(!Array.isArray(order)||order.length!==CHAIN.length||new Set(order).size!==CHAIN.length||order.some(name=>!CHAIN.includes(name)))return [...CHAIN];return [...order];}
export function normalizeAudioSettings(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))input={};
  const result=createDefaultSettings();
  for(const name of Object.keys(result.tones))result.tones[name]=clamp(input.tones?.[name]??0,-12,12,0);
  result.eq=result.eq.map((band,index)=>({frequency:clamp(input.eq?.[index]?.frequency??band.frequency,20,20000,band.frequency),gain:clamp(input.eq?.[index]?.gain??0,-12,12,0),q:clamp(input.eq?.[index]?.q??1,.1,18,1)}));
  result.graphicEQ=result.graphicEQ.map((_,index)=>clamp(input.graphicEQ?.[index]??0,-12,12,0));
  result.eqMode=Number(input.eqMode)===31?31:10;
  result.gain=clamp(input.gain??1,0,2,1);result.balance=clamp(input.balance??0,-1,1,0);result.width=clamp(input.width??1,0,2,1);
  for(const name of ['mono','bypass'])result[name]=input[name]===true;
  result.limiter=input.limiter!==false;
  result.compression={enabled:input.compression?.enabled===true,threshold:clamp(input.compression?.threshold??-24,-60,0,-24),ratio:clamp(input.compression?.ratio??4,1,20,4),attack:clamp(input.compression?.attack??.01,.001,1,.01),release:clamp(input.compression?.release??.25,.01,1,.25)};
  result.reverb={enabled:input.reverb?.enabled===true,wet:clamp(input.reverb?.wet??.18,0,1,.18),decay:clamp(input.reverb?.decay??1.8,.1,8,1.8),room:clamp(input.reverb?.room??.55,0,1,.55),damping:clamp(input.reverb?.damping??.45,0,1,.45),preDelay:clamp(input.reverb?.preDelay??20,0,250,20)};
  result.speed=clamp(input.speed??1,.5,2,1);result.preservePitch=input.preservePitch!==false;result.chainOrder=validateChainOrder(input.chainOrder);
  result.visualizer={enabled:input.visualizer?.enabled!==false,style:['bars','line','mirror'].includes(input.visualizer?.style)?input.visualizer.style:'bars',color:/^#[0-9a-f]{6}$/i.test(input.visualizer?.color||'')?input.visualizer.color:'#d4b7ff',sensitivity:clamp(input.visualizer?.sensitivity??1,.5,2.5,1)};
  return result;
}
/** Deterministic stereo impulse. No audio download or network is involved. */
export function createImpulseData(sampleRate,decay,room){
  const rate=clamp(sampleRate,8000,192000,48000),seconds=clamp(decay,.1,8,1.8),roomSize=clamp(room,0,1,.55),length=Math.ceil(rate*seconds);
  let seed=73687;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return(seed/4294967296)*2-1;};
  return[0,1].map(channel=>{
    const data=new Float32Array(length),early=Math.round(rate*(.009+roomSize*.05));
    for(let i=0;i<length;i++)data[i]=random()*Math.exp(-6.91*i/length)*(.25+.75*Math.min(1,i/Math.max(1,early)));
    for(let echo=1;echo<=5;echo++){const index=Math.round(early*echo*(channel?1.07:1));if(index<length)data[index]+=.7*Math.exp(-echo/2);}
    return data;
  });
}
export class AudioEngine{
  constructor(audioElement,options={}){
    this.audio=audioElement;this.context=options.context||null;this.source=options.source||null;this.settings=createDefaultSettings();
    this.nodes=null;this.initialized=false;this._disposed=false;this._impulseKey='';this._rewireTimer=null;this._impulseTimer=null;this._activeImpulse=0;
    this._meter={peak:0,rms:0,inputPeak:0,clipping:false,reduction:0};this._lastClip=0;
  }
  async init(){
    if(this._disposed)throw new Error('The audio engine has been closed.');
    if(!this.context){const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Context)throw new Error('Web Audio is unavailable in this browser.');this.context=new Context({latencyHint:'interactive'});}
    if(!this.initialized){if(!this.source){if(!this.audio)throw new Error('A local audio element is required.');this.source=this.context.createMediaElementSource(this.audio);}this._build();this.initialized=true;this._apply();}
    await this.resume();return this;
  }
  async resume(){if(this.context&&!this.context.startRendering&&this.context.state==='suspended')await this.context.resume();return this;}
  _smooth(parameter,value,seconds=.018){
    if(!parameter||!this.context)return;
    const now=this.context.currentTime;
    if(typeof parameter.cancelAndHoldAtTime==='function')parameter.cancelAndHoldAtTime(now);else parameter.cancelScheduledValues(now);
    parameter.setTargetAtTime(value,now,seconds);
  }
  _gain(value=1){const node=this.context.createGain();node.gain.value=value;return node;}
  _build(){
    const c=this.context,input=this._gain(),groups={};
    input.channelCount=2;input.channelCountMode='explicit';input.channelInterpretation='speakers';
    const serial=filters=>{const entrance=this._gain(),exit=this._gain();let previous=entrance;for(const filter of filters){previous.connect(filter);previous=filter;}previous.connect(exit);return{input:entrance,output:exit};};
    const tones={};
    for(const[name,definition]of Object.entries(TONE_CONTROLS)){const filter=c.createBiquadFilter();filter.type=definition.type;filter.frequency.value=Math.min(definition.frequency,c.sampleRate*.49);filter.Q.value=definition.q;filter.gain.value=0;tones[name]=filter;}
    groups.tone=serial(Object.values(tones));
    const makeFilter=(frequency,q)=>{const filter=c.createBiquadFilter();filter.type='peaking';filter.frequency.value=Math.min(frequency,c.sampleRate*.49);filter.Q.value=q;filter.gain.value=0;return filter;};
    const eq=EQ_FREQUENCIES.map(frequency=>makeFilter(frequency,1)),graphic=GRAPHIC_FREQUENCIES.map(frequency=>makeFilter(frequency,4.318));groups.eq=serial([...eq,...graphic]);
    const compressor=c.createDynamicsCompressor(),compInput=this._gain(),compOutput=this._gain(),compDry=this._gain(1),compWet=this._gain(0);
    compInput.connect(compDry).connect(compOutput);compInput.connect(compressor).connect(compWet).connect(compOutput);groups.compression={input:compInput,output:compOutput};
    const reverbInput=this._gain(),reverbOutput=this._gain(),reverbDry=this._gain(1),reverbWet=this._gain(0),convolver=c.createConvolver(),convolverB=c.createConvolver(),impulseA=this._gain(1),impulseB=this._gain(0),preDelay=c.createDelay(.3),damping=c.createBiquadFilter();
    damping.type='lowpass';damping.frequency.value=10000;damping.Q.value=.5;
    reverbInput.connect(reverbDry).connect(reverbOutput);reverbInput.connect(preDelay);preDelay.connect(convolver).connect(impulseA).connect(damping);preDelay.connect(convolverB).connect(impulseB).connect(damping);damping.connect(reverbWet).connect(reverbOutput);groups.reverb={input:reverbInput,output:reverbOutput};
    const stereoInput=this._gain(),stereoOutput=this._gain(),splitter=c.createChannelSplitter(2),merger=c.createChannelMerger(2),ll=this._gain(1),rr=this._gain(1),lr=this._gain(0),rl=this._gain(0);
    stereoInput.connect(splitter);splitter.connect(ll,0);ll.connect(merger,0,0);splitter.connect(lr,0);lr.connect(merger,0,1);splitter.connect(rr,1);rr.connect(merger,0,1);splitter.connect(rl,1);rl.connect(merger,0,0);
    const panner=c.createStereoPanner();merger.connect(panner).connect(stereoOutput);groups.stereo={input:stereoInput,output:stereoOutput};
    const gain=this._gain(),preLimiter=c.createAnalyser();preLimiter.fftSize=2048;
    const limiterInput=this._gain(),limiterOutput=this._gain(),limiterDry=this._gain(0),limiterWet=this._gain(1),limiter=c.createDynamicsCompressor();
    limiter.threshold.value=-1.5;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.001;limiter.release.value=.08;
    // Compressor plus sample ceiling catches attack overshoot. Not a true-peak
    // limiter or a guarantee of safe listening levels.
    const ceiling=c.createWaveShaper();
    ceiling.curve=Float32Array.from({length:16385},(_,index)=>{const x=index/8192-1,a=Math.abs(x);return Math.sign(x)*(a<.95?a:.95+.03*Math.tanh((a-.95)/.03));});ceiling.oversample='4x';
    limiterInput.connect(limiterDry).connect(limiterOutput);limiterInput.connect(limiter).connect(ceiling).connect(limiterWet).connect(limiterOutput);
    const analyser=c.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.78;
    const output=this._gain();
    this.nodes={input,groups,tones,eq,graphic,compressor,compDry,compWet,convolver,convolverB,impulseA,impulseB,preDelay,damping,reverbDry,reverbWet,ll,rr,lr,rl,panner,gain,preLimiter,limiterInput,limiterOutput,limiter,limiterDry,limiterWet,ceiling,analyser,output};
    this._timeData=new Float32Array(analyser.fftSize);this._preTimeData=new Float32Array(preLimiter.fftSize);this._frequencyData=new Uint8Array(analyser.frequencyBinCount);
    this.source.connect(input);gain.connect(preLimiter).connect(limiterInput);limiterOutput.connect(analyser).connect(output).connect(c.destination);this._connectChain();
  }
  _connectChain(){const n=this.nodes;n.input.disconnect();for(const group of Object.values(n.groups))group.output.disconnect();let previous=n.input;for(const name of this.settings.chainOrder){previous.connect(n.groups[name].input);previous=n.groups[name].output;}previous.connect(n.gain);}
  _apply(){
    this._applySpeed();if(!this.nodes)return;
    const n=this.nodes,s=this.settings,active=!s.bypass;
    for(const name of Object.keys(n.tones))this._smooth(n.tones[name].gain,active?s.tones[name]:0);
    for(let i=0;i<n.eq.length;i++){this._smooth(n.eq[i].frequency,Math.min(s.eq[i].frequency,this.context.sampleRate*.49));this._smooth(n.eq[i].Q,s.eq[i].q);this._smooth(n.eq[i].gain,active&&s.eqMode===10?s.eq[i].gain:0);}
    for(let i=0;i<n.graphic.length;i++)this._smooth(n.graphic[i].gain,active&&s.eqMode===31?s.graphicEQ[i]:0);
    this._smooth(n.gain.gain,active?s.gain:1);this._smooth(n.panner.pan,active?s.balance:0);
    const width=active?(s.mono?0:s.width):1;
    this._smooth(n.ll.gain,(1+width)/2);this._smooth(n.rr.gain,(1+width)/2);this._smooth(n.lr.gain,(1-width)/2);this._smooth(n.rl.gain,(1-width)/2);
    const compActive=active&&s.compression.enabled;
    this._smooth(n.compDry.gain,compActive?0:1);this._smooth(n.compWet.gain,compActive?1:0);this._smooth(n.compressor.threshold,s.compression.threshold);this._smooth(n.compressor.ratio,s.compression.ratio);this._smooth(n.compressor.attack,s.compression.attack);this._smooth(n.compressor.release,s.compression.release);this._smooth(n.compressor.knee,12);
    const reverbActive=active&&s.reverb.enabled;
    this._smooth(n.reverbDry.gain,reverbActive?1-s.reverb.wet:1);this._smooth(n.reverbWet.gain,reverbActive?s.reverb.wet:0);this._smooth(n.preDelay.delayTime,s.reverb.preDelay/1000);this._smooth(n.damping.frequency,Math.min(1000+19000*(1-s.reverb.damping)**2,this.context.sampleRate*.49));this._updateImpulse();
    this._smooth(n.limiterDry.gain,s.limiter?0:1);this._smooth(n.limiterWet.gain,s.limiter?1:0);
  }
  _updateImpulse(){
    if(!this.nodes)return;
    const r=this.settings.reverb,key=`${r.decay}:${r.room}:${this.context.sampleRate}`;
    if(key===this._impulseKey)return;
    clearTimeout(this._impulseTimer);
    const commit=()=>{
      if(!this.nodes||this._disposed)return;
      const latest=this.settings.reverb,newKey=`${latest.decay}:${latest.room}:${this.context.sampleRate}`;
      if(newKey===this._impulseKey)return;
      const first=!this._impulseKey;
      const channels=createImpulseData(this.context.sampleRate,latest.decay,latest.room),buffer=this.context.createBuffer(2,channels[0].length,this.context.sampleRate);
      channels.forEach((data,index)=>buffer.getChannelData(index).set(data));
      const next=first?0:1-this._activeImpulse;
      this.nodes[next?'convolverB':'convolver'].buffer=buffer;
      this._smooth(this.nodes.impulseA.gain,next?0:1,.018);this._smooth(this.nodes.impulseB.gain,next?1:0,.018);
      this._activeImpulse=next;this._impulseKey=newKey;this._impulseTimer=null;
    };
    // Coalesce room/decay slider changes. Dual convolvers fade between impulses
    // instead of cutting off the previous reverb tail with an abrupt buffer swap.
    if(!this._impulseKey||this.context.startRendering)commit();else this._impulseTimer=setTimeout(commit,90);
  }
  _applySpeed(){if(!this.audio)return;this.audio.playbackRate=this.settings.speed;this.audio.preservesPitch=this.settings.preservePitch;if('webkitPreservesPitch'in this.audio)this.audio.webkitPreservesPitch=this.settings.preservePitch;}
  setTone(name,value){if(!Object.hasOwn(this.settings.tones,name))return;this.settings.tones[name]=clamp(value,-12,12,0);if(this.nodes)this._smooth(this.nodes.tones[name].gain,this.settings.bypass?0:this.settings.tones[name]);}
  setEQ(index,band={}){if(!Number.isInteger(index)||index<0||index>=10||!band||typeof band!=='object')return;this.settings.eq[index]=normalizeAudioSettings({eq:this.settings.eq.map((value,i)=>i===index?{...value,...band}:value)}).eq[index];this._apply();}
  setEQMode(mode){this.settings.eqMode=Number(mode)===31?31:10;this._apply();}
  setGraphicEQ(index,gain){if(Number.isInteger(index)&&index>=0&&index<31){this.settings.graphicEQ[index]=clamp(gain,-12,12,0);this._apply();}}
  setGain(value){this.settings.gain=clamp(value,0,2,1);if(this.nodes)this._smooth(this.nodes.gain.gain,this.settings.bypass?1:this.settings.gain);}
  setBalance(value){this.settings.balance=clamp(value,-1,1,0);this._apply();}
  setMono(value){this.settings.mono=value===true;this._apply();}
  setWidth(value){this.settings.width=clamp(value,0,2,1);this._apply();}
  setLimiter(value){this.settings.limiter=value!==false;this._apply();}
  setCompression(value={}){this.settings.compression=normalizeAudioSettings({compression:{...this.settings.compression,...value}}).compression;this._apply();}
  setReverb(value={}){this.settings.reverb=normalizeAudioSettings({reverb:{...this.settings.reverb,...value}}).reverb;this._apply();}
  setBypass(value){this.settings.bypass=value===true;this._apply();}
  setSpeed(value,preservePitch=this.settings.preservePitch){this.settings.speed=clamp(value,.5,2,1);this.settings.preservePitch=preservePitch!==false;this._applySpeed();}
  setChainOrder(order){this.settings.chainOrder=validateChainOrder(order);if(!this.nodes)return;clearTimeout(this._rewireTimer);this._smooth(this.nodes.output.gain,0,.005);this._rewireTimer=setTimeout(()=>{if(!this.nodes||this._disposed)return;this._connectChain();this._smooth(this.nodes.output.gain,1,.008);this._rewireTimer=null;},45);}
  applySettings(input={}){const oldOrder=this.settings.chainOrder.join(',');const merged={...this.settings,...input,tones:{...this.settings.tones,...input?.tones},compression:{...this.settings.compression,...input?.compression},reverb:{...this.settings.reverb,...input?.reverb},visualizer:{...this.settings.visualizer,...input?.visualizer}};this.settings=normalizeAudioSettings(merged);this._apply();if(oldOrder!==this.settings.chainOrder.join(','))this.setChainOrder(this.settings.chainOrder);return this.exportSettings();}
  reset(){const oldOrder=this.settings.chainOrder.join(',');this.settings=createDefaultSettings();this._apply();if(oldOrder!==this.settings.chainOrder.join(','))this.setChainOrder(this.settings.chainOrder);return this.exportSettings();}
  exportSettings(){return JSON.parse(JSON.stringify(this.settings));}
  getSpectrum(target){if(!this.nodes)return target instanceof Uint8Array?(target.fill(0),target):new Uint8Array(1024);const buffer=target instanceof Uint8Array?target:this._frequencyData;this.nodes.analyser.getByteFrequencyData(buffer);return buffer;}
  getMeter(){
    if(!this.nodes)return{...this._meter};this.nodes.analyser.getFloatTimeDomainData(this._timeData);this.nodes.preLimiter.getFloatTimeDomainData(this._preTimeData);let peak=0,inputPeak=0,squares=0;
    for(let i=0;i<this._timeData.length;i++){const sample=this._timeData[i];peak=Math.max(peak,Math.abs(sample));squares+=sample*sample;}for(const sample of this._preTimeData)inputPeak=Math.max(inputPeak,Math.abs(sample));
    if(inputPeak>=.999||peak>=.999)this._lastClip=this.context.currentTime+.35;this._meter={peak,inputPeak,rms:Math.sqrt(squares/this._timeData.length),clipping:this.context.currentTime<this._lastClip,reduction:this.settings.limiter?this.nodes.limiter.reduction:0};return{...this._meter};
  }
  async suspend(){if(this.context&&!this.context.startRendering&&this.context.state==='running')await this.context.suspend();}
  async dispose(){clearTimeout(this._rewireTimer);clearTimeout(this._impulseTimer);this._disposed=true;try{this.source?.disconnect();}catch{}if(this.context&&!this.context.startRendering&&this.context.state!=='closed')await this.context.close();this.nodes=null;this.initialized=false;}
}




