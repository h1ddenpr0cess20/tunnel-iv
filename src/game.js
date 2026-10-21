// Game state: driving the plow, steering across the road, the horn, the
// things on the highway, plowing through drifts and crashes. You and
// everything on the road are placed across it (x, from the middle of the
// road), up off it (y) and along it (z, distance s); the road's bends are
// added only when they're drawn.
import {
  SPAWN_D, M_PER_UNIT, EYE, BLADE, X_MAX, STEER_V, HIT_R, MISS_R, STREAK, ROAD_W, LANE, HORN_COOL,
  pathXY, pathD, bankH,
} from './constants.js';
import { MESH, SHOULDERS, BLADE_YAW } from './meshes.js';
import { qAxis, qMul, qRot, qFromBasis, add, sub, scale, norm, cross, segDist } from './math.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rideSpeed = t => 15 + 11 * (1 - Math.exp(-t / 150));

export const lightLeft = m => 800 * Math.pow(0.5, m / 300);   // metres to the next exit

// Finishes for things whose meshes don't paint their own (see things.wgsl).
export const MAT = { SNOW: 0, TRAILER: 1, TRACTOR: 2, POST: 3 };
const X_AXIS = [1, 0, 0], Y_AXIS = [0, 1, 0];
const ONE = [0, 0, 0, 1];
const LANES = [-LANE, 0, LANE];
export const WIPE_CYCLE = 2.8;   // the wipers go across and back once in this long

// Where things are on your truck, in its frame: the blade's two ends
// (it's angled, so the right one trails), and the cab.
const turnBlade = p => {
  const c = Math.cos(BLADE_YAW), s = Math.sin(BLADE_YAW), dz = p[2] - BLADE.z;
  return [p[0] * c + dz * s, p[1], BLADE.z - p[0] * s + dz * c];
};
const BLADE_TOP = BLADE.z + 0.4;
const BLADE_ENDS = [turnBlade([-BLADE.w + 0.04, BLADE.h, BLADE_TOP]), turnBlade([BLADE.w - 0.04, BLADE.h, BLADE_TOP])];
const TRUCK_COLS = [
  { a: turnBlade([-BLADE.w + 0.05, 0.6, BLADE.z + 0.1]), b: turnBlade([BLADE.w - 0.05, 0.6, BLADE.z + 0.1]), r: 0.4 },
  { a: [0, 1.5, -2.2], b: [0, 1.5, 0.9], r: 1.2 },
];
// Your headlights, for what they light up.
export const HEADLIGHTS = { at: [0, 1.25, 1.1], spread: 0.95, dir: norm([0, -0.06, 1]) };

