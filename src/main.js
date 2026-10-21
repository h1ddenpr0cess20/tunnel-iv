import './styles.css';
import { createRenderer } from './renderer.js';
import { buildMeshes } from './meshes.js';
import { createFrame, packFrame } from './frame.js';
import { createGame } from './game.js';
import { BLADE } from './constants.js';
import { createHud } from './hud.js';
import { bindInput } from './input.js';
import { Sound, store } from './sound.js';

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
const params = new URLSearchParams(location.search);
const tv = params.has('tv') || /FireTVApp|AFT/.test(navigator.userAgent);
let particles = Number(params.get('particles')) || (tv ? 25000 : coarse ? 30000 : 70000);

const hud = createHud(store);
hud.sound(Sound.muted);
let overAt = 0;
let input = null;

const game = createGame({
  start: () => { hud.start(); Sound.start(); },
  pause: p => { hud.pause(p); Sound.suspend(p); },
  die: kind => { hud.die(); Sound.crash(kind); },
  over: (kind, m) => { overAt = performance.now(); hud.over(kind, m); },
  nearMiss: (side, k) => {
    Sound.nearMiss(side, k);
    game.S.shake = Math.max(game.S.shake, 0.3 * k);
  },
  horn: n => { Sound.horn(); if (n) Sound.servos(n); },
  plow: k => Sound.plow(k),
  scrape: k => Sound.scrape(k),
  leap: () => Sound.leap(),
  wipe: () => Sound.wipe(),
  approach: kind => hud.approach(kind, input?.touch),
  progress: m => { if (hud.progress(m)) Sound.chime(); },
});
const S = game.S;

function primary() {
  Sound.init();
  if (S.mode === 'title') game.start();
  else if (S.mode === 'over') { if (performance.now() - overAt > 450) game.start(); }
  else if (S.paused) game.setPaused(false);
  else game.horn();
}
function toggleMute() {
  Sound.init();
  Sound.setMuted(!Sound.muted);
  hud.sound(Sound.muted);
}

input = bindInput({
  primary,
  steer: v => { S.steer = v; },
  nudge: (dx, dy) => game.nudge(dx, dy),
  pause: () => game.setPaused(!S.paused),
  mute: toggleMute,
});
hud.buttons.sound.addEventListener('click', toggleMute);
hud.buttons.pause.addEventListener('click', () => game.setPaused(!S.paused));
document.addEventListener('visibilitychange', () => { if (document.hidden) game.setPaused(true); });
window.addEventListener('blur', () => game.setPaused(true));

function resize(canvas) {
  const dpr = Math.min(coarse ? 1.5 : 2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return { w, h, dpr };
}

async function boot() {
  let renderer;
  try {
    renderer = await createRenderer(document.getElementById('tunnel'), buildMeshes(BLADE));
  } catch (err) {
    hud.error(err.message);
    console.error(err);
    return;
  }
  document.documentElement.dataset.renderer = renderer.kind;
  const frame = createFrame();
  let last = null, start = null, meters = 0;
  // If frames run slow, thin the snow out until they don't.
  let slow = 0, frames = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    start ??= now;
    const dt = last == null ? 0 : Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    game.update(dt);
    if (S.mode !== 'title') meters = game.meters();
    const t = (now - start) / 1000;
    packFrame(frame, {
      game, view: resize(renderer.canvas), t, dt: S.paused ? 0 : dt, count: particles, reduceMotion,
      gain: Math.min(1, t / 1.5), meters,
    });
    renderer.draw(frame);
    if (!S.paused) Sound.update(dt, S.speed, S.load, S.mode);

    if (!params.get('particles') && !document.hidden && dt > 0) {
      frames++;
      if (dt > 1 / 40) slow++;
      if (frames >= 90) {
        if (slow > 45 && particles > 20000) particles = Math.round(particles * 0.75);
        frames = 0; slow = 0;
      }
    }
  }
  requestAnimationFrame(tick);
}

boot();

// Hooks for automated checks.
window.__road = game;
window.__sound = Sound;
