// One frame's worth of uniforms, packed once for either renderer. The
// layouts match the uniform structs in src/shaders (WGSL and std140 GLSL alike).
import { FAR, NEAR, WINDOW, SPAWN_D, EXIT_D, STREAK, FOG_START, K, RINGS, SEGS, pathXY, phases } from './constants.js';
import { HEADLIGHTS, WIPE_CYCLE } from './game.js';
import { perspective, lookAt, mul, project, add, sub, scale, dot, norm } from './math.js';

export const MAX_INST = 200;   // 16 KB of instances: the most a WebGL 2 uniform block is sure to hold
export const MAX_LAMPS = 16;
export const SIZES = { particles: 104 + MAX_LAMPS * 4, tube: 68, things: 40, inst: MAX_INST * 20, sky: 12, post: 20 };
export const TUBE_VERTS = RINGS * SEGS * 6;

const PLUME = 0.12;                // share of particles thrown off the blade
const FOG = [0.84, 0.86, 0.88];    // the white everything fades into
const WIPE_SWEEP = 1.1;            // seconds the wipers take across and back

export function createFrame() {
  return {
    particles: new Float32Array(SIZES.particles),
    tube: new Float32Array(SIZES.tube),
    things: new Float32Array(SIZES.things),
    inst: new Float32Array(SIZES.inst),
    sky: new Float32Array(SIZES.sky),
    post: new Float32Array(SIZES.post),
    groups: [], count: 0, flow: 0, wind: 0,
    proj: new Float32Array(16), view: new Float32Array(16), pview: new Float32Array(16),
    vp: new Float32Array(16), pvp: new Float32Array(16), ph: new Float64Array(12),
  };
}

// How big the light at the end looks: a little bigger the further you get, never close.
export const exitSize = m => 0.012 + 0.012 * (1 - Math.exp(-m / 3000));

// How much your headlights light a point: two cones, falling off with distance.
function lit(p, hl) {
  let k = 0;
  for (const side of [-1, 1]) {
    const L = add(hl.at, scale(hl.right, side * hl.spread));
    const d = sub(p, L), dist = Math.hypot(...d) || 1;
    const c = dot(scale(d, 1 / dist), hl.dir);
    k += Math.min(1, Math.max(0, (c - 0.86) / 0.1)) / (1 + dist * dist * 0.004);
  }
  return k;
}

