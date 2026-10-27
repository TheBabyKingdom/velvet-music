import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioEngine} from '../src/audio-engine.js';
import {createAudioLab} from '../src/lab.js';

test('Audio Lab exposes real local controls and honest provider/pitch limitations',()=>{
  const lab=createAudioLab({engine:new AudioEngine({})});const html=lab.render();
  assert.ok(html.includes('10-band parametric'));assert.ok(html.includes('31-band graphic'));
  assert.ok(html.includes('Bass Boost'));assert.ok(html.includes('Night Listening'));
  assert.ok(html.includes('Protected or embedded playback cannot pass through this audio chain'));
  assert.ok(html.includes('Independent pitch shifting'));
  assert.equal((html.match(/data-audio="tone"/g)||[]).length,6);
  assert.equal((html.match(/data-audio="eqGain"/g)||[]).length,10);
  assert.ok(!html.includes('onclick='));assert.ok(!html.includes('<script'));
});

test('Audio Lab routes sliders and presets to validated engine settings with persistence',()=>{
  const previous=globalThis.document;
  globalThis.document={getElementById:()=>null};
  try{
    const engine=new AudioEngine({});let changes=0;const lab=createAudioLab({engine,onChange:()=>changes++});
    const input=(audio,value,key='',extra={})=>lab.handleInput({dataset:{audio,key,...extra},value:String(value),checked:value===true,type:'range'});
    input('tone',5,'bass');assert.equal(engine.settings.tones.bass,5);
    input('gain',175);assert.equal(engine.settings.gain,1.75);
    input('width',150);assert.equal(engine.settings.width,1.5);
    input('compression',25,'attack');assert.equal(engine.settings.compression.attack,.025);
    input('compression',250,'release');assert.equal(engine.settings.compression.release,.25);
    input('reverb',.7,'wet');assert.equal(engine.settings.reverb.wet,.7);
    input('eqGain',3,'',{index:'2'});assert.equal(engine.settings.eq[2].gain,3);
    input('eqQ',2.5,'',{index:'2'});assert.equal(engine.settings.eq[2].q,2.5);
    input('speed',1.25);assert.equal(engine.settings.speed,1.25);
    input('preservePitch',false);assert.equal(engine.settings.preservePitch,false);
    input('visualStyle','mirror');assert.equal(engine.exportSettings().visualizer.style,'mirror');
    input('visualColor','#aabbcc');assert.equal(engine.exportSettings().visualizer.color,'#aabbcc');
    input('limiter',false);assert.equal(engine.settings.limiter,false);
    assert.equal(lab.handleAction('audio-preset',{dataset:{preset:'Podcast'}}),true);
    assert.equal(engine.settings.tones.clarity,3);assert.equal(engine.settings.compression.enabled,true);assert.equal(engine.settings.limiter,true);
    lab.handleAction('audio-bypass',{});assert.equal(engine.settings.bypass,true);assert.equal(engine.settings.limiter,true);
    lab.handleAction('audio-reset',{});assert.equal(engine.settings.bypass,false);assert.equal(engine.settings.tones.clarity,0);
    assert.ok(changes>10,'each adjustment should request settings persistence');
    assert.equal(lab.handleInput({dataset:{}}),false);assert.equal(lab.handleAction('unrelated',{}),false);
  }finally{globalThis.document=previous;}
});
