/** Reproducible original Velvet assets. No downloads, dependencies or copyrighted samples. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'assets');
const demo = path.join(assets, 'demo');
fs.mkdirSync(demo, { recursive: true });
const RATE = 22050, SECONDS = 48, TAU = Math.PI * 2;
const midi = note => 440 * 2 ** ((note - 69) / 12);
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const fract = x => x - Math.floor(x);
const songs = [
  { id: 'demo-blue-hour', slug: 'blue-hour', title: 'Blue Hour', bpm: 80, seed: 4321, colors: ['#e2a8c4', '#6b63b3', '#192b56'], chords: [[50,57,61,66,76], [47,54,57,62,69], [43,50,54,59,69], [45,52,57,59,64]] },
  { id: 'demo-glasshouse', slug: 'glasshouse', title: 'Glasshouse', bpm: 100, seed: 6618, colors: ['#d7e8b9', '#7aafa1', '#194f53'], chords: [[41,48,52,57,64], [45,52,55,60,67], [48,55,59,64,71], [40,47,50,55,62]] },
  { id: 'demo-orbit', slug: 'orbit', title: 'Orbit', bpm: 120, seed: 9801, colors: ['#f6b46e', '#cd7889', '#513b83'], chords: [[48,55,58,63,74], [44,51,55,60,67], [51,58,62,67,74], [46,53,58,60,65]] },
];
function writeSong(song) {
  const count = RATE * SECONDS, buffer = Buffer.alloc(44 + count * 4);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(RATE, 24); buffer.writeUInt32LE(RATE * 4, 28); buffer.writeUInt16LE(4, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(count * 4, 40);
  const chords = song.chords.map(notes => notes.map(midi));
  const beatLength = 60 / song.bpm;
  let rng = song.seed, lastNoise = 0;
  for (let i = 0; i < count; i++) {
    const t = i / RATE, ci = Math.floor(t / 12) % 4, age = t % 12;
    const previous = (ci + 3) % 4, blend = smooth(age / 1.8);
    let left = 0, right = 0;
    for (let voice = 0; voice < 5; voice++) {
      const phase = voice * .47;
      const tone = (f, channel) => {
        const drift = channel ? 1.0011 : .9989;
        const lfo = 1 + .0003 * Math.sin(t * .7 + phase);
        return Math.sin(TAU * f * drift * lfo * t + phase) + .18 * Math.sin(TAU * f * 2 * drift * t + phase) + .055 * Math.sin(TAU * f * 3 * t);
      };
      const weight = voice === 0 ? .018 : .013;
      for (let channel = 0; channel < 2; channel++) {
        const pad = (tone(chords[ci][voice], channel) * blend + tone(chords[previous][voice], channel) * (1 - blend)) * weight;
        if (channel) right += pad; else left += pad;
      }
    }
    const beat = t / beatLength, beatAge = fract(beat) * beatLength;
    const bassFreq = chords[ci][0] / 2, bassEnvelope = .64 + .36 * Math.exp(-beatAge * 5);
    const bass = (Math.sin(TAU * bassFreq * t) + .13 * Math.sin(TAU * bassFreq * 2 * t)) * .055 * bassEnvelope;
    const kick = Math.sin(TAU * (42 * beatAge + 1.8 * (1 - Math.exp(-beatAge * 32)))) * Math.exp(-beatAge * 15) * .1;
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    const noise = rng / 2147483648 - 1, highNoise = noise - lastNoise; lastNoise = noise;
    const hatAge = fract(beat * 2) * beatLength / 2;
    const hats = highNoise * Math.exp(-hatAge * 90) * (Math.floor(beat * 2) % 2 ? .008 : .012);
    const snareAge = fract((beat + 1) / 2) * beatLength * 2;
    const snare = highNoise * Math.exp(-snareAge * 28) * .018;
    const arpAt = time => {
      if (time < 0) return 0;
      const tick = time / (beatLength / 2), tickAge = fract(tick) * beatLength / 2;
      const index = Math.floor(tick) % 8, note = [1, 3, 2, 4, 2, 3, 1, 4][index];
      const freq = chords[Math.floor(time / 12) % 4][note] * 2;
      const attack = smooth(tickAge / .012), decay = Math.exp(-tickAge * 8);
      return (Math.sin(TAU * freq * tickAge) + .16 * Math.sin(TAU * freq * 2 * tickAge)) * attack * decay * .018;
    };
    const arp = arpAt(t), delayL = arpAt(t - beatLength * .75) * .35, delayR = arpAt(t - beatLength * 1.5) * .25;
    const fade = smooth(t / 1.6) * smooth((SECONDS - t) / 2.8);
    left = Math.tanh((left + bass + kick + hats + snare + arp + delayL) * 1.2) * 2.075 * fade;
    right = Math.tanh((right + bass + kick + hats + snare + arp + delayR) * 1.2) * 2.075 * fade;
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left)) * 32767), 44 + i * 4);
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right)) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(path.join(demo, song.slug + '.wav'), buffer);
  const [a,b,c] = song.colors;
  const cover = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${c}"/><stop offset="1" stop-color="${b}"/></linearGradient><radialGradient id="light"><stop stop-color="${a}" stop-opacity=".9"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></radialGradient><filter id="blur"><feGaussianBlur stdDeviation="32"/></filter><linearGradient id="glass" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".4"/><stop offset=".5" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#fff" stop-opacity=".2"/></linearGradient></defs><rect width="800" height="800" fill="url(#bg)"/><circle cx="560" cy="225" r="380" fill="url(#light)"/><ellipse cx="360" cy="620" rx="290" ry="80" fill="${c}" opacity=".6" filter="url(#blur)"/><g transform="translate(400 370) rotate(${song.bpm - 110})"><ellipse rx="255" ry="255" fill="url(#glass)" stroke="#fff" stroke-opacity=".4" stroke-width="2"/><ellipse rx="205" ry="205" fill="none" stroke="${a}" stroke-opacity=".6" stroke-width="25"/><ellipse rx="135" ry="135" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="3"/><ellipse rx="70" ry="70" fill="${c}" fill-opacity=".3"/><path d="M-245 -60 Q0 -180 245 60" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="24"/></g><text x="58" y="690" fill="#fff" font-family="Arial,sans-serif" font-size="52" letter-spacing="-2">${song.title}</text><text x="62" y="733" fill="#fff" fill-opacity=".65" font-family="Arial,sans-serif" font-size="16" letter-spacing="5">VELVET SESSIONS</text></svg>`;
  fs.writeFileSync(path.join(demo, song.slug + '.svg'), cover);
}
for (const song of songs) { writeSong(song); console.log('Generated original composition:', song.title); }
fs.writeFileSync(path.join(demo, 'library.json'), JSON.stringify(songs.map(song => ({ id:song.id,title:song.title,artist:'Velvet Sessions',album:'After the noise',duration:SECONDS,fileName:song.slug+'.wav',genre:'ambient',year:2026,source:'local',addedAt:'2026-10-25T00:00:00Z',artwork:null })), null, 2));
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><radialGradient id="g"><stop stop-color="#886da6"/><stop offset="1" stop-color="#201e2a"/></radialGradient><linearGradient id="v" x2="1" y2="1"><stop stop-color="#e8d7ff"/><stop offset="1" stop-color="#a793d6"/></linearGradient></defs><rect x="3" y="3" width="250" height="250" rx="60" fill="url(#g)"/><path d="M64 73 128 184 192 73" fill="none" stroke="url(#v)" stroke-width="23" stroke-linecap="round" stroke-linejoin="round"/><circle cx="192" cy="73" r="7" fill="#f3eaff"/></svg>`;
fs.writeFileSync(path.join(assets, 'icon.svg'), iconSvg);
const size = 256, pixels = Buffer.alloc(size * (size * 4 + 1));
const distance = (x,y,ax,ay,bx,by) => { const q = Math.max(0,Math.min(1,((x-ax)*(bx-ax)+(y-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2)));return Math.hypot(x-ax-q*(bx-ax),y-ay-q*(by-ay)); };
for (let y=0;y<size;y++) for(let x=0;x<size;x++) {
  const o=y*(size*4+1)+1+x*4, r=Math.hypot(x-128,y-100)/180;
  const corner = Math.hypot(Math.max(0,Math.abs(x-128)-65),Math.max(0,Math.abs(y-128)-65));
  const alpha=Math.max(0,Math.min(1,61-corner));
  const v = Math.max(0,Math.min(1,12-Math.min(distance(x,y,64,73,128,184),distance(x,y,128,184,192,73))));
  const glow = Math.max(0,1-r), base=[32+glow*55,30+glow*43,42+glow*65], tint=[232-y*.15,215-y*.16,255-y*.1];
  for(let channel=0;channel<3;channel++)pixels[o+channel]=Math.round(base[channel]*(1-v)+tint[channel]*v);
  pixels[o+3]=Math.round(alpha*255);
}
let crcTable;
function crc32(buf) { if(!crcTable)crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});let c=0xffffffff;for(const byte of buf)c=crcTable[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0; }
function chunk(type,data) { const name=Buffer.from(type), out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,data])),data.length+8);return out; }
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
fs.writeFileSync(path.join(assets,'icon.png'),png);
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
fs.writeFileSync(path.join(assets,'icon.ico'),Buffer.concat([ico,png]));
console.log('Generated covers, demo library and SVG/PNG/ICO icons.');

