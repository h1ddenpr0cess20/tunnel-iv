// Meshes for the things on the highway: robots (standing, or bent over a
// shovel) and their arms holding snow shovels, a car, a loose tire, your
// plow's blade and its marker rods, the snow rolling off the blade, a snow
// drift, and a plain sphere and boxes. Limbs are swept along splines
// through a few control points, each with its own radii, so they taper
// and swell; car bodies are lofted through rounded sections. One
// interleaved buffer of position, normal, cavity (1 open, less where
// tucked away) and region (which part of a thing a vertex is on: see
// things.wgsl), unindexed, and where each mesh starts in it. Everything is
// in metres, facing +z, standing on y = 0.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const spow = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);

// A mesh is a list of triangles, each three vertices of [position, normal, cavity, region].
const V = (p, n, c = 1, r = 0) => [p, n, c, r];

// Regions: things.wgsl picks a finish for each. Robot legs swing from
// the hip, and the snow off the blade churns, in the vertex shader.
export const REGION = {
  SHELL: 1, BLACK: 2, HEAD: 3, LEG_L: 4, LEG_R: 5, TORSO: 6, VISOR: 7, STRIP: 8,
  HANDLE: 10, SCOOP: 11,
  BODY: 20, CABIN: 21, TIRE: 22, RIM: 23,
  BLADE: 30, FRAME: 31, ROD: 32, TIP: 33,
  ROLL: 40, MOUND: 41,
};
export const HIP_Y = 0.92;   // where a robot's legs swing from

// Catmull-Rom through control points of any length.
function spline(pts, per) {
  const out = [];
  const cr = (p0, p1, p2, p3, t) => p1.map((_, i) => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t
    + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t * t + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t * t * t));
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) out.push(cr(p0, pts[i], pts[i + 1], p3, k / per));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// A tube swept along control points [x, y, z, ra, rb]: an ellipse ra across
// `side` and rb across the other way, smoothly interpolated, with rounded
// caps on both ends.
function sweep(tris, ctrl, { region = 0, segs = 14, per = 4, side = [0, 1, 0], caps = 4, cav = 1 } = {}) {
  const S = spline(ctrl, per);
  const n = S.length;
  const C = S.map(q => q.slice(0, 3)), R = S.map(q => [Math.max(q[3], 1e-4), Math.max(q[4], 1e-4)]);
  const D = C.map((_, i) => norm(sub(C[Math.min(i + 1, n - 1)], C[Math.max(i - 1, 0)])));
  let u = cross(D[0], side);
  if (Math.hypot(...u) < 1e-3) u = cross(D[0], [1, 0, 0]);
  u = norm(u);
  const rings = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) u = norm(sub(u, scale(D[i], dot(u, D[i]))));
    const v = cross(D[i], u);
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const len = Math.hypot(...sub(C[b], C[a])) || 1;
    const slope = ((R[b][0] + R[b][1]) - (R[a][0] + R[a][1])) / 2 / len;
    rings.push({ c: C[i], u, v, ra: R[i][0], rb: R[i][1], na: R[i][0], nb: R[i][1], d: D[i], tilt: Math.atan(-slope) });
  }
  // Caps: rings shrinking round the ends, normals turning to point out of them.
  const capRings = (r, dir, back) => {
    const out = [];
    for (let k = 1; k <= caps; k++) {
      const phi = (k / caps) * Math.PI / 2;
      const reach = Math.min(r.ra, r.rb);
      out.push({ ...r, c: add(r.c, scale(dir, reach * Math.sin(phi))), ra: r.ra * Math.cos(phi), rb: r.rb * Math.cos(phi), tilt: back ? -phi : phi });
    }
    return out;
  };
  const all = [...capRings(rings[0], scale(rings[0].d, -1), true).reverse(), ...rings, ...capRings(rings[n - 1], rings[n - 1].d, false)];
  const ringPts = all.map(r => Array.from({ length: segs + 1 }, (_, j) => {
    const th = (j / segs) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    const p = add(r.c, add(scale(r.u, r.ra * c), scale(r.v, r.rb * s)));
    const radial = norm(add(scale(r.u, c / r.na), scale(r.v, s / r.nb)));
    const nn = norm(add(scale(radial, Math.cos(r.tilt)), scale(r.d, Math.sin(r.tilt))));
    return V(p, nn, cav, region);
  }));
  for (let i = 0; i < ringPts.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = ringPts[i][j], b = ringPts[i + 1][j], c = ringPts[i + 1][j + 1], d = ringPts[i][j + 1];
      tris.push([a, b, c], [a, c, d]);
    }
  }
}

