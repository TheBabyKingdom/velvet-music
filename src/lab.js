import {createDefaultSettings,EQ_FREQUENCIES,GRAPHIC_FREQUENCIES,TONE_CONTROLS} from './audio-engine.js';
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const checked=value=>value?' checked':'';
const selected=(a,b)=>a===b?' selected':'';
const signed=value=>`${number(value)>0?'+':''}${number(value).toFixed(1)} dB`;
const frequencyLabel=value=>value>=1000?`${Number((value/1000).toFixed(1))}k`:`${value}`;
const EFFECT_LABELS={tone:'Tone',eq:'Equaliser',compression:'Compression',reverb:'Reverb',stereo:'Stereo'};
const PRESETS={
  'Flat':()=>createDefaultSettings(),
  'Bass Boost':()=>({...createDefaultSettings(),tones:{subbass:4,bass:5,warmth:1,mids:0,clarity:0,treble:1}}),
  'Vocal Focus':()=>({...createDefaultSettings(),tones:{subbass:-2,bass:-2,warmth:-1,mids:2,clarity:4,treble:1},compression:{enabled:true,threshold:-24,ratio:2.5,attack:.01,release:.25}}),
  'Podcast':()=>({...createDefaultSettings(),tones:{subbass:-4,bass:-2,warmth:-1,mids:3,clarity:3,treble:-1},compression:{enabled:true,threshold:-24,ratio:4,attack:.006,release:.2}}),
  'Night Listening':()=>({...createDefaultSettings(),tones:{subbass:-3,bass:-2,warmth:0,mids:1,clarity:1,treble:-1},compression:{enabled:true,threshold:-30,ratio:7,attack:.005,release:.3}}),
};

