// HUD, whispers and the title / crash / pause panels.
import { lightLeft } from './game.js';

const $ = id => document.getElementById(id);

export function fmtLen(L) {
  if (L >= 1) return `${L.toFixed(2)} m`;
  if (L < 1e-12) return `${L.toExponential(3)} m`;
  return `${L.toFixed(Math.min(16, 3 - Math.floor(Math.log10(L))))} m`;
}
const fmtM = m => Math.floor(m).toLocaleString('en-US');

const MILESTONES = [
  [150, 'the road is yours'], [450, 'visibility: zero'], [900, 'keep it between the posts'],
  [1500, 'the storm is getting worse'], [2300, 'the exit should be right here'], [3300, 'stay awake'],
  [4500, 'they keep shovelling'], [6000, 'any mile now'], [8000, 'nearly'], [10000, 'the longest whiteout on record'],
];
const HINTS = {
  robot: ['honk and they hop aside: space', 'tap to honk them out of the way'],
  crew: ['crews hold the line: find the gap', 'crews hold the line: find the gap'],
  car: ['go round', 'drag to go round'],
  drift: ['plow straight through', 'plow straight through'],
  buried: ['buried cars', 'buried cars'],
  walker: ['honk and they run', 'tap to honk and they run'],
  jackknife: ['jackknifed semi: find the gap', 'jackknifed semi: find the gap'],
  spin: ['spinning out', 'spinning out'],
  tire: ['loose tire', 'loose tire'],
  leaper: ['robot!', 'robot!'],
};
const DEATH = {
  robot: 'you plowed into a robot', crew: 'you plowed into the crew', car: 'you rear-ended a car',
  spin: 'a spinning car got you', buried: 'you hit a buried car', walker: 'you hit a robot crossing',
  jackknife: 'you hit the jackknifed semi', tire: 'a loose tire got you', leaper: 'a robot jumped in front of you',
};

export function createHud(store) {
  const el = {
    hud: $('hud'), dist: $('dist'), light: $('light'), whisper: $('whisper'),
    title: $('title'), bestTitle: $('best-title'),
    over: $('over'), overHead: $('over-head'), overDist: $('over-dist'), overLight: $('over-light'), overBest: $('over-best'),
    paused: $('paused'), pauseBtn: $('pause'), snd: $('snd'), error: $('error'), errorMsg: $('error-msg'),
  };
  let best = Number(store.get('nt4-best')) || 0;
  let milestone = 0;
  let timer = 0;
  let last = '';
  const hinted = {};

  function whisper(text, ms = 2600) {
    el.whisper.textContent = text;
    el.whisper.classList.add('on');
    clearTimeout(timer);
    timer = setTimeout(() => el.whisper.classList.remove('on'), ms);
  }

  if (best) {
    el.bestTitle.hidden = false;
    el.bestTitle.textContent = `Your best: ${fmtM(best)} m. The next exit was ${fmtLen(lightLeft(best))} away.`;
  }

  return {
    start() {
      milestone = 0; last = '';
      el.title.hidden = true; el.over.hidden = true; el.paused.hidden = true;
      el.hud.hidden = false; el.pauseBtn.hidden = false; el.pauseBtn.textContent = 'Pause';
    },
    progress(m) {
      const t = `${fmtM(m)} m|${fmtLen(lightLeft(m))}`;
      if (t !== last) {
        last = t;
        const [d, l] = t.split('|');
        el.dist.textContent = d;
        el.light.textContent = l;
      }
      const ms = MILESTONES[milestone];
      if (ms && m >= ms[0]) { milestone++; whisper(ms[1]); return true; }
      return false;
    },
    approach(kind, touch) {
      if (hinted[kind] || !HINTS[kind]) return;
      hinted[kind] = true;
      whisper(HINTS[kind][touch ? 1 : 0], 1800);
    },
    die() { el.pauseBtn.hidden = true; },
    over(kind, m) {
      const isBest = m > best;
      if (isBest) { best = m; store.set('nt4-best', String(Math.floor(m))); }
      el.overHead.textContent = DEATH[kind] || 'off the road';
      el.overDist.textContent = `${fmtM(m)} m`;
      el.overLight.textContent = `The next exit is still ${fmtLen(lightLeft(m))} away.`;
      el.overBest.textContent = isBest && m > 0 ? 'Your longest run yet.' : `Your best: ${fmtM(best)} m`;
      el.hud.hidden = true; el.over.hidden = false;
    },
    pause(p) {
      el.paused.hidden = !p;
      el.pauseBtn.textContent = p ? 'Resume' : 'Pause';
    },
    sound(muted) { el.snd.textContent = muted ? 'Sound off' : 'Sound on'; },
    error(msg) {
      el.title.hidden = true;
      el.error.hidden = false;
      el.errorMsg.textContent = msg;
    },
    buttons: { pause: el.pauseBtn, sound: el.snd },
  };
}