// A surface over a polar grid: f(r, θ) gives a point; normals smoothed,
// facing away from `inside`.
function polar(tris, rows, segs, f, inside, region) {
  const P = [];
  for (let i = 0; i <= rows; i++) P.push(Array.from({ length: segs + 1 }, (_, j) => f(i / rows, (j / segs) * Math.PI * 2)));
  const N = P.map(row => row.map(() => [0, 0, 0]));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < segs; j++) {
      const fN = cross(sub(P[i + 1][j], P[i][j]), sub(P[i][j + 1], P[i][j]));
      for (const [a, b] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) N[a][b] = add(N[a][b], fN);
    }
  }
  // The seam: both sides share a normal.
  for (let i = 0; i <= rows; i++) { const s = add(N[i][0], N[i][segs]); N[i][0] = s; N[i][segs] = s; }
  const vx = (i, j) => {
    let nn = norm(N[i][j]);
    if (Math.hypot(...N[i][j]) < 1e-9) nn = norm(sub(P[i][j], inside));
    if (dot(nn, sub(P[i][j], inside)) < 0) nn = scale(nn, -1);
    return V(P[i][j], nn, 1, region);
  };
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < segs; j++) tris.push([vx(i, j), vx(i + 1, j), vx(i + 1, j + 1)], [vx(i, j), vx(i + 1, j + 1), vx(i, j + 1)]);
  }
}

function icosphere(level) {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map(norm);
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let i = 0; i < level; i++) {
    const cache = new Map();
    const mid = (a, b) => {
      const k = a < b ? a * 65536 + b : b * 65536 + a;
      if (!cache.has(k)) cache.set(k, v.push(norm(v[a].map((c, j) => (c + v[b][j]) / 2))) - 1);
      return cache.get(k);
    };
    f = f.flatMap(([a, b, c]) => {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
    });
  }
  return { v, f };
}

function sphere() {
  const { v, f } = icosphere(3);
  return f.map(t => t.map(i => V(v[i], v[i])));
}

// A box with rounded edges.
function roundedBox(b = 0.35) {
  const us = [-1, -0.95, -0.85, -0.7, -0.35, 0, 0.35, 0.7, 0.85, 0.95, 1];
  const tris = [];
  const shape = p => {
    const c = p.map(x => Math.max(-(1 - b), Math.min(1 - b, x)));
    const n = norm(sub(p, c));
    return V(c.map((x, i) => x + b * n[i]), n);
  };
  for (let axis = 0; axis < 3; axis++) {
    for (const side of [-1, 1]) {
      const at = (i, j) => {
        const p = [0, 0, 0];
        p[axis] = side; p[(axis + 1) % 3] = us[i]; p[(axis + 2) % 3] = us[j];
        return shape(p);
      };
      for (let i = 0; i < us.length - 1; i++) {
        for (let j = 0; j < us.length - 1; j++) {
          const a = at(i, j), bb = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
          tris.push([a, bb, c], [a, c, d]);
        }
      }
    }
  }
  return tris;
}