export function createAudioLab({engine,onChange=()=>{},toast=()=>{}}){
  let activePreset='Custom',frame=0,idleTimer=0,visibilityBound=false,draggedEffect=null;
  let visual={style:'bars',color:'#d4b7ff',sensitivity:1};
  const root=()=>document.getElementById('audio-lab');
  const output=(id,text)=>{const element=document.getElementById(id);if(element)element.textContent=text;};
  const notify=()=>{try{const result=onChange();if(result?.catch)result.catch(error=>toast(error.message||'Could not save audio settings.'));}catch(error){toast(error.message||'Could not save audio settings.');}};
  const visualSettings=()=>({...visual,...engine.settings.visualizer});
  function rangeRow({label,description='',audio,key='',value,min,max,step=1,display,id=''}){
    const controlId=id||`lab-${audio}-${key||'value'}`;
    return `<label class="settings-row"><span>${escapeHTML(label)}${description?`<small>${escapeHTML(description)}</small>`:''}</span><span class="right"><input id="${controlId}" type="range" min="${min}" max="${max}" step="${step}" value="${number(value)}" data-audio="${audio}" data-key="${key}" data-output="${controlId}-output" aria-label="${escapeHTML(label)}"><output id="${controlId}-output">${escapeHTML(display??value)}</output></span></label>`;
  }
  function toggleRow(label,description,audio,value,key=''){
    return `<label class="settings-row"><span>${escapeHTML(label)}<small>${escapeHTML(description)}</small></span><input type="checkbox" data-audio="${audio}" data-key="${key}"${checked(value)} aria-label="${escapeHTML(label)}"></label>`;
  }
  function signalChain(){
    const s=engine.settings;
    return `<div class="signal-chain" aria-label="Audio effect chain">${s.chainOrder.map((name,index)=>`<div class="signal-node" draggable="true" data-effect="${name}" title="Drag to reorder ${EFFECT_LABELS[name]}"><span aria-hidden="true">⠿</span><span>${EFFECT_LABELS[name]}</span>${['compression','reverb'].includes(name)?`<button class="text-button" data-action="audio-toggle-effect" data-effect="${name}" aria-label="${s[name].enabled?'Bypass':'Enable'} ${EFFECT_LABELS[name]}">${s[name].enabled?'On':'Bypassed'}</button>`:''}<button class="text-button" data-action="audio-chain-move" data-effect="${name}" data-direction="-1" aria-label="Move ${EFFECT_LABELS[name]} earlier"${index===0?' disabled':''}>←</button><button class="text-button" data-action="audio-chain-move" data-effect="${name}" data-direction="1" aria-label="Move ${EFFECT_LABELS[name]} later"${index===s.chainOrder.length-1?' disabled':''}>→</button></div>`).join('')}<span class="signal-node fixed">Gain</span><span class="signal-node fixed">${s.limiter?'Protective limiter':'Limiter off'}</span><span class="signal-node fixed">Output</span></div>`;
  }
  function equalizer(){
    const s=engine.settings;
    const bands=s.eqMode===31?GRAPHIC_FREQUENCIES.map((frequency,index)=>`<div class="eq-band"><output id="lab-graphic-${index}-output">${signed(s.graphicEQ[index])}</output><input type="range" min="-12" max="12" step=".5" value="${s.graphicEQ[index]}" data-audio="graphicEQ" data-index="${index}" data-output="lab-graphic-${index}-output" aria-label="${frequency} Hz graphic equaliser gain"><small>${frequencyLabel(frequency)} Hz</small></div>`).join(''):s.eq.map((band,index)=>`<div class="eq-band"><output id="lab-eq-${index}-output">${signed(band.gain)}</output><input type="range" min="-12" max="12" step=".5" value="${band.gain}" data-audio="eqGain" data-index="${index}" data-output="lab-eq-${index}-output" aria-label="Band ${index+1} equaliser gain"><label><small>Hz</small><input type="number" min="20" max="20000" step="1" value="${band.frequency}" data-audio="eqFrequency" data-index="${index}" aria-label="Band ${index+1} frequency in Hz"></label><label><small>Q</small><input type="number" min=".1" max="18" step=".1" value="${band.q}" data-audio="eqQ" data-index="${index}" aria-label="Band ${index+1} Q bandwidth"></label></div>`).join('');
    return `<div class="panel-header"><div><h3>${s.eqMode===31?'31-band graphic':'10-band parametric'} equaliser</h3><small>${s.eqMode===31?'Third-octave bands · fixed Q 4.318':'Fine-tune each band’s frequency, gain, and bandwidth.'}</small></div><div class="row-actions"><select data-audio="eqMode" aria-label="Equaliser mode"><option value="10"${selected(s.eqMode,10)}>10-band parametric</option><option value="31"${selected(s.eqMode,31)}>31-band graphic</option></select><button class="text-button" data-action="audio-reset-eq">Reset EQ</button></div></div><div class="eq-bands">${bands}</div><small>Lower Q affects a wider range of frequencies. Only the selected equaliser is active.</small>`;
  }
  function render(){
    const s=engine.settings,v=visualSettings();
    return `<div id="audio-lab"><div class="page-heading"><div><span class="eyebrow">MAKE IT SOUND LIKE YOU</span><h1>Audio Lab<span style="color:var(--accent)">.</span></h1><p>Real effects. Your sound, shaped your way.</p></div><div class="row-actions"><button class="button secondary" data-action="audio-bypass" aria-pressed="${s.bypass}">${s.bypass?'B · Original':'A · Processed'}</button><button class="button secondary" data-action="audio-reset">Reset all</button></div></div>
+      <section class="panel"><div class="panel-header"><div><h3>Your signal, in motion</h3><small id="lab-analysis-status">${engine.initialized?'Local audio analysis':'Play a local track to start analysis'}</small></div><span class="source-badge local">AUDIO ENGINE · WORKING</span></div><canvas id="lab-spectrum" class="lab-visual" role="img" aria-label="Live frequency spectrum of processed local audio"></canvas><div class="meter-row"><span>OUTPUT</span><span class="meter-track"><i id="lab-level-meter"></i></span><output id="lab-level-label">−∞ dBFS</output><span class="clip" id="lab-clip" aria-live="polite">No overload</span></div><div id="lab-chain">${signalChain()}</div><small>Drag the effects or use their arrows. Gain and the protective limiter stay at the end.</small><div class="filter-row"><label class="subtle">Style <select data-audio="visualStyle" aria-label="Spectrum style"><option value="bars"${selected(v.style,'bars')}>Bars</option><option value="line"${selected(v.style,'line')}>Flowing line</option><option value="mirror"${selected(v.style,'mirror')}>Mirror</option></select></label><label class="subtle">Colour <input type="color" value="${escapeHTML(v.color)}" data-audio="visualColor" aria-label="Spectrum colour"></label><label class="subtle">Sensitivity <input type="range" min=".5" max="2.5" step=".1" value="${v.sensitivity}" data-audio="visualSensitivity" aria-label="Spectrum sensitivity"></label></div></section>
+      <section class="panel"><div class="panel-header"><h3>Find your starting point</h3><span class="subtle" id="lab-preset-label">${escapeHTML(activePreset)}</span></div><div class="chips">${Object.keys(PRESETS).map(name=>`<button class="chip${activePreset===name?' active':''}" data-action="audio-preset" data-preset="${name}">${name}</button>`).join('')}</div><small>A/B compares your processing with the original. The limiter stays on during comparison if enabled.</small></section>
+      <section class="panel"><div class="panel-header"><div><h3>A little more feeling</h3><small>Six tone controls, applied to the actual local audio.</small></div><button class="text-button" data-action="audio-reset-tones">Reset tones</button></div><div class="tone-grid">${Object.entries(TONE_CONTROLS).map(([name,definition])=>`<div class="tone-control"><div><label for="lab-tone-${name}">${definition.label}</label><output id="lab-tone-${name}-output">${signed(s.tones[name])}</output></div><input id="lab-tone-${name}" type="range" min="-12" max="12" step=".5" value="${s.tones[name]}" data-audio="tone" data-key="${name}" data-output="lab-tone-${name}-output"><small>${definition.description}</small><button class="reset-control" data-action="audio-reset-tone" data-key="${name}" aria-label="Reset ${definition.label}">↺ Reset</button></div>`).join('')}</div></section>
+      <section class="panel" id="lab-equalizer">${equalizer()}</section>
+      <div class="two-col"><section class="panel"><div class="panel-header"><h3>Output & stereo</h3><span class="source-badge">DEFAULT PROFILE</span></div>${rangeRow({label:'Software gain',description:'100% is unity gain. 200% doubles amplitude, not perceived loudness.',audio:'gain',value:s.gain*100,min:0,max:200,display:`${Math.round(s.gain*100)}%`})}${toggleRow('Protective limiter','A compressor and sample ceiling reduce output overload.','limiter',s.limiter)}${rangeRow({label:'Balance',description:'Position the stereo image between left and right.',audio:'balance',value:s.balance,min:-1,max:1,step:.01,display:s.balance===0?'Centre':`${Math.round(Math.abs(s.balance)*100)}% ${s.balance<0?'L':'R'}`})}${rangeRow({label:'Stereo width',description:'0% is mono, 100% original, 200% widens the side signal.',audio:'width',value:s.width*100,min:0,max:200,display:`${Math.round(s.width*100)}%`})}${toggleRow('Mono','Combine both channels. Overrides the width control.','mono',s.mono)}<div class="notice">Boosted gain can distort audio and increase hearing risk. A limiter does not make high listening levels safe. Start with a low device volume.</div></section>
+      <section class="panel"><div class="panel-header"><h3>Playback character</h3></div>${rangeRow({label:'Playback speed',audio:'speed',value:s.speed,min:.5,max:2,step:.05,display:`${s.speed.toFixed(2)}×`})}${toggleRow('Preserve pitch','Use the playback engine’s native pitch preservation when changing speed.','preservePitch',s.preservePitch)}<div class="notice">Effects, EQ, analysis, and gain work with local audio and public Audius streams. Spotify, YouTube Music, and SoundCloud account streaming is not connected. Protected or embedded playback cannot pass through this audio chain.</div><small>Independent pitch shifting, measured loudness normalisation, and per-device audio profiles are planned.</small></section></div>
+      <div class="two-col"><section class="panel"><div class="panel-header"><div><h3>Space & atmosphere</h3><small>Real stereo convolution reverb.</small></div><button class="text-button" data-action="audio-reset-reverb">Reset</button></div>${toggleRow('Reverb','Blend a generated room impulse into the dry signal.','reverb',s.reverb.enabled,'enabled')}${rangeRow({label:'Wet / dry',audio:'reverb',key:'wet',value:s.reverb.wet,min:0,max:1,step:.01,display:`${Math.round(s.reverb.wet*100)}% wet`})}${rangeRow({label:'Room size',audio:'reverb',key:'room',value:s.reverb.room,min:0,max:1,step:.01,display:`${Math.round(s.reverb.room*100)}%`})}${rangeRow({label:'Decay',audio:'reverb',key:'decay',value:s.reverb.decay,min:.1,max:8,step:.1,display:`${s.reverb.decay.toFixed(1)} s`})}${rangeRow({label:'Damping',description:'Higher values soften the high-frequency reverb tail.',audio:'reverb',key:'damping',value:s.reverb.damping,min:0,max:1,step:.01,display:`${Math.round(s.reverb.damping*100)}%`})}${rangeRow({label:'Pre-delay',audio:'reverb',key:'preDelay',value:s.reverb.preDelay,min:0,max:250,step:1,display:`${s.reverb.preDelay} ms`})}</section>
+      <section class="panel"><div class="panel-header"><div><h3>Dynamics & detail</h3><small>Control the difference between loud and quiet moments.</small></div><button class="text-button" data-action="audio-reset-compression">Reset</button></div>${toggleRow('Compression','A separate compressor before the final protective limiter.','compression',s.compression.enabled,'enabled')}${rangeRow({label:'Threshold',audio:'compression',key:'threshold',value:s.compression.threshold,min:-60,max:0,step:1,display:`${s.compression.threshold} dB`})}${rangeRow({label:'Ratio',audio:'compression',key:'ratio',value:s.compression.ratio,min:1,max:20,step:.5,display:`${s.compression.ratio}:1`})}${rangeRow({label:'Attack',audio:'compression',key:'attack',value:s.compression.attack*1000,min:1,max:1000,step:1,display:`${Math.round(s.compression.attack*1000)} ms`})}${rangeRow({label:'Release',audio:'compression',key:'release',value:s.compression.release*1000,min:10,max:1000,step:5,display:`${Math.round(s.compression.release*1000)} ms`})}</section></div></div>`.replace(/^\+/gm,'');
  }
  function refresh(){
    const current=root();if(!current)return;
    stopVisualization();const holder=document.createElement('div');holder.innerHTML=render();current.replaceWith(holder.firstElementChild);afterRender();
  }
  function markCustom(){activePreset='Custom';output('lab-preset-label','Custom');root()?.querySelectorAll('[data-action="audio-preset"]').forEach(button=>button.classList.remove('active'));}
  function updateChain(){const chain=document.getElementById('lab-chain');if(chain)chain.innerHTML=signalChain();bindDrag();}
  function displayFor(target){
    const s=engine.settings,key=target.dataset.key,type=target.dataset.audio,value=number(target.value);
    if(type==='tone'||type==='eqGain'||type==='graphicEQ')return signed(value);
    if(type==='gain'||type==='width')return `${Math.round(value)}%`;
    if(type==='balance')return value===0?'Centre':`${Math.round(Math.abs(value)*100)}% ${value<0?'L':'R'}`;
    if(type==='speed')return `${value.toFixed(2)}×`;
    if(type==='compression')return key==='ratio'?`${s.compression.ratio}:1`:key==='threshold'?`${s.compression.threshold} dB`:`${value} ms`;
    if(type==='reverb')return key==='decay'?`${value.toFixed(1)} s`:key==='preDelay'?`${value} ms`:`${Math.round(value*100)}%${key==='wet'?' wet':''}`;
    return String(value);
  }
  function handleInput(target){
    if(!target?.dataset?.audio)return false;
    const type=target.dataset.audio,key=target.dataset.key,index=Number(target.dataset.index),value=Number(target.value),bool=target.checked;
    if(target.type==='number'&&(target.value===''||!target.validity.valid))return true;
    if(type.startsWith('visual')){
      const v=visualSettings();if(type==='visualStyle')v.style=target.value;if(type==='visualColor')v.color=target.value;if(type==='visualSensitivity')v.sensitivity=value;
      visual=v;engine.applySettings({visualizer:v});notify();return true;
    }
    if(type==='tone')engine.setTone(key,value);
    else if(type==='gain')engine.setGain(value/100);
    else if(type==='balance')engine.setBalance(value);
    else if(type==='width')engine.setWidth(value/100);
    else if(type==='mono')engine.setMono(bool);
    else if(type==='limiter'){engine.setLimiter(bool);updateChain();}
    else if(type==='speed')engine.setSpeed(value,engine.settings.preservePitch);
    else if(type==='preservePitch')engine.setSpeed(engine.settings.speed,bool);
    else if(type==='eqMode'){engine.setEQMode(value);document.getElementById('lab-equalizer').innerHTML=equalizer();}
    else if(type==='eqGain')engine.setEQ(index,{gain:value});
    else if(type==='eqFrequency')engine.setEQ(index,{frequency:value});
    else if(type==='eqQ')engine.setEQ(index,{q:value});
    else if(type==='graphicEQ')engine.setGraphicEQ(index,value);
    else if(type==='reverb'){engine.setReverb({[key]:key==='enabled'?bool:value});if(key==='enabled')updateChain();}
    else if(type==='compression'){engine.setCompression({[key]:key==='enabled'?bool:['attack','release'].includes(key)?value/1000:value});if(key==='enabled')updateChain();}
    else return false;
    if(target.dataset.output)output(target.dataset.output,displayFor(target));markCustom();notify();return true;
  }
  function handleAction(action,button){
    if(!action?.startsWith('audio-'))return false;
    if(action==='audio-preset'){
      const name=button.dataset.preset;if(!PRESETS[name])return false;
      const visualizer=visualSettings();engine.applySettings({...PRESETS[name](),visualizer});activePreset=name;notify();refresh();toast(`${name} applied`);return true;
    }
    if(action==='audio-bypass'){engine.setBypass(!engine.settings.bypass);notify();refresh();return true;}
    if(action==='audio-reset'){engine.reset();activePreset='Flat';notify();refresh();toast('Audio settings reset');return true;}
    if(action==='audio-reset-tone'){engine.setTone(button.dataset.key,0);markCustom();notify();refresh();return true;}
    if(action==='audio-reset-tones'){for(const name of Object.keys(TONE_CONTROLS))engine.setTone(name,0);markCustom();notify();refresh();return true;}
    if(action==='audio-reset-eq'){const settings=createDefaultSettings();engine.applySettings({eq:settings.eq,graphicEQ:settings.graphicEQ});markCustom();notify();document.getElementById('lab-equalizer').innerHTML=equalizer();return true;}
    if(action==='audio-reset-reverb'){engine.setReverb(createDefaultSettings().reverb);markCustom();notify();refresh();return true;}
    if(action==='audio-reset-compression'){engine.setCompression(createDefaultSettings().compression);markCustom();notify();refresh();return true;}
    if(action==='audio-toggle-effect'){const name=button.dataset.effect;if(!['reverb','compression'].includes(name))return false;if(name==='reverb')engine.setReverb({enabled:!engine.settings.reverb.enabled});else engine.setCompression({enabled:!engine.settings.compression.enabled});markCustom();notify();refresh();return true;}
    if(action==='audio-chain-move'){const order=[...engine.settings.chainOrder],index=order.indexOf(button.dataset.effect),next=index+Number(button.dataset.direction);if(index<0||next<0||next>=order.length)return true;[order[index],order[next]]=[order[next],order[index]];engine.setChainOrder(order);markCustom();notify();updateChain();return true;}
    return false;
  }
  function bindDrag(){
    root()?.querySelectorAll('.signal-node[data-effect]').forEach(node=>{
      node.ondragstart=event=>{draggedEffect=node.dataset.effect;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',draggedEffect);};
      node.ondragover=event=>{if(draggedEffect){event.preventDefault();event.dataTransfer.dropEffect='move';}};
      node.ondrop=event=>{event.preventDefault();const target=node.dataset.effect,order=[...engine.settings.chainOrder],from=order.indexOf(draggedEffect),to=order.indexOf(target);if(from>=0&&to>=0&&from!==to){order.splice(from,1);order.splice(to,0,draggedEffect);engine.setChainOrder(order);markCustom();notify();updateChain();}draggedEffect=null;};
      node.ondragend=()=>{draggedEffect=null;};
    });
  }
  function draw(){
    const canvas=document.getElementById('lab-spectrum');if(!canvas||!root()||document.hidden){frame=0;return;}
    const context=canvas.getContext('2d');if(!context){frame=0;return;}
    const ratio=Math.min(2,window.devicePixelRatio||1),width=Math.max(10,canvas.clientWidth),height=Math.max(10,canvas.clientHeight);
    if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio)){canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);}
    context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,width,height);
    const v=visualSettings(),isPlaying=v.enabled!==false&&engine.initialized&&!engine.audio?.paused;
    context.strokeStyle='rgba(150,150,160,.1)';context.lineWidth=1;
    for(let row=1;row<4;row++){context.beginPath();context.moveTo(0,height*row/4);context.lineTo(width,height*row/4);context.stroke();}
    if(isPlaying){
      const spectrum=engine.getSpectrum(),count=64,gap=3,barWidth=Math.max(1,(width-gap*(count-1))/count),values=[];
      for(let index=0;index<count;index++){
        const bin=Math.min(spectrum.length-1,Math.round((Math.exp(index/(count-1)*Math.log(spectrum.length))-1)));
        values.push(Math.min(1,(spectrum[bin]/255)*v.sensitivity));
      }
      context.fillStyle=v.color;context.strokeStyle=v.color;context.lineWidth=2;
      if(v.style==='line'){
        context.beginPath();values.forEach((value,index)=>{const x=index/(count-1)*width,y=height-8-value*(height-18);if(index===0)context.moveTo(x,y);else context.lineTo(x,y);});context.stroke();
      }else values.forEach((value,index)=>{const barHeight=Math.max(1,value*(height-14));context.globalAlpha=.35+value*.65;const y=v.style==='mirror'?(height-barHeight)/2:height-barHeight-4;context.fillRect(index*(barWidth+gap),y,barWidth,barHeight);});
      context.globalAlpha=1;
      const meter=engine.getMeter(),db=meter.peak>0?20*Math.log10(meter.peak):-Infinity;
      const fill=document.getElementById('lab-level-meter');if(fill)fill.style.width=`${Math.min(100,Math.max(0,(db+60)/60*100))}%`;
      output('lab-level-label',Number.isFinite(db)?`${db.toFixed(1)} dBFS`:'−∞ dBFS');
      const clip=document.getElementById('lab-clip');if(clip){clip.classList.toggle('active',meter.clipping);clip.textContent=meter.clipping?(engine.settings.limiter?'Overload · limiter active':'Overload · lower gain'):'No overload';}
      output('lab-analysis-status',engine.settings.bypass?'Original signal · limiter setting retained':'Live spectrum · processed local audio');
    }else{
      context.strokeStyle=v.color;context.globalAlpha=.35;context.beginPath();context.moveTo(0,height-8);context.lineTo(width,height-8);context.stroke();context.globalAlpha=1;
      context.fillStyle=getComputedStyle(canvas).color;context.globalAlpha=.5;context.font='11px Segoe UI, sans-serif';context.textAlign='center';context.fillText(v.enabled===false?'Visualiser disabled in Extensions':engine.initialized?'Playback is paused':'Play a local track to see its real spectrum',width/2,height/2);context.globalAlpha=1;
      const fill=document.getElementById('lab-level-meter');if(fill)fill.style.width='0%';output('lab-level-label','−∞ dBFS');output('lab-analysis-status',v.enabled===false?'Analysis disabled · enable in Extensions':engine.initialized?'Analysis idle · playback paused':'Local audio analysis · waiting for playback');
      const clip=document.getElementById('lab-clip');if(clip){clip.classList.remove('active');clip.textContent='No overload';}
    }
    if(isPlaying)frame=requestAnimationFrame(draw);else{frame=0;idleTimer=setTimeout(()=>{idleTimer=0;if(root()&&!document.hidden)frame=requestAnimationFrame(draw);},250);}
  }
  function visibilityChanged(){if(document.hidden){if(frame)cancelAnimationFrame(frame);clearTimeout(idleTimer);idleTimer=0;frame=0;}else if(root()&&!frame){clearTimeout(idleTimer);idleTimer=0;frame=requestAnimationFrame(draw);}}
  function afterRender(){
    if(!root())return;
    if(frame)cancelAnimationFrame(frame);clearTimeout(idleTimer);idleTimer=0;frame=0;bindDrag();
    if(!visibilityBound){document.addEventListener('visibilitychange',visibilityChanged);visibilityBound=true;}
    if(!document.hidden)frame=requestAnimationFrame(draw);
  }
  function stopVisualization(){if(frame)cancelAnimationFrame(frame);clearTimeout(idleTimer);idleTimer=0;frame=0;if(visibilityBound){document.removeEventListener('visibilitychange',visibilityChanged);visibilityBound=false;}draggedEffect=null;}
  return{render,handleInput,handleAction,afterRender,stopVisualization};
}