export function createGame(events) {
  const S = {
    mode: 'title', paused: false,
    s: 0, speed: 8, runT: 0, start: 0, T: 0,
    x: 0, vx: 0, yaw: 0, steer: [0, 0], nudge: [0, 0], swipe: 0, upHeld: false,
    roll: 0, lurch: 0, load: 0.35, hornCool: 0, honk: 0, wiper: 0, scrape: 0,
    deb: [], next: 0, id: 1, spawned: 0,
    deathT: 0, kind: '', bounce: 0, shake: 0, flash: 0, fade: 0, fadeTo: 0,
  };
  const seen = {};

  const meters = () => Math.max(0, (S.s - S.start) * M_PER_UNIT);

  // ---- things on the road ---------------------------------------------------
  function thing(kind, z, o) {
    const d = {
      id: S.id++, kind, z, x: 0, y: 0, vx: 0, vz: 0, yaw: 0, w: 0, tilt: ONE, reach: 3,
      parts: [], cols: [], lamps: [], minD: 1e9, missed: false, seed: Math.random(), gait: 0, legs: 0, snow: 0.5, glow: 0,
      ...o,
    };
    S.deb.push(d);
    place(d, 0);
    return d;
  }

  // A robot bent over its shovel, digging and flinging the snow aside.
  function robot(z, x, o = {}) {
    const w = rnd(3.2, 4.4), ph = Math.random() * 6.3, yaw0 = o.yaw ?? pick([Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI * 0.75, -Math.PI * 0.75]);
    return thing(o.kind || 'robot', z, {
      x, yaw: yaw0, yaw0, dig: { w, ph }, snow: 0.35, hearsHorn: o.kind !== 'crew',
      parts: [
        { mesh: MESH.ROBOT_BENT, off: [0, 0, 0] },
        { mesh: MESH.SHOVEL_ARMS, off: [0, 0, 0], flap: { axis: X_AXIS, base: -0.18, amp: 0.2, w, ph, pivot: SHOULDERS } },
      ],
      cols: [{ a: [0, 0.2, 0], b: [0, 1.35, 0.3], r: 0.3 }, { a: [0.13, 1.0, 0.33], b: [-0.1, 0.1, 1.25], r: 0.14 }],
      tick(d) {
        // Twist into the throw as the scoop comes up (a crew holds its line still).
        if (d.dodge || d.kind === 'crew') return;
        d.yaw = d.yaw0 + 0.3 * Math.sin(d.dig.w * S.T + d.dig.ph - 1.2);
      },
      ...o,
    });
  }

  // A robot walking across the road, its shovel over its shoulder.
  function walker(z, x, dir) {
    return thing('walker', z, {
      x, vx: dir * rnd(1.1, 1.5), yaw: dir * Math.PI / 2, hearsHorn: true, snow: 0.2,
      parts: [{ mesh: MESH.ROBOT, off: [0, 0, 0] }, { mesh: MESH.CARRY_ARMS, off: [0, 0, 0] }],
      cols: [{ a: [0, 0.15, 0], b: [0, 1.6, 0], r: 0.3 }, { a: [0.1, 1.1, 0.34], b: [0.3, 1.7, -0.8], r: 0.12 }],
      tick(d, dt) {
        d.gait += dt * Math.abs(d.vx) * 4.6;
        d.legs = 0.42 * Math.sin(d.gait);
        d.y = bankH(d.x, d.z) + 0.03 * Math.abs(Math.sin(d.gait));
      },
    });
  }

  // A robot on the bank that leaps right across the road as you get there.
  function leaper(z) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const x0 = side * (ROAD_W + 1.6), x1 = -side * (ROAD_W + 1.6);
    return thing('leaper', z, {
      x: x0, y: bankH(x0, z), yaw: -side * Math.PI / 2, leap: { x0, x1, u: -0.2, go: false }, snow: 0.2, reach: 3,
      parts: [{ mesh: MESH.ROBOT, off: [0, 0, 0] }, { mesh: MESH.CARRY_ARMS, off: [0, 0, 0] }],
      cols: [{ a: [0, 0.15, 0], b: [0, 1.6, 0], r: 0.32 }, { a: [0.1, 1.1, 0.34], b: [0.3, 1.7, -0.8], r: 0.12 }],
      tick(d, dt) {
        const L = d.leap;
        if (!L.go && S.mode === 'run' && d.z - S.s < Math.max(S.speed, 12) * 1.35) { L.go = true; if (!S.planning) events.leap(); }
        if (L.go) L.u += dt / 1.3;
        const u = clamp(L.u, 0, 1);
        d.x = L.x0 + (L.x1 - L.x0) * smooth(u * 1.1 - 0.05);
        d.y = (1 - u) * bankH(L.x0, d.z) + u * bankH(L.x1, d.z) + 3.4 * 4 * u * (1 - u) * (L.u > 0 ? 1 : 0);
        d.tilt = qAxis([0, 0, 1], 0.35 * Math.sin(Math.PI * u) * Math.sign(L.x0));
        d.legs = L.u > 0 && L.u < 1 ? 0.5 : 0;
        d.live = L.u > 0 && L.u < 1.05;
      },
    });
  }

  // A car crawling along with its hazards on, sometimes changing lanes.
  function car(z, x, o = {}) {
    return thing(o.kind || 'car', z, {
      // Whether and when it changes lanes is settled now, so the road ahead can be planned.
      x, vz: rnd(5, 10), tx: x, hazard: Math.random() < 0.7, snow: 0.7, reach: 4,
      change: Math.random() < 0.5 ? { at: S.T + rnd(1, 7), to: pick(LANES) } : null,
      parts: [{ mesh: MESH.CAR, off: [0, 0, 0] }],
      cols: [{ a: [0, 0.6, -1.75], b: [0, 0.6, 1.75], r: 0.9 }, { a: [0, 1.05, -0.9], b: [0, 1.05, 0.5], r: 0.62 }],
      lamps: [{ at: [-0.68, 0.82, -2.27], tail: true }, { at: [0.68, 0.82, -2.27], tail: true }],
      tick(d, dt) {
        if (d.kind === 'car') {
          if (d.change && S.T >= d.change.at) { d.tx = d.change.to; d.change = null; }
          d.vx += ((clamp(d.tx - d.x, -1, 1) * 1.6) - d.vx) * (1 - Math.exp(-dt * 2));
          d.yaw = Math.atan2(d.vx, d.vz);
        }
        const blink = Math.floor(S.T * 1.7 + d.seed * 2) % 2 === 0;
        d.glow = d.hazard ? (blink ? 1 : 0.25) : 0.35;
      },
      ...o,
    });
  }

  // A car spinning out, sliding across the lanes.
  function spinner(z) {
    const x = rnd(-ROAD_W + 2, ROAD_W - 2);
    return car(z, x, {
      kind: 'spin', vz: rnd(3, 6), vx: -Math.sign(x) * rnd(0.6, 1.4), w: rnd(1.0, 1.8) * (Math.random() < 0.5 ? -1 : 1),
      yaw: Math.random() * 6.3, hazard: false,
    });
  }

  // A car stuck under a drift, only its roof showing.
  function buried(z, x) {
    const yaw = rnd(-0.3, 0.3) + (Math.random() < 0.3 ? Math.PI : 0);
    return thing('buried', z, {
      x, yaw, y: -0.5, tilt: qAxis([0, 0, 1], rnd(-0.08, 0.08)), snow: 1, reach: 4,
      parts: [
        { mesh: MESH.CAR, off: [0, 0, 0] },
        { mesh: MESH.MOUND, mat: MAT.SNOW, off: [0, 0.45, 0], scl: [1.45, rnd(0.75, 0.9), 3.1] },
      ],
      cols: [{ a: [0, 0.8, -2.1], b: [0, 0.8, 2.1], r: 0.95 }],
    });
  }

  // A drift across part of the road: plow straight through it.
  function drift(z, x) {
    return thing('drift', z, {
      x, harmless: true, sink: 0,
      parts: [{ mesh: MESH.MOUND, mat: MAT.SNOW, off: [0, 0, 0], scl: [rnd(1.6, 2.6), rnd(0.45, 0.8), rnd(1.0, 1.8)] }],
      tick(d, dt) {
        if (!d.plowed) return;
        d.sink += dt;
        d.vx = 3.5;
        d.parts[0].shrink = Math.exp(-d.sink * 5);
      },
    });
  }

  // A tire come off something, bouncing down the road towards you.
  function looseTire(z, x) {
    return thing('tire', z, {
      x, vz: -rnd(4, 8), vx: rnd(-0.6, 0.6), hop: rnd(5, 7), ph: Math.random() * 6.3, spin: 0, snow: 0.2,
      parts: [{ mesh: MESH.TIRE, off: [0, 0, 0] }],
      cols: [{ a: [-0.12, 0, 0], b: [0.12, 0, 0], r: 0.4 }],
      tick(d, dt) {
        d.spin += dt * d.vz / 0.37;
        d.y = 0.37 + 0.7 * Math.abs(Math.sin(S.T * d.hop * 0.5 + d.ph));
        d.tilt = qMul(qAxis([0, 0, 1], 0.12 * Math.sin(S.T * 3 + d.ph)), qAxis(X_AXIS, d.spin));
      },
    });
  }

  // A semi jackknifed right across the road, from beyond one bank to
  // within a gap of the other.
  function jackknife(z, diff) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const gap = 6.8 - 0.7 * diff;
    const xi = -side * (ROAD_W - gap), xo = side * (ROAD_W + 2.4);
    const len = 14.4, dx = xo - xi, dz = Math.sqrt(len * len - dx * dx);
    const yaw = Math.atan2(dx, dz);
    const lamps = [];
    // Its near side faces you: marker lamps along the bottom of it.
    const sx = Math.sign(Math.sin(yaw)) || 1;
    for (let k = -2; k <= 2; k++) lamps.push({ at: [sx * 1.33, 1.3, k * 3], marker: true });
    lamps.push({ at: [-0.9, 1.45, -7.25], tail: true }, { at: [0.9, 1.45, -7.25], tail: true });
    const parts = [
      { mesh: MESH.BOXS, mat: MAT.TRAILER, off: [0, 2.55, 0], scl: [1.3, 1.35, 7.2] },
      { mesh: MESH.BOXS, mat: MAT.TRACTOR, off: [-side * 0.8, 1.9, 9.1], scl: [1.25, 1.5, 1.4], rot: qAxis(Y_AXIS, side * 0.9) },
    ];
    for (const tz of [-5.9, -4.7]) {
      parts.push({ mesh: MESH.AXLE, off: [0, 0.45, tz], scl: [0.95, 1, 1] });
      for (const tx of [-0.95, 0.95]) parts.push({ mesh: MESH.TIRE, off: [tx, 0.45, tz], scl: [1.2, 1.2, 1.2] });
    }
    const a = -len / 2 + 1.3, b = len / 2 - 1.3;
    return thing('jackknife', z + dz / 2, {
      x: (xi + xo) / 2, yaw, snow: 0.8, reach: 9, parts, lamps,
      cols: [{ a: [0, 1.75, a], b: [0, 1.75, b], r: 1.35 }],
    });
  }

  // A crew of robots shovelling right across the road, facing you, with
  // one way through: a gap gw either side of its middle, the blade needing
  // about 3 of that, so there's a little to spare, less as it gets harder.
  function crew(z, diff) {
    const gap = rnd(-X_MAX + 0.3, X_MAX - 0.3), gw = 3.7 - 0.4 * diff;
    for (let x = -ROAD_W + rnd(0.2, 0.8); x <= ROAD_W; x += rnd(1.5, 1.9)) {
      if (Math.abs(x - gap) < gw) continue;
      robot(z + rnd(-0.4, 0.4), x, { kind: 'crew', yaw: Math.PI + rnd(-0.08, 0.08) });
    }
  }

  function place(d, dt) {
    d.z += d.vz * dt;
    d.x += d.vx * dt;
    d.yaw += d.w * dt;
    if (d.dodge) {
      // Out of the way of the horn: a hop to one side, then back to work.
      const D = d.dodge;
      D.wait -= dt;
      if (D.wait <= 0) {
        D.u = Math.min(1, D.u + dt / 0.55);
        d.x = D.from + (D.to - D.from) * smooth(D.u);
        d.y = 0.45 * Math.sin(Math.PI * D.u);
        d.legs = 0.4 * Math.sin(Math.PI * D.u);
        if (D.u >= 1) { d.dodge = null; d.legs = 0; d.y = 0; }
      }
    }
    d.tick?.(d, dt);
    d.q = qMul(qAxis(Y_AXIS, d.yaw), d.tilt);
  }

  function inLane(x) { return clamp(x + rnd(-0.8, 0.8), -X_MAX, X_MAX); }

  // One pattern of `type` at depth z; returns how deep it is.
  const FIRST = ['drift', 'robot', 'car', 'crew', 'buried', 'walker', 'jackknife', 'spin', 'tire', 'leaper'];
  const anyType = () => {
    const r = Math.random();
    return r < 0.17 ? 'robot' : r < 0.27 ? 'crew' : r < 0.43 ? 'car' : r < 0.53 ? 'buried' : r < 0.63 ? 'walker'
      : r < 0.7 ? 'jackknife' : r < 0.77 ? 'spin' : r < 0.85 ? 'tire' : r < 0.92 ? 'leaper' : 'drift';
  };
  function pattern(type, z, diff) {
    let depth = 2;
    if (type === 'robot') {
      robot(z, inLane(S.x));
      if (diff > 0.3 && Math.random() < 0.6) { robot(z + rnd(5, 9), inLane(pick(LANES))); depth = 9; }
    } else if (type === 'crew') {
      crew(z, diff);
    } else if (type === 'car') {
      car(z, pick(LANES));
      if (diff > 0.4 && Math.random() < 0.6) { car(z + rnd(8, 14), pick(LANES)); depth = 14; }
    } else if (type === 'buried') {
      // Cars buried in drifts, never more than you can get round: one, or two
      // side by side leaving an outside lane clear; or, harder, a second one
      // in the clear lane far enough on to swerve out in time. They lie a
      // little away from the clear lane, never into it.
      const free = pick(LANES);
      const away = x => x + Math.sign(x - free) * rnd(0.5, 1.0);
      const others = LANES.filter(x => x !== free).sort(() => Math.random() - 0.5);
      if (diff > 0.4 && Math.random() < 0.5) {
        buried(z, away(others[0]));
        buried(z + rnd(20, 26), free + rnd(-0.4, 0.4));
        depth = 26;
      } else {
        const n = free !== 0 && Math.random() < 0.6 ? 2 : 1;
        others.slice(0, n).forEach((x, i) => buried(z + i * rnd(4, 9), away(x)));
        depth = 12;
      }
    } else if (type === 'walker') {
      const n = diff > 0.4 && Math.random() < 0.6 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        walker(z + i * rnd(4, 8), -dir * rnd(2, ROAD_W + 3), dir);
      }
      depth = 8;
    } else if (type === 'jackknife') {
      jackknife(z, diff);
      depth = 12;
    } else if (type === 'spin') {
      spinner(z);
    } else if (type === 'tire') {
      looseTire(z, inLane(S.x));
      if (Math.random() < 0.5) looseTire(z + rnd(6, 12), inLane(pick(LANES)));
      depth = 10;
    } else if (type === 'leaper') {
      leaper(z);
    } else {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) drift(z + rnd(0, 12), rnd(-ROAD_W + 1, ROAD_W - 1));
      depth = 12;
    }
    return depth;
  }

  // The next pattern, at S.next, but only one that leaves a way through
  // everything already on the road ahead (moving things included, where
  // they'll be when you get there). If a few tries all close the road,
  // it's a drift: you can always plow through those.
  function spawn() {
    const diff = Math.min(1, S.runT / 180);
    const v = Math.max(S.speed, 15);
    const z = S.next;
    let depth = 2;
    for (let tries = 0; ; tries++) {
      const type = tries === 0 && FIRST[S.spawned] ? FIRST[S.spawned] : tries < 5 ? anyType() : 'drift';
      const before = S.id;
      depth = pattern(type, z, diff);
      // Passable steering at a third of what the truck can, and with room
      // to spare: what's planned is only looked at every twentieth of a second.
      if (type === 'drift' || passable(false, 0.35, CLEAR + 0.25)) break;
      S.deb = S.deb.filter(d => d.id < before);
    }
    S.spawned++;
    S.next = z + depth + Math.max(22, v * (1.4 - 0.5 * diff) + Math.random() * v * (1.1 - 0.4 * diff));
  }

  // ---- your truck -----------------------------------------------------------
  // A point in the truck's frame, on the road (relative to its middle). What
  // you hit with is the truck pointing straight down the road, whichever way
  // it's crabbing as you steer, so it's the same as what the way through
  // is planned for.
  function onRoad(p) {
    return [S.x + p[0], p[1], S.s + p[2]];
  }

  function colliders(d) {
    return d.cols.map(c => ({ a: add([d.x, d.y, d.z], qRot(d.q, c.a)), b: add([d.x, d.y, d.z], qRot(d.q, c.b)), r: c.r }));
  }

  function moveAll(dt) {
    for (const d of S.deb) place(d, dt);
  }

  // ---- the way through --------------------------------------------------------
  // Is there still a way through everything on the road ahead? Copies of it
  // all are run on (everything on the road moves by rules settled when it
  // turns up, and your speed down the road only goes with time, so this is
  // exactly what will happen), and at each step we keep the stretches
  // across the road you could have steered to by then without coming
  // within `clear` of anything, steering at `ability` of what the truck
  // can. If that ever comes to nothing, the road is closed. With `path`, it
  // also hands back one way through: where across the road to be, step by
  // step.
  const PLAN_DT = 1 / 20, PLAN_DX = 0.3, CLEAR = HIT_R + 0.3, EDGE = X_MAX - 0.2;
  const PLAN_XS = Array.from({ length: Math.round(2 * EDGE / PLAN_DX) + 1 }, (_, i) => -EDGE + i * PLAN_DX);
  // The stretches of road (as [from, to] across it) where your truck would
  // be clear of these colliders, all the way from `back` behind where it is
  // (where it was a step ago): found on a grid, their edges refined.
  function clearings(cols, back, clear) {
    if (!cols.length) return [[-EDGE, EDGE]];
    const hit = x => cols.some(c => TRUCK_COLS.some(m => [0, 0.5, 1].some(k => {
      const z = S.s - back * k;
      return segDist([x + m.a[0], m.a[1], z + m.a[2]], [x + m.b[0], m.b[1], z + m.b[2]], c.a, c.b) - c.r - m.r <= clear;
    })));
    const edge = (lo, hi) => {   // lo clear, hi blocked (or the other way round)
      const loHit = hit(lo);
      for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2; if (hit(mid) === loHit) lo = mid; else hi = mid; }
      return loHit ? hi : lo;
    };
    const out = [];
    let from = null;
    PLAN_XS.forEach((x, i) => {
      const clear = !hit(x);
      if (clear && from === null) from = i === 0 ? x : edge(PLAN_XS[i - 1], x);
      if (!clear && from !== null) { out.push([from, edge(PLAN_XS[i - 1], x)]); from = null; }
    });
    if (from !== null) out.push([from, EDGE]);
    return out;
  }
  // Intervals: grown by d either side, and where two sets of them overlap.
  const grow = (R, d) => {
    const out = [];
    for (const [lo, hi] of R.map(([lo, hi]) => [Math.max(-EDGE, lo - d), Math.min(EDGE, hi + d)])) {
      const last = out[out.length - 1];
      if (last && lo <= last[1]) last[1] = Math.max(last[1], hi); else out.push([lo, hi]);
    }
    return out;
  };
  const meet = (A, B) => {
    const out = [];
    for (const [a0, a1] of A) for (const [b0, b1] of B) { const lo = Math.max(a0, b0), hi = Math.min(a1, b1); if (lo <= hi) out.push([lo, hi]); }
    return out;
  };
  // Intervals moved by d.
  const shift = (R, d) => R.map(([lo, hi]) => [lo + d, hi + d]);
  // Five speeds across the road (left fast, left, still, right, right fast),
  // each step able to change by one: the truck takes a moment to swing over.
  const SPEEDS = [-2, -1, 0, 1, 2];
  function passable(path = false, ability = 0.6, clear = CLEAR) {
    const ghosts = S.deb.filter(d => !d.harmless).map(d => ({
      ...d, leap: d.leap && { ...d.leap }, dodge: d.dodge && { ...d.dodge }, change: d.change && { ...d.change },
    }));
    if (!ghosts.length) return path ? [] : true;
    const saved = { s: S.s, T: S.T, speed: S.speed, runT: S.runT, planning: false };
    S.planning = true;
    const h = STEER_V * ability / 2 * PLAN_DT;   // how far one speed step moves you in a step
    const lv = Math.max(-2, Math.min(2, Math.round(S.vx / (STEER_V * ability / 2))));
    const x0 = Math.max(-EDGE, Math.min(EDGE, S.x));
    let R = SPEEDS.map(v => (v === lv ? [[x0, x0]] : []));
    const steps = [];
    let ok = true;
    // On till you're past them all (where they'll be by then: cars drive on).
    for (let i = 0; i < 400 && ghosts.some(d => d.z + d.reach + 3 > S.s); i++) {
      S.runT += PLAN_DT; S.T += PLAN_DT;
      S.speed += (rideSpeed(S.runT) - S.speed) * (1 - Math.exp(-PLAN_DT * 0.8));
      S.s += S.speed * PLAN_DT;
      for (const d of ghosts) place(d, PLAN_DT);
      const near = ghosts.filter(d => Math.abs(d.z - S.s) < d.reach + 4 && !(d.leap && !d.live));
      const open = clearings(near.flatMap(colliders), S.speed * PLAN_DT, clear);
      R = SPEEDS.map((v, k) => {
        const from = [R[k - 1], R[k], R[k + 1]].filter(Boolean).flat().sort((a, b) => a[0] - b[0]);
        return meet(grow(shift(from, v * h), h / 2), open);
      });
      if (path) steps.push({ R, open });
      if (R.every(r => !r.length)) { ok = false; break; }
    }
    Object.assign(S, saved);
    if (!path) return ok;
    if (!ok) return null;
    if (!steps.length) return [];
    // Back from the end: at each step, a speed within one of the next and
    // a place it could have come from, as near the middle of its clearing
    // as that allows. (Every place reachable at a step was reached from one
    // within h/2 of it at the step before; EPS is slack for rounding.)
    const EPS = 1e-6;
    const end = steps[steps.length - 1];
    let k = -1;
    end.R.forEach((r, j) => { if (r.length && (k < 0 || Math.abs(SPEEDS[j]) < Math.abs(SPEEDS[k]))) k = j; });
    const widest = end.R[k].reduce((w, r) => (r[1] - r[0] > w[1] - w[0] ? r : w));
    let x = (widest[0] + widest[1]) / 2;
    const xs = [x];
    for (let i = steps.length - 2; i >= 0; i--) {
      const c = x - SPEEDS[k] * h;
      let pick = null;
      for (const j of [k, k - 1, k + 1].filter(j => j >= 0 && j < SPEEDS.length).sort((a, b) => Math.abs(SPEEDS[a]) - Math.abs(SPEEDS[b]))) {
        for (const [lo, hi] of steps[i].R[j]) {
          const a = Math.max(lo, c - h / 2), b = Math.min(hi, c + h / 2);
          if (a > b + EPS) continue;
          if (a > b) { pick = { j, x: (a + b) / 2 }; break; }
          // As near the middle of its clearing as it can be.
          const o = steps[i].open.find(([o0, o1]) => o0 - EPS <= a && b <= o1 + EPS) || [a, b];
          pick = { j, x: Math.min(b, Math.max(a, (o[0] + o[1]) / 2)) };
          break;
        }
        if (pick) break;
      }
      k = pick.j; x = pick.x;
      xs.unshift(x);
    }
    return xs;
  }

  // ---- actions --------------------------------------------------------------
  function start() {
    S.mode = 'run'; S.paused = false;
    S.runT = 0; S.start = S.s;
    S.x = 0; S.vx = 0; S.yaw = 0; S.nudge = [0, 0]; S.swipe = 0; S.roll = 0; S.lurch = 0;
    S.deb = []; S.spawned = 0; S.next = S.s + 60; S.hornCool = 0;
    S.fadeTo = 0; S.shake = 0; S.flash = 0;
    S.speed = Math.max(S.speed, 10);
    events.start();
  }

  function setPaused(p) {
    if (S.mode !== 'run') return;
    S.paused = p;
    events.pause(p);
  }

  // The horn: robots in your way hop aside (crews hold their line).
  function horn() {
    if (S.mode !== 'run' || S.paused || S.hornCool > 0) return;
    S.hornCool = HORN_COOL;
    S.honk = 0.7;
    let n = 0;
    for (const d of S.deb) {
      const ahead = d.z - S.s;
      if (!d.hearsHorn || d.dodge || ahead < 3 || ahead > 45) continue;
      if (d.kind === 'walker') { if (!d.ran) { d.ran = true; d.vx *= 2.6; n++; } continue; }
      if (Math.abs(d.x - S.x) > 3.4) continue;
      const away = Math.sign(d.x - S.x) || (Math.random() < 0.5 ? -1 : 1);
      const lim = ROAD_W + 1;
      const opts = [clamp(d.x + away * 2.9, -lim, lim), clamp(d.x - away * 2.9, -lim, lim)];
      const to = Math.abs(opts[0] - S.x) >= Math.abs(opts[1] - S.x) - 0.5 ? opts[0] : opts[1];
      d.dodge = { from: d.x, to, u: 0, wait: 0.08 + ahead * 0.006 };
      n++;
    }
    events.horn(n);
  }

  // Touch drags steer; a flick upwards honks.
  function nudge(dx, dy) {
    if (S.mode !== 'run' || S.paused) return;
    S.nudge[0] += dx;
    S.swipe = Math.max(0, S.swipe + dy);
    if (S.swipe > 0.35) { S.swipe = 0; horn(); }
  }

  function die(kind) {
    S.mode = 'dying'; S.kind = kind; S.deathT = 0;
    S.bounce = Math.min(4, S.speed * 0.2);
    S.lurch = Math.min(1, S.speed / 20);
    S.speed = 0; S.vx = 0; S.shake = 1; S.flash = 1; S.fadeTo = 0.88;
    events.die(kind);
  }

  // ---- simulation -----------------------------------------------------------
  function step(dt) {
    const [sx, sy] = S.steer;
    S.vx += (sx * STEER_V - S.vx) * (1 - Math.exp(-6 * dt));
    S.x += S.vx * dt;
    if (Math.abs(S.x) > X_MAX) {
      // Into the bank: it shoves you back and loads the blade. (Nothing
      // changes your speed down the road but time: it's what the way
      // through is planned on.)
      S.x = Math.sign(S.x) * X_MAX;
      if (S.vx * S.x > 0) {
        if (S.scrape <= 0) events.scrape(Math.min(1, Math.abs(S.vx) / STEER_V));
        S.scrape = 0.35;
        S.vx = 0;
        S.load = Math.max(S.load, 0.8);
        S.shake = Math.max(S.shake, 0.25);
      }
    }
    S.yaw += (0.5 * Math.atan2(S.vx, Math.max(S.speed, 4)) - S.yaw) * (1 - Math.exp(-8 * dt));
    if (sy > 0.5 && !S.upHeld) horn();
    S.upHeld = sy > 0.5;
    S.s += S.speed * dt;
    moveAll(dt);

    const mine = TRUCK_COLS.map(c => ({ a: onRoad(c.a), b: onRoad(c.b), r: c.r }));
    const bladeZ = S.s + BLADE.z + 0.3;
    for (const d of S.deb) {
      if (Math.abs(d.z - S.s) > d.reach + 3 || (d.leap && !d.live)) continue;
      if (d.harmless) {
        // A drift: plow through it.
        if (!d.plowed && Math.abs(d.z - bladeZ) < 1 && Math.abs(d.x - S.x) < BLADE.w + d.parts[0].scl[0] * 0.6) {
          d.plowed = true;
          const k = Math.min(1, d.parts[0].scl[1] * d.parts[0].scl[0] / 1.6);
          S.load = 1; S.shake = Math.max(S.shake, 0.45 * k);
          events.plow(k);
        }
        continue;
      }
      for (const c of colliders(d)) {
        for (const m of mine) {
          const dist = segDist(m.a, m.b, c.a, c.b) - c.r - m.r;
          if (dist < HIT_R) return die(d.kind);
          if (dist < d.minD) {
            d.minD = dist;
            d.side = Math.sign((c.a[0] + c.b[0]) / 2 - S.x);
          }
        }
      }
      if (!d.missed && d.z + d.reach < S.s && d.minD < MISS_R) {
        d.missed = true;
        events.nearMiss(d.side || 0, 1 - d.minD / MISS_R);
      }
    }
  }

  function common(dt) {
    S.T += dt;
    S.flash = Math.max(0, S.flash - dt * 2.5);
    S.shake = Math.max(0, S.shake - dt * 2);
    S.hornCool = Math.max(0, S.hornCool - dt);
    S.honk = Math.max(0, S.honk - dt);
    S.scrape = Math.max(0, S.scrape - dt);
    const rate = S.fadeTo > S.fade ? 2.4 : 4;
    S.fade += (S.fadeTo - S.fade) * (1 - Math.exp(-dt * rate));
    // The blade always carries some snow; more just after a drift.
    S.load += ((S.mode === 'run' ? 0.35 : S.mode === 'title' ? 0.25 : 0) - S.load) * (1 - Math.exp(-dt * 1.2));
    const was = S.wiper;
    S.wiper = (S.wiper + dt) % WIPE_CYCLE;
    if (S.wiper < was) events.wipe();
  }

  function update(dt) {
    if (S.paused) return;
    common(dt);

    if (S.nudge[0]) {
      S.x = clamp(S.x + S.nudge[0], -X_MAX, X_MAX);
      S.vx = S.nudge[0] / Math.max(dt, 1 / 120) * 0.5;
      S.nudge = [0, 0];
    }

    if (S.mode === 'title' || S.mode === 'over') {
      const target = S.mode === 'title' ? 9 : 0;
      S.speed += (target - S.speed) * (1 - Math.exp(-dt * (S.mode === 'title' ? 1 : 3)));
      S.s += S.speed * dt;
      if (S.mode === 'title') {
        // Wander gently round the middle lane.
        const want = 1.2 * Math.sin(S.T * 0.17);
        S.vx = (want - S.x) * 0.6;
        S.x += S.vx * dt;
        S.yaw = 0.5 * Math.atan2(S.vx, Math.max(S.speed, 4));
      }
      S.roll *= Math.exp(-dt * 2);
      moveAll(dt);
      return;
    }

    if (S.mode === 'dying') {
      S.deathT += dt;
      S.bounce *= Math.exp(-dt * 5);
      S.s -= S.bounce * dt;
      S.lurch *= Math.exp(-dt * 3);
      S.roll += dt * 2.5 * Math.exp(-S.deathT * 3) * (S.kind === 'tire' ? 0.3 : 1);
      moveAll(dt);
      if (S.deathT > 1.3) {
        S.mode = 'over';
        events.over(S.kind, meters());
      }
      return;
    }

    S.runT += dt;
    S.speed += (rideSpeed(S.runT) - S.speed) * (1 - Math.exp(-dt * 0.8));
    let rem = dt;
    while (rem > 1e-6 && S.mode === 'run') {
      const h = Math.min(rem, 1 / 120);
      step(h);
      rem -= h;
    }
    if (S.mode !== 'run') return;
    while (S.next < S.s + SPAWN_D) spawn();
    S.deb = S.deb.filter(d => d.z + d.reach > S.s - 6 && d.z < S.s + SPAWN_D + 60);
    for (const d of S.deb) {
      if (!d.seen && d.z - S.s < 50) {
        d.seen = true;
        if (!seen[d.kind]) { seen[d.kind] = true; events.approach(d.kind); }
      }
    }
    events.progress(meters());
  }

  // ---- camera ---------------------------------------------------------------
  // Your truck's frame at depth sAbs, x across and turned by yaw, relative
  // to `origin` so numbers stay small: where it is and its axes.
  function frameAt(sAbs, x, yaw, origin) {
    const [cx, cy] = pathXY(sAbs);
    const [dx, dy] = pathD(sAbs);
    const fz = norm(qRot(qAxis(Y_AXIS, yaw), norm([dx, dy, 1])));
    const fx = norm(cross(Y_AXIS, fz));
    const fy = cross(fz, fx);
    return { o: [cx + x, cy, sAbs - origin], fx, fy, fz, cx, cy };
  }
  const at = (F, p) => add(F.o, add(add(scale(F.fx, p[0]), scale(F.fy, p[1])), scale(F.fz, p[2])));

  // The view from the driver's seat, looking down the road and a touch
  // down onto the blade. The cab rocks a little on its springs.
  function eyeAt(F, roll, jolt) {
    const eye = add(at(F, EYE), jolt);
    const target = add(at(F, [EYE[0], 1.25 - 1.5 * S.lurch, 16]), jolt);
    const fwd = norm(sub(target, eye));
    const up = qRot(qAxis(fwd, roll), F.fy);
    return { eye, target, up, fwd };
  }

  function camera(reduceMotion) {
    const sway = reduceMotion ? 0 : 0.006 * Math.sin(S.T * 1.3) + 0.004 * Math.sin(S.T * 2.9 + 1);
    const roll = sway - (reduceMotion ? 0 : S.vx * 0.006) + S.roll;
    const sh = reduceMotion ? 0 : S.shake * S.shake * 0.12 + (S.mode === 'run' ? 0.004 + S.load * 0.006 : 0);
    const jolt = [(Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0];
    const F = frameAt(S.s, S.x, S.yaw, S.s);
    const now = eyeAt(F, roll, jolt);
    // Streaks: where the camera was STREAK seconds ago.
    const Fw = frameAt(S.s - S.speed * STREAK, S.x - S.vx * STREAK, S.yaw, S.s);
    const was = eyeAt(Fw, roll, jolt);
    S.eye = now.eye;
    S.frame = F;
    return { now, was, truck: F };
  }

  // Things as drawable parts: position relative to the eye's depth, turn,
  // size, where the road is under them, and how they move; and the lamps
  // glowing through the snow.
  function parts() {
    const out = [];
    const lamps = [];
    out.lamps = lamps;
    const F = S.frame || frameAt(S.s, S.x, S.yaw, S.s);
    const qT = qFromBasis(F.fx, F.fy, F.fz);
    const road = [0, 1, F.cy, 1];
    // Your blade, its marker rods, and the snow rolling off it.
    out.push({ mesh: MESH.BLADE, mat: 0, seed: 0.5, pos: F.o, q: qT, scl: [1, 1, 1], rad: road, anim: [0, 0, 0.6, 0] });
    for (const e of BLADE_ENDS) out.push({ mesh: MESH.ROD, mat: 0, seed: 0.5, pos: at(F, add(e, [0, 0, -0.08])), q: qT, scl: [1, 1, 1], rad: road, anim: [0, 0, 0, 0] });
    const L = S.load;
    if (L > 0.02) {
      out.push({
        mesh: MESH.ROLL, mat: MAT.SNOW, seed: 0.5, pos: at(F, turnBlade([0, 0.6, BLADE.z + 1.2])), q: qMul(qT, qAxis(Y_AXIS, BLADE_YAW)),
        scl: [BLADE.w * 0.97, 0.38 + 0.8 * L, 0.6], rad: road, anim: [0, 0, 1, L],
      });
    }
    // Reflector posts down both edges of the road, every 30 m.
    const first = Math.ceil((S.s - 4) / 30) * 30;
    for (let z = first; z < S.s + 95; z += 30) {
      const [cx, cy] = pathXY(z);
      const yaw = Math.atan(pathD(z)[0]);
      for (const side of [-1, 1]) {
        const x = side * (ROAD_W + 0.5), y = bankH(x, z);
        const pos = [cx + x, cy + y + 0.6, z - S.s];
        out.push({ mesh: MESH.BOXS, mat: MAT.POST, seed: (z * 0.013 + side) % 1, pos, q: qAxis(Y_AXIS, yaw), scl: [0.05, 0.6, 0.05], rad: [0, 1, cy, 1], anim: [0, 0, 0.8, 0] });
        lamps.push({ pos: add(pos, [0, 0.48, -0.06]), k: 0, reflector: true });
      }
    }
    for (const d of S.deb) {
      if (d.z - S.s > SPAWN_D + d.reach) continue;
      const [cx, cy] = pathXY(d.z);
      const qd = qMul(qAxis(Y_AXIS, Math.atan(pathD(d.z)[0])), d.q);
      const rad = [0, 1, cy, 1];
      for (const p of d.parts) {
        let q = p.rot || ONE, off = p.off;
        if (p.flap) {
          const f = qAxis(p.flap.axis, p.flap.base + p.flap.amp * Math.sin(p.flap.w * S.T + p.flap.ph));
          q = qMul(f, q);
          off = add(p.flap.pivot, qRot(f, sub(off, p.flap.pivot)));
        }
        const o = qRot(qd, off);
        let scl = p.scl || [1, 1, 1];
        if (p.shrink != null) scl = [scl[0], scl[1] * p.shrink, scl[2]];
        out.push({
          mesh: p.mesh, mat: p.mat ?? 0, seed: d.seed,
          pos: [cx + d.x + o[0], cy + d.y + o[1], d.z - S.s + o[2]],
          q: qMul(qd, q), scl, rad, anim: [d.legs, d.glow, d.snow, 0],
        });
      }
      for (const l of d.lamps) {
        const o = qRot(qd, l.at);
        lamps.push({ pos: [cx + d.x + o[0], cy + d.y + o[1], d.z - S.s + o[2]], k: l.tail ? d.glow || 0.4 : 0.55, marker: l.marker });
      }
    }
    return out;
  }

  return {
    S, start, setPaused, nudge, horn, update, camera, parts, meters, spawn, passable,
    things: { robot, walker, leaper, car, spinner, buried, drift, looseTire, jackknife, crew },
  };
}
