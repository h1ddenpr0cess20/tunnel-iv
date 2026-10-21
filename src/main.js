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
// `?lite` is for weak devices: low resolution, little snow, 30 fps.
const lite = params.has('lite');
if (tv) {
  // No space bar on a remote: Select rolls out.
  for (const el of document.querySelectorAll('.go .kb-only')) {
    el.textContent = el.textContent.replace(/press space/i, 'Press Select').replace('Press P ', 'Press Play/Pause ');
  }
}
let particles = Number(params.get('particles')) || (lite ? 10000 : tv ? 25000 : coarse ? 30000 : 70000);

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

// A TV draws at a set height (720p; lite, 540p) and lets the browser scale it
// up; slow frames lower it.
let tvHeight = Number(params.get('height')) || (lite ? 540 : 720);
function resize(canvas) {
  let dpr = Math.min(coarse ? 1.5 : 2, window.devicePixelRatio || 1);
  if (tv || lite) dpr = Math.min(dpr, tvHeight / Math.max(1, canvas.clientHeight));
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
  // In lite mode, draw every other frame: a steady 30 beats a stuttering 60.
  const interval = lite ? 1000 / (Number(params.get('fps')) || 30) : 0;
  let drawn = -1e9;
  function tick(now) {
    requestAnimationFrame(tick);
    if (now - drawn < interval - 5) return;
    drawn = now;
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
      if (dt > (interval ? 1.4 * interval / 1000 : 1 / 40)) slow++;
      if (frames >= 90) {
        if (slow > 45) {
          if ((tv || lite) && tvHeight > (lite ? 360 : 450) && !params.get('height')) tvHeight = Math.max(lite ? 360 : 450, Math.round(tvHeight * 0.85));
          else if (particles > (lite ? 3000 : tv ? 6000 : 20000)) particles = Math.round(particles * 0.75);
        }
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
