// Browser player for the Neverending Tunnel IV: Demastered ROM, built on the jsnes emulator.
import { NES, Controller } from 'jsnes';

const $ = id => document.getElementById(id);
const canvas = $('nes');
const ctx = canvas.getContext('2d');
const image = ctx.createImageData(256, 240);
const frame32 = new Uint32Array(image.data.buffer);

// --- audio: ring buffer feeding a ScriptProcessor ---------------------------------
const BUF = 8192, MASK = BUF - 1;
const ring = [new Float32Array(BUF), new Float32Array(BUF)];
let rd = 0, wr = 0, audio = null, muted = false;
try { muted = localStorage.getItem('nt4-nes-muted') === '1'; } catch { /* storage unavailable */ }

function startAudio() {
  if (audio) { audio.resume?.(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audio = new AC({ sampleRate: 44100 });
  const node = audio.createScriptProcessor(1024, 0, 2);
  node.onaudioprocess = e => {
    const L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1);
    for (let i = 0; i < L.length; i++) {
      if (((wr - rd) & MASK) > 0 && !muted) { L[i] = ring[0][rd]; R[i] = ring[1][rd]; }
      else if (((wr - rd) & MASK) > 0) { /* drain while muted */ L[i] = R[i] = 0; }
      else L[i] = R[i] = 0;
      if (((wr - rd) & MASK) > 0) rd = (rd + 1) & MASK;
    }
  };
  node.connect(audio.destination);
}

// --- emulator ---------------------------------------------------------------------
const nes = new NES({
  onFrame(buffer) {
    for (let i = 0; i < 256 * 240; i++) frame32[i] = 0xFF000000 | buffer[i];
    ctx.putImageData(image, 0, 0);
  },
  onAudioSample(l, r) {
    if (((wr + 1) & MASK) === rd) return;          // buffer full: drop
    ring[0][wr] = l; ring[1][wr] = r; wr = (wr + 1) & MASK;
  },
  sampleRate: 44100,
});

let running = false, paused = false, raf = 0, last = 0, acc = 0;
const FRAME_MS = 1000 / 60.0988;
function loop(t) {
  raf = requestAnimationFrame(loop);
  if (paused) { last = t; return; }
  acc += Math.min(100, t - last); last = t;
  let n = 0;
  while (acc >= FRAME_MS && n < 4) { nes.frame(); acc -= FRAME_MS; n++; }
}

async function loadRom(source) {
  const bytes = source instanceof ArrayBuffer ? source : await (await fetch(source)).arrayBuffer();
  let s = '';
  const u8 = new Uint8Array(bytes);
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  nes.loadROM(s);
  nes.ppu.clipToTvSize = false;   // show the full 256x240 picture (jsnes hides the outer 8px like a TV)
  neutralGreys();
}

// The game is black and white: show the NES's greys as a real 2C02 does (jsnes's own $10 is beige).
function neutralGreys() {
  const t = nes.ppu.palTable;
  const greys = { 0x00: 0x666666, 0x10: 0xADADAD, 0x20: 0xFFFFFF, 0x30: 0xFFFFFF, 0x2D: 0x4F4F4F, 0x3D: 0xB8B8B8, 0x0F: 0, 0x1D: 0, 0x0D: 0 };
  t.loadNTSCPalette();
  for (const [k, v] of Object.entries(greys)) t.curTable[k] = v;
  t.makeTables();
  t.currentEmph = -1;
  t.setEmphasis(0);
}

function begin() {
  startAudio();
  $('start').hidden = true;
  if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
}

// --- input ------------------------------------------------------------------------
const KEYS = {
  ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN',
  KeyA: 'LEFT', KeyD: 'RIGHT', KeyW: 'UP', KeyS: 'DOWN',
  KeyZ: 'A', Space: 'A', KeyX: 'B', Enter: 'START', ShiftRight: 'SELECT', ShiftLeft: 'SELECT', KeyP: 'START',
};
function press(name, down) {
  const btn = Controller['BUTTON_' + name];
  down ? nes.buttonDown(1, btn) : nes.buttonUp(1, btn);
}
addEventListener('keydown', e => {
  if (e.code === 'KeyM' && !e.repeat) { toggleMute(); return; }
  if (e.repeat) { e.preventDefault(); return; }
  const b = KEYS[e.code];
  if (!b) return;
  e.preventDefault();
  if (!running) begin();
  press(b, true);
});
addEventListener('keyup', e => { const b = KEYS[e.code]; if (b) { e.preventDefault(); press(b, false); } });
for (const btn of document.querySelectorAll('#pad button')) {
  const b = btn.dataset.b;
  btn.addEventListener('pointerdown', e => { e.preventDefault(); if (!running) begin(); press(b, true); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => press(b, false));
}
addEventListener('blur', () => { for (const b of ['LEFT','RIGHT','UP','DOWN','A','B','START','SELECT']) press(b, false); });

// --- toolbar ----------------------------------------------------------------------
function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('nt4-nes-muted', muted ? '1' : '0'); } catch { /* storage unavailable */ }
  $('mute').textContent = muted ? 'Sound off' : 'Sound on';
}
$('mute').textContent = muted ? 'Sound off' : 'Sound on';
$('mute').addEventListener('click', toggleMute);
$('go').addEventListener('click', begin);
$('pause').addEventListener('click', () => {
  paused = !paused;
  $('pause').textContent = paused ? 'Resume' : 'Pause';
  if (audio) paused ? audio.suspend() : audio.resume();
});
$('reset').addEventListener('click', () => { nes.reset?.(); });
$('fs').addEventListener('click', () => document.querySelector('.screen').requestFullscreen?.());
$('load').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (f) { await loadRom(await f.arrayBuffer()); begin(); }
});

loadRom(import.meta.env.BASE_URL + 'tunnel-iv.nes').then(() => {
  // show the title screen behind the Play overlay
  for (let i = 0; i < 90; i++) nes.frame();
}).catch(err => { $('start').querySelector('p').textContent = 'Could not load the ROM: ' + err.message; });