// A surface over a grid: f(u, v) with u round and v along, both 0 to 1,
// gives a point. Normals are smoothed and face away from the middle of
// each row (`round` closes it into a loop, and caps both ends).
function grid(tris, rows, cols, f, { region = 0, round = true } = {}) {
  const P = [];
  for (let i = 0; i <= rows; i++) P.push(Array.from({ length: cols + 1 }, (_, j) => f(j / cols, i / rows)));
  const N = P.map(row => row.map(() => [0, 0, 0]));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const fN = cross(sub(P[i][j + 1], P[i][j]), sub(P[i + 1][j], P[i][j]));
      for (const [a, b] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) N[a][b] = add(N[a][b], fN);
    }
  }
  if (round) for (let i = 0; i <= rows; i++) { const s = add(N[i][0], N[i][cols]); N[i][0] = s; N[i][cols] = s; }
  const mid = P.map(row => scale(row.slice(0, cols).reduce(add, [0, 0, 0]), 1 / cols));
  const vx = (i, j) => {
    let nn = norm(N[i][j]);
    if (round && dot(nn, sub(P[i][j], mid[i])) < 0) nn = scale(nn, -1);
    return V(P[i][j], nn, 1, region);
  };
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) tris.push([vx(i, j), vx(i + 1, j), vx(i + 1, j + 1)], [vx(i, j), vx(i + 1, j + 1), vx(i, j + 1)]);
  }
  if (round) {
    for (const [i, s] of [[0, -1], [rows, 1]]) {
      const n = norm(scale(sub(mid[Math.min(rows, 1)], mid[0]), s));
      for (let j = 0; j < cols; j++) tris.push([V(mid[i], n, 1, region), V(P[i][j], n, 1, region), V(P[i][j + 1], n, 1, region)]);
    }
  }
}

// A thin plate over f(u, v), th thick, both faces shaded.
function plate(tris, f, { nu = 8, nv = 8, th = 0.006, region = 0 } = {}) {
  const P = [];
  for (let i = 0; i <= nv; i++) P.push(Array.from({ length: nu + 1 }, (_, j) => f(j / nu, i / nv)));
  const N = P.map(row => row.map(() => [0, 0, 0]));
  for (let i = 0; i < nv; i++) {
    for (let j = 0; j < nu; j++) {
      const fN = cross(sub(P[i][j + 1], P[i][j]), sub(P[i + 1][j], P[i][j]));
      for (const [a, b] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) N[a][b] = add(N[a][b], fN);
    }
  }
  for (const side of [1, -1]) {
    const vx = (i, j) => { const n = scale(norm(N[i][j]), side); return V(add(P[i][j], scale(n, th)), n, 1, region); };
    for (let i = 0; i < nv; i++) {
      for (let j = 0; j < nu; j++) tris.push([vx(i, j), vx(i + 1, j), vx(i + 1, j + 1)], [vx(i, j), vx(i + 1, j + 1), vx(i, j + 1)]);
    }
  }
}