export function packFrame(f, { game, view, t, dt, count, reduceMotion, gain, meters }) {
  const S = game.S;
  const { now, was, truck: F } = game.camera(reduceMotion);
  const aspect = view.w / view.h;
  const tanY = Math.min(1.1, Math.max(0.62, 0.6 / aspect));
  perspective(f.proj, tanY, aspect, 0.05, 1000);
  // Mirror x, so +x in the world is right on the screen.
  f.proj[0] = -f.proj[0];
  mul(f.vp, f.proj, lookAt(f.view, now.eye, now.target, now.up));
  mul(f.pvp, f.proj, lookAt(f.pview, was.eye, was.target, was.up));

  // The storm overhead swirls on, and the wind gusts across the road.
  // Both run on the game's clock, so they stop when you pause.
  const step = S.paused ? 0 : dt;
  f.flow = (f.flow + (reduceMotion ? 0.01 : 0.04) * step) % 1000;
  const windV = reduceMotion ? 1.5 : 4 + 3 * Math.sin(S.T * 0.11) + 1.5 * Math.sin(S.T * 0.37 + 1);
  f.wind = (f.wind + windV * step) % 26000;
  const wt = S.T % 3600;
  phases(S.s, f.ph);

  const at = p => add(F.o, add(add(scale(F.fx, p[0]), scale(F.fy, p[1])), scale(F.fz, p[2])));
  const hl = {
    at: at(HEADLIGHTS.at), spread: HEADLIGHTS.spread, right: F.fx,
    dir: norm(add(add(scale(F.fx, HEADLIGHTS.dir[0]), scale(F.fy, HEADLIGHTS.dir[1])), scale(F.fz, HEADLIGHTS.dir[2]))),
  };
  // The amber beacon on the cab roof, going round.
  const beacon = Math.pow(Math.max(0, Math.sin(S.T * Math.PI * 2 * 0.9)), 6);
  const hlOn = S.mode === 'over' ? 0.6 : 1;

  const P = f.particles;
  P.set(f.vp, 0);
  P.set(f.pvp, 16);
  const nPlume = Math.floor(count * PLUME);
  const parts = game.parts();
  const lamps = parts.lamps
    .filter(l => l.pos[2] > 0.5 && l.pos[2] < FAR)
    .map(l => ({ ...l, k: l.reflector ? Math.min(1.2, lit(l.pos, hl) * 1.6) : l.k }))
    .filter(l => l.k > 0.02)
    .sort((a, b) => a.pos[2] - b.pos[2])
    .slice(0, MAX_LAMPS);
  f.count = count + lamps.length;
  const off = S.s - NEAR;
  P.set([view.w, view.h, wt, view.dpr], 32);
  P.set([((off % WINDOW) + WINDOW) % WINDOW, 0, f.wind, f.wind - windV * STREAK], 36);
  P.set([WINDOW, NEAR, FAR, gain], 40);
  P.set([count, count - nPlume, nPlume, lamps.length], 44);
  P.set([view.h / 2 / tanY, view.h * 0.03, S.speed, STREAK], 48);
  P.set([...hl.at, hl.spread], 52);
  P.set([...hl.dir, S.load], 56);
  P.set([...F.fx, beacon], 60);
  P.set([...F.o, hlOn], 64);
  P.set([...F.fx, 0], 68);
  P.set([...F.fy, 0], 72);
  P.set([...F.fz, 0], 76);
  P.set(f.ph, 80);
  P.set(K, 92);
  P.fill(0, 104);
  lamps.forEach((l, i) => P.set([...l.pos, l.k], 104 + i * 4));

  const T = f.tube;
  T.set(f.vp, 0);
  T.set([view.w, view.h, wt, view.dpr], 16);
  T.set([...now.eye, f.flow], 20);
  T.set([...FOG, FOG_START], 24);
  T.set([((S.s % 2048) + 2048) % 2048, NEAR, FAR, gain], 28);
  T.set([...hl.at, hl.spread], 32);
  T.set([...hl.dir, hlOn], 36);
  T.set([...F.fx, beacon], 40);
  T.set(f.ph, 44);
  T.set(K, 56);

  // The light at the end of the road, far down it, just above the middle of its far end.
  const [hx, hy] = pathXY(S.s + FAR);
  const hole = [hx, hy + 4, FAR];
  const k = EXIT_D / FAR;
  const ePos = [now.eye[0] + (hole[0] - now.eye[0]) * k, now.eye[1] + (hole[1] - now.eye[1]) * k, now.eye[2] + (hole[2] - now.eye[2]) * k];
  const ec = project(f.vp, ePos);
  const R = exitSize(meters) * EXIT_D;
  const rNdc = ec[2] > 0 ? R / tanY / ec[2] : 0;
  f.sky.set([ec[0], ec[1], rNdc, aspect, wt, gain, rNdc * view.h / 2, 0, ...FOG, 0]);

  // Things on the road, grouped by mesh.
  const D = f.things;
  D.set(f.vp, 0);
  D.set([wt, FOG_START, FAR, gain], 16);
  D.set([...now.eye, beacon], 20);
  D.set([...FOG, 0], 24);
  D.set([...hl.at, hl.spread], 28);
  D.set([...hl.dir, hlOn], 32);
  D.set([...F.fx, 0], 36);
  const list = parts.filter(p => p.pos[2] < SPAWN_D + 10).slice(0, MAX_INST).sort((a, b) => a.mesh - b.mesh);
  f.groups.length = 0;
  list.forEach((p, i) => {
    f.inst.set([p.pos[0], p.pos[1], p.pos[2], p.mat, ...p.q, ...p.scl, p.seed, ...p.rad, ...p.anim], i * 20);
    const g = f.groups[f.groups.length - 1];
    if (g && g.mesh === p.mesh) g.count++;
    else f.groups.push({ mesh: p.mesh, first: i, count: 1 });
  });

  f.post.set([1.6, 0.3, S.flash, S.fade, view.w, view.h, t % 600, reduceMotion ? 0.5 : 1, 0.95, 0.96, 0.97, S.wiper,
    WIPE_CYCLE, WIPE_SWEEP, 1, view.dpr, ((S.s % 2048) + 2048) % 2048, f.flow, 0, 0]);
  return f;
}