// A ring R round axis `ax` (unit, through c), r thick: a tire.
function torus(tris, c, ax, R, r, region, segU = 24, segV = 10) {
  const e1 = norm(cross(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = cross(ax, e1);
  const pt = (u, v) => {
    const rad = add(scale(e1, Math.cos(u)), scale(e2, Math.sin(u)));
    // Squarer than a doughnut: a tire's tread is flat.
    const n = norm(add(scale(rad, spow(Math.cos(v), 0.6)), scale(ax, spow(Math.sin(v), 0.6))));
    return V(add(c, add(scale(rad, R + r * spow(Math.cos(v), 0.5)), scale(ax, r * 0.9 * spow(Math.sin(v), 0.5)))), n, 1, region);
  };
  for (let i = 0; i < segU; i++) {
    for (let j = 0; j < segV; j++) {
      const u0 = (i / segU) * Math.PI * 2, u1 = ((i + 1) / segU) * Math.PI * 2;
      const v0 = (j / segV) * Math.PI * 2, v1 = ((j + 1) / segV) * Math.PI * 2;
      tris.push([pt(u0, v0), pt(u1, v0), pt(u1, v1)], [pt(u0, v0), pt(u1, v1), pt(u0, v1)]);
    }
  }
}

// A disc of radius r facing n, at c: a wheel's rim.
function disc(tris, c, n, r, region) {
  const e1 = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = cross(n, e1);
  // Dished: the hub stands proud of the rim.
  polar(tris, 4, 20, (k, th) => add(c, add(add(scale(e1, r * k * Math.cos(th)), scale(e2, r * k * Math.sin(th))), scale(n, 0.03 * (1 - k * k)))),
    sub(c, scale(n, 0.2)), region);
}

// Move and turn a list of triangles: about the x axis through pivot by `a`.
function turnX(tris, pivot, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const r = v => [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
  return tris.map(t => t.map(([p, n, cv, rg]) => V(add(pivot, r(sub(p, pivot))), r(n), cv, rg)));
}
function turnY(tris, pivot, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const r = v => [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  return tris.map(t => t.map(([p, n, cv, rg]) => V(add(pivot, r(sub(p, pivot))), r(n), cv, rg)));
}

// ---- robots -------------------------------------------------------------------
// A humanoid robot about 1.73 m tall: glossy white shells over black
// joints, a black waist and hips, a smooth helmet with a black glass face.
// Bent over a shovel, everything above the hips leans forward by `lean`.
const ROBOT_PIVOT = [0, 0.95, 0];
const LEAN = 0.6;
const shoulder = (sx, lean) => {
  const p = sub([sx * 0.235, 1.37, 0], ROBOT_PIVOT), c = Math.cos(lean), s = Math.sin(lean);
  return add(ROBOT_PIVOT, [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]);
};

function robotBody(lean) {
  const tris = [];
  const R = REGION;
  // Legs: feet, shins, knees and thighs, each in its own region so they can swing.
  for (const sx of [-1, 1]) {
    const x = sx * 0.11, region = sx < 0 ? R.LEG_L : R.LEG_R;
    sweep(tris, [[x, 0.045, -0.09, 0.05, 0.04], [x, 0.05, 0.04, 0.056, 0.045], [x, 0.035, 0.16, 0.046, 0.026]], { region, side: [0, 1, 0], segs: 10 });
    sweep(tris, [[x, 0.08, 0, 0.045, 0.048], [x, 0.24, 0.006, 0.06, 0.066], [x, 0.4, 0.012, 0.056, 0.062], [x, 0.49, 0.016, 0.05, 0.055]],
      { region, side: [0, 0, 1], segs: 12 });
    sweep(tris, [[x, 0.47, 0.02, 0.063, 0.063], [x, 0.56, 0.02, 0.063, 0.063]], { region, side: [0, 0, 1], segs: 12 });
    sweep(tris, [[x, 0.55, 0.016, 0.064, 0.07], [x, 0.72, 0.01, 0.08, 0.086], [x, 0.89, 0, 0.09, 0.096]], { region, side: [0, 0, 1], segs: 12 });
  }
  sweep(tris, [[-0.15, 0.93, 0, 0.085, 0.09], [0.15, 0.93, 0, 0.085, 0.09]], { region: R.BLACK, side: [0, 1, 0], segs: 14, caps: 3 });
  // Above the hips: waist, torso, neck, shoulders and head.
  const up = [];
  sweep(up, [[0, 0.95, 0, 0.09, 0.12], [0, 1.1, 0, 0.085, 0.115]], { region: R.BLACK, side: [1, 0, 0], segs: 14 });
  sweep(up, [[0, 1.06, 0.005, 0.1, 0.13], [0, 1.18, 0.015, 0.12, 0.16], [0, 1.3, 0.02, 0.13, 0.19], [0, 1.39, 0.01, 0.12, 0.2], [0, 1.45, 0, 0.08, 0.12]],
    { region: R.TORSO, side: [1, 0, 0], segs: 20 });
  sweep(up, [[0, 1.42, 0, 0.045, 0.045], [0, 1.53, 0.01, 0.042, 0.042]], { region: R.BLACK, side: [1, 0, 0], segs: 10 });
  for (const sx of [-1, 1]) sweep(up, [[sx * 0.2, 1.37, 0, 0.068, 0.068], [sx * 0.26, 1.37, 0, 0.068, 0.068]], { region: R.BLACK, side: [0, 1, 0], segs: 12 });
  // The head: a smooth helmet, its front a black glass face with a faint
  // strip of light across it.
  const hd = icosphere(4), hc = [0, 1.63, 0.015], hr = [0.095, 0.12, 0.11];
  const face = v => v[2] > 0.3 && Math.abs(v[1] + 0.12) < 0.06 ? R.STRIP : v[2] > 0.05 && v[1] > -0.72 && v[1] < 0.62 ? R.VISOR : R.HEAD;
  for (const t of hd.f) {
    const c = norm(t.reduce((m, i) => add(m, hd.v[i]), [0, 0, 0]));
    up.push(t.map(i => {
      const v = hd.v[i];
      return V(add(hc, [v[0] * hr[0], v[1] * hr[1], v[2] * hr[2]]), norm([v[0] / hr[0], v[1] / hr[1], v[2] / hr[2]]), 1, face(c));
    }));
  }
  tris.push(...turnX(up, ROBOT_PIVOT, lean));
  return tris;
}

// An arm from shoulder S reaching for hand H, bending its elbow towards
// `pole`: white upper arm and forearm, black elbow and hand.
function arm(tris, S, H, pole) {
  const L = 0.31;
  let d = sub(H, S), len = Math.hypot(...d);
  if (len > 2 * L - 0.01) { d = scale(d, (2 * L - 0.01) / len); len = 2 * L - 0.01; }
  const dir = norm(d), W = add(S, d);
  const out = norm(sub(pole, scale(dir, dot(pole, dir))));
  const E = add(add(S, scale(dir, len / 2)), scale(out, Math.sqrt(Math.max(0, L * L - len * len / 4))));
  sweep(tris, [[...S, 0.052, 0.052], [...lerp(S, E, 0.5), 0.048, 0.05], [...E, 0.04, 0.042]], { region: REGION.SHELL, segs: 10 });
  sweep(tris, [[...E, 0.046, 0.046], [...add(E, scale(norm(sub(W, E)), 0.03)), 0.046, 0.046]], { region: REGION.BLACK, segs: 10 });
  sweep(tris, [[...E, 0.042, 0.042], [...lerp(E, W, 0.4), 0.044, 0.04], [...W, 0.032, 0.03]], { region: REGION.SHELL, segs: 10 });
  const hd = norm(sub(W, E));
  sweep(tris, [[...W, 0.035, 0.022], [...add(W, scale(hd, 0.06)), 0.042, 0.024], [...add(W, scale(hd, 0.1)), 0.03, 0.02]], { region: REGION.BLACK, segs: 8 });
}

// A snow shovel: a shaft from the grip G down to the neck N, a D-handle
// on the grip, and a wide scoop carrying on past the neck, flatter.
function shovel(tris, G, N) {
  const dir = norm(sub(N, G));
  const across = norm(cross(dir, [0, 1, 0]));
  sweep(tris, [[...G, 0.017, 0.017], [...N, 0.017, 0.017]], { region: REGION.HANDLE, segs: 8, per: 1, caps: 2 });
  const top = sub(G, scale(dir, 0.13));
  for (const k of [-1, 1]) sweep(tris, [[...G, 0.012, 0.012], [...add(top, scale(across, 0.065 * k)), 0.012, 0.012]], { region: REGION.HANDLE, segs: 6, per: 1, caps: 2 });
  sweep(tris, [[...add(top, scale(across, -0.075)), 0.016, 0.016], [...add(top, scale(across, 0.075)), 0.016, 0.016]], { region: REGION.HANDLE, segs: 6, per: 1, caps: 2 });
  const sd = norm([dir[0], dir[1] * 0.25, dir[2]]);
  const up = norm(cross(across, sd));
  plate(tris, (u, v) => {
    const x = (u - 0.5) * 0.46;
    // Curled up at the sides and the back; a lip at the front edge.
    const curl = 0.05 * Math.pow(Math.abs(x) / 0.23, 3) + 0.06 * Math.pow(1 - v, 4);
    return add(add(add(N, scale(sd, v * 0.42)), scale(across, x)), scale(up, curl));
  }, { nu: 10, nv: 8, th: 0.006, region: REGION.SCOOP });
}

// Both arms and the shovel, for a robot bent over shovelling: the scoop
// on the road ahead of it.
function shovelArms() {
  const tris = [];
  const G = [0.13, 1.0, 0.33], N = [-0.1, 0.07, 1.02];
  shovel(tris, G, N);
  arm(tris, shoulder(1, LEAN), add(G, [0.03, 0, -0.02]), [1, 0.2, -0.3]);
  arm(tris, shoulder(-1, LEAN), lerp(G, N, 0.26), [-1, 0.3, 0]);
  return tris;
}

// Both arms and the shovel, carried over the right shoulder, scoop behind.
function carryArms() {
  const tris = [];
  const G = [0.1, 1.1, 0.34], N = [0.27, 1.62, -0.42];
  shovel(tris, G, N);
  arm(tris, shoulder(1, 0), G, [1, -0.2, -0.5]);
  arm(tris, shoulder(-1, 0), add(G, [-0.12, -0.04, 0.02]), [-1, -0.3, 0]);
  return tris;
}

// ---- cars -------------------------------------------------------------------
// A sedan 4.6 m long: a body lofted through rounded sections, full at
// the shoulder and tucked in at the sills, with arches cut over the
// wheels, a low nose and a short tail; a cabin of glass and pillars on
// top, raked front and back; mirrors; four wheels. Lights and trim are
// painted on in the shader.
const AXLES = [-1.42, 1.4];
function car() {
  const tris = [];
  const L = 4.6;
  grid(tris, 48, 32, (u, v) => {
    const z = -L / 2 + L * v;
    // The nose tapers and rounds off; the tail is blunter, cut off squarer.
    const end = Math.pow(Math.sin(Math.PI * (0.025 + 0.95 * v)), v < 0.5 ? 0.1 : 0.3);
    // The top: trunk, the deck under the windows, and the hood dropping to the nose.
    const top = v < 0.18 ? 0.9 + 0.09 * smooth(0, 0.18, v) : v < 0.68 ? 0.99 - 0.06 * smooth(0.55, 0.68, v) : 0.93 - 0.13 * Math.pow((v - 0.68) / 0.32, 1.6);
    // The bottom: up over each wheel.
    let yb = 0.24;
    for (const az of AXLES) yb = Math.max(yb, 0.24 + 0.42 * Math.sqrt(Math.max(0, 1 - ((z - az) / 0.46) ** 2)));
    const th = u * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
    const y = sn < 0 ? yb + (0.55 - yb) * (1 - Math.pow(-sn, 0.35)) : 0.55 + (top - 0.55) * Math.pow(sn, 0.35);
    // Fullest at the shoulder, tucked in at the sills.
    const k = (y - 0.24) / Math.max(top - 0.24, 0.1);
    const hw = 0.9 * end * (0.93 + 0.07 * Math.sin(Math.PI * Math.min(1, k * 1.25)));
    return [hw * spow(c, 0.4), y, z];
  }, { region: REGION.BODY });
  grid(tris, 36, 28, (u, v) => {
    const z = -1.55 + 2.75 * v;
    const rise = smooth(0, 0.28, v) * (1 - smooth(0.52, 1, v));
    const yb = 0.9, yt = 0.92 + 0.52 * rise;
    const th = u * Math.PI * 2;
    const f = 0.5 + 0.5 * spow(Math.sin(th), 0.4);
    return [(0.82 - 0.16 * f) * spow(Math.cos(th), 0.3), yb + (yt - yb) * f, z];
  }, { region: REGION.CABIN });
  for (const sx of [-1, 1]) {
    sweep(tris, [[sx * 0.8, 0.95, 0.66, 0.025, 0.02], [sx * 0.95, 0.99, 0.6, 0.05, 0.04], [sx * 1.0, 1.0, 0.58, 0.04, 0.035]],
      { region: REGION.BODY, side: [0, 1, 0], segs: 8 });
    for (const z of AXLES) {
      const c = [sx * 0.76, 0.33, z], n = [sx, 0, 0];
      torus(tris, c, [1, 0, 0], 0.21, 0.115, REGION.TIRE, 28, 10);
      // A dark dish behind five spokes and a hub cap.
      disc(tris, [sx * 0.8, 0.33, z], n, 0.18, REGION.BLACK);
      disc(tris, [sx * 0.83, 0.33, z], n, 0.19, REGION.RIM);
      for (let k = 0; k < 5; k++) {
        const th = (k / 5) * Math.PI * 2;
        const rim = [sx * 0.845, 0.33 + 0.16 * Math.cos(th), z + 0.16 * Math.sin(th)];
        sweep(tris, [[sx * 0.85, 0.33, z, 0.02, 0.02], [...rim, 0.016, 0.016]], { region: REGION.BLACK, segs: 6, per: 1, caps: 2 });
      }
      sweep(tris, [[sx * 0.84, 0.33, z, 0.05, 0.05], [sx * 0.87, 0.33, z, 0.04, 0.04]], { region: REGION.RIM, side: [0, 1, 0], segs: 10, per: 1, caps: 2 });
    }
  }
  // Bumpers wrapping the nose and the tail, and a dark grille in the nose.
  for (const [s, y] of [[1, 0.4], [-1, 0.45]]) {
    sweep(tris, [[-0.74, y, s * 1.86, 0.07, 0.06], [-0.6, y, s * 2.1, 0.07, 0.06], [-0.3, y, s * 2.24, 0.07, 0.06],
      [0.3, y, s * 2.24, 0.07, 0.06], [0.6, y, s * 2.1, 0.07, 0.06], [0.74, y, s * 1.86, 0.07, 0.06]],
      { region: REGION.BLACK, side: [0, 1, 0], segs: 8, per: 4, caps: 3 });
  }
  sweep(tris, [[-0.32, 0.56, 2.26, 0.04, 0.04], [0.32, 0.56, 2.26, 0.04, 0.04]], { region: REGION.BLACK, side: [0, 1, 0], segs: 8, per: 1, caps: 2 });
  sweep(tris, [[-0.32, 0.52, 2.25, 0.04, 0.04], [0.32, 0.52, 2.25, 0.04, 0.04]], { region: REGION.BLACK, side: [0, 1, 0], segs: 8, per: 1, caps: 2 });
  // Door handles and a roof antenna.
  for (const sx of [-1, 1]) for (const z of [-0.45, 0.65]) {
    sweep(tris, [[sx * 0.9, 0.8, z - 0.1, 0.018, 0.018], [sx * 0.93, 0.8, z + 0.1, 0.018, 0.018]], { region: REGION.BLACK, segs: 6, per: 1, caps: 2 });
  }
  sweep(tris, [[0.3, 1.38, -1.1, 0.01, 0.01], [0.38, 1.62, -1.5, 0.006, 0.006]], { region: REGION.BLACK, segs: 6, per: 1, caps: 2 });
  // The axles, between each pair of wheels.
  for (const z of AXLES) sweep(tris, [[-0.76, 0.33, z, 0.05, 0.05], [0.76, 0.33, z, 0.05, 0.05]], { region: REGION.FRAME, side: [0, 1, 0], segs: 10, per: 1, caps: 2 });
  return tris;
}

// A bare axle, 2 m between wheel centres along x, for a semi's tires.
function axle() {
  const tris = [];
  sweep(tris, [[-1, 0, 0, 0.06, 0.06], [1, 0, 0, 0.06, 0.06]], { region: REGION.FRAME, side: [0, 1, 0], segs: 10, per: 1, caps: 2 });
  return tris;
}

// A loose tire, rolling along z on its tread.
function tire() {
  const tris = [];
  torus(tris, [0, 0, 0], [1, 0, 0], 0.24, 0.13, REGION.TIRE, 24, 10);
  for (const sx of [-1, 1]) disc(tris, [sx * 0.06, 0, 0], [sx, 0, 0], 0.22, REGION.RIM);
  return tris;
}

// ---- your plow ----------------------------------------------------------------
// The blade in your truck's frame: a moldboard 3.8 m wide, curling
// forward at the top, angled so the right end trails and the snow runs
// off that way; ribs down its back, push arms and a lift ram back to the truck.
export const BLADE_YAW = 0.26;
function blade(B) {
  const tris = [];
  const prof = y => B.z + 0.4 * Math.pow(y / B.h, 2.2);   // how far forward the face is at height y
  plate(tris, (u, v) => {
    const y = 0.04 + v * (B.h - 0.04);
    return [(u - 0.5) * 2 * B.w, y, prof(y)];
  }, { nu: 16, nv: 10, th: 0.03, region: REGION.BLADE });
  sweep(tris, [[-B.w, B.h, prof(B.h) + 0.02, 0.045, 0.045], [B.w, B.h, prof(B.h) + 0.02, 0.045, 0.045]], { region: REGION.BLADE, side: [0, 1, 0], segs: 10, per: 1 });
  sweep(tris, [[-B.w, 0.05, B.z, 0.05, 0.04], [B.w, 0.05, B.z, 0.05, 0.04]], { region: REGION.FRAME, side: [0, 1, 0], segs: 8, per: 1 });
  for (let k = -2; k <= 2; k++) {
    const x = k * B.w * 0.45;
    sweep(tris, [[x, 0.1, prof(0.1) - 0.06, 0.03, 0.07], [x, 0.55, prof(0.55) - 0.08, 0.03, 0.08], [x, B.h - 0.3, prof(B.h - 0.3) - 0.04, 0.03, 0.03]],
      { region: REGION.FRAME, side: [1, 0, 0], segs: 8 });
  }
  for (const sx of [-1, 1]) sweep(tris, [[sx * 0.8, 0.45, B.z - 0.1, 0.07, 0.07], [sx * 0.62, 0.62, 0.7, 0.07, 0.07]], { region: REGION.FRAME, segs: 10, per: 1 });
  sweep(tris, [[0, 0.6, B.z - 0.05, 0.06, 0.06], [0, 0.8, 1.0, 0.05, 0.05]], { region: REGION.FRAME, segs: 10, per: 1 });
  return turnY(tris, [0, 0, B.z], BLADE_YAW);
}

// A marker rod, standing up off a blade's end so you can see where it is.
function rod() {
  const tris = [];
  sweep(tris, [[0, 0, 0, 0.013, 0.013], [0, 1.45, 0, 0.011, 0.011]], { region: REGION.ROD, segs: 8, per: 1, caps: 2 });
  sweep(tris, [[0, 1.43, 0, 0.032, 0.032], [0, 1.5, 0, 0.032, 0.032]], { region: REGION.TIP, segs: 10, per: 1 });
  return tris;
}

// The snow rolling off the blade: a lumpy log, ±1 along x, radius 1. It
// churns in the vertex shader.
function roll() {
  const tris = [];
  grid(tris, 24, 18, (u, v) => {
    const th = u * Math.PI * 2, x = v * 2 - 1;
    const r = (1 + 0.14 * Math.sin(3 * th + x * 5) + 0.08 * Math.sin(7 * th - x * 9)) * Math.pow(Math.max(0, 1 - x * x), 0.25);
    return [x, r * Math.sin(th), r * Math.cos(th)];
  }, { region: REGION.ROLL });
  return tris;
}

// A drift of snow: a dome, radius 1 and 1 high, lumpy, wind-carved.
function mound() {
  const tris = [];
  polar(tris, 10, 36, (r, th) => {
    const lump = 0.18 * Math.sin(th * 3 + 1) * Math.sin(r * 5) + 0.1 * Math.sin(th * 7 + r * 4) + 0.06 * Math.cos(th * 11);
    const h = Math.pow(Math.max(0, 1 - r * r), 0.6) * (1 + lump * r) - 0.04;
    return [r * Math.cos(th) * (1 + 0.08 * Math.sin(th * 5)), h, r * Math.sin(th)];
  }, [0, -0.6, 0], REGION.MOUND);
  return tris;
}

export const MESH = {
  SPHERE: 0, BOX: 1, BOXS: 2, ROBOT_BENT: 3, ROBOT: 4, SHOVEL_ARMS: 5, CARRY_ARMS: 6,
  CAR: 7, TIRE: 8, BLADE: 9, ROD: 10, ROLL: 11, MOUND: 12, AXLE: 13,
};

export function buildMeshes(B) {
  const meshes = [sphere(), roundedBox(), roundedBox(0.04), robotBody(LEAN), robotBody(0), shovelArms(), carryArms(),
    car(), tire(), blade(B), rod(), roll(), mound(), axle()];
  const out = [];
  const ranges = [];
  for (const tris of meshes) {
    ranges.push({ first: out.length / 8, count: tris.length * 3 });
    for (const tri of tris) for (const [p, nn, c, r] of tri) out.push(p[0], p[1], p[2], nn[0], nn[1], nn[2], c, r);
  }
  return { data: new Float32Array(out), ranges };
}

// Where the shovel arms swing from: between the shoulders.
export const SHOULDERS = shoulder(0, LEAN);
