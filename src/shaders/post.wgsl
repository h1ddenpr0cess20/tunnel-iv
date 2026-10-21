// The picture, from the driver's seat: tone mapping into black and white,
// film grain and a vignette; snow landing on the windscreen and melting
// into drops, until the wipers sweep it off; frost feathering in from the
// edges of the glass; the cab round it (pillars, roof, dash and the
// mirror, with the road behind you and the storm swirling over it); the
// white flash of a crash and the fade into the white.

struct U {
  a: vec4f,   // exposure, vignette, flash, fade
  b: vec4f,   // resolution.xy, time, grain
  c: vec4f,   // colour to fade to, seconds into the wipers' cycle
  d: vec4f,   // wipers' cycle, seconds they take across and back, cab shown, device pixel ratio
  e: vec4f,   // depth mod 2048, how far the storm has swirled, unused, unused
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var hdr: texture_2d<f32>;

const PI = 3.14159265;
const REST = 3.05;     // the wipers lie along the bottom of the glass, pointing left
const TOP = 0.98;      // and sweep up to here
const ARM = 0.6;       // the arm reaches this far along the wiper, the blade
const BLADE0 = 0.26;   // runs from here
const BLADE1 = 1.0;    // to here
// The highway's vault, as in tube.wgsl, and your eye in it.
const HC = 2.5;
const RX = 10.5;
const RY = 6.5;
const EYE = vec2f(-0.55, 2.55);

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}

fn hash2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2f(1.0, 0.0)), w.x), mix(hash2(i + vec2f(0.0, 1.0)), hash2(i + vec2f(1.0, 1.0)), w.x), w.y);
}
fn fbm2(p: vec2f) -> f32 {
  return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 7.1) + 0.125 * vnoise(p * 4.1 + 3.3) + 0.0625 * vnoise(p * 8.3 + 1.7);
}
// Value noise wrapping every `per` cells along z, and the storm, as in tube.wgsl.
fn hash3(p: vec3f) -> f32 {
  let q = fract(p * 0.3183099 + vec3f(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
fn noise3(p: vec3f, per: f32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let z0 = i.z - per * floor(i.z / per);
  let z1 = select(z0 + 1.0, 0.0, z0 + 1.0 >= per);
  let a = vec3f(i.x, i.y, z0);
  let b = vec3f(i.x, i.y, z1);
  return mix(
    mix(mix(hash3(a), hash3(a + vec3f(1.0, 0.0, 0.0)), w.x),
        mix(hash3(a + vec3f(0.0, 1.0, 0.0)), hash3(a + vec3f(1.0, 1.0, 0.0)), w.x), w.y),
    mix(mix(hash3(b), hash3(b + vec3f(1.0, 0.0, 0.0)), w.x),
        mix(hash3(b + vec3f(0.0, 1.0, 0.0)), hash3(b + vec3f(1.0, 1.0, 0.0)), w.x), w.y), w.z);
}
fn storm(a: f32, zw: f32, flow: f32) -> f32 {
  var x = a * 3.0;
  var y = zw * 0.0625;
  for (var i = 0; i < 5; i++) {
    let fi = f32(i);
    let nx = noise3(vec3f(x * 0.625 + 3.1 * fi, flow + 1.7 * fi, y * 0.625), 80.0) - 0.5;
    let ny = noise3(vec3f(x * 0.625 + 8.3 * fi + 5.0, flow + 4.2 * fi, y * 0.625), 80.0) - 0.5;
    x += 2.2 * nx;
    y += 2.2 * ny;
  }
  let s = sin(x * 15.0);
  let q = vec3f(x * 0.375, 2.0 + flow * 0.5, y * 0.375);
  let ink = smoothstep(0.3, 0.7, (noise3(q, 48.0) * 0.5 + noise3(q * 2.0 + vec3f(1.7, 9.2, 0.0), 96.0) * 0.25) / 0.75);
  let band = smoothstep(-0.1, 1.0, 0.5 + 0.5 * s) * (0.3 + 0.7 * ink);
  let e = (s - 0.95) / 0.05;
  return max(0.04 + 0.52 * band, exp(-e * e) * 0.9);
}

// What the mirror shows at m (-1 to 1 across and up): looking back down
// the road from your seat, the lane you've plowed, the banks, and the
// storm over it all streaming away into the white. Left and right
// swap, as in any mirror.
fn behind(m: vec2f) -> f32 {
  let d = normalize(vec3f(m.x * 0.6, m.y * 0.17 - 0.02, -1.0));
  // Out to the vault...
  let e = vec2f(EYE.x, EYE.y - HC);
  let A = (d.x / RX) * (d.x / RX) + (d.y / RY) * (d.y / RY);
  let B = 2.0 * (e.x * d.x / (RX * RX) + e.y * d.y / (RY * RY));
  let C = (e.x / RX) * (e.x / RX) + (e.y / RY) * (e.y / RY) - 1.0;
  var dist = (-B + sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
  var c: f32;
  let tr = select(1e6, -EYE.y / d.y, d.y < 0.0);
  if (tr < dist) {
    // ...or down to the road: your plowed lane dark, the windrow off the blade bright beside it.
    dist = tr;
    let x = EYE.x + d.x * tr;
    let zw = u.e.x + d.z * tr;
    let lane = 1.0 - smoothstep(1.6, 2.0, abs(x));
    let wr = (x - 2.4) / 0.5;
    let windrow = exp(-wr * wr);
    c = mix(0.74, 0.4 + 0.1 * noise3(vec3f(x * 3.0, 1.0, zw * 2.0), 4096.0), lane);
    c = mix(c, 0.92, windrow * 0.8);
  } else {
    let p = e + d.xy * dist;
    let a = atan2(p.y / RY, p.x / RX);
    let high = smoothstep(0.5, 4.0, p.y);
    c = mix(0.82, storm(a, u.e.x + d.z * dist, u.e.y), high);
  }
  return mix(c, 0.86, pow(smoothstep(4.0, 80.0, dist), 0.8));
}

// Distance from p to the segment a-b.
fn seg(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// The scene, tone mapped and in black and white, at pixel p (y up).
fn scene(p: vec2f) -> f32 {
  let res = u.b.xy;
  let q = clamp(vec2i(i32(p.x), i32(res.y - 1.0 - p.y)), vec2i(0), vec2i(res) - 1);
  let c = textureLoad(hdr, q, 0).rgb;
  let t = vec3f(1.0) - exp(-c * u.a.x);
  let l = dot(t, vec3f(0.3, 0.59, 0.11));
  // A film's S curve: deep blacks, hot whites.
  return l * l * (3.0 - 2.0 * l) * 0.92 + l * 0.08;
}

// Where the wipers are, angle from their pivots, `tau` seconds into their cycle.
fn wiperAt(tau: f32) -> f32 {
  if (tau >= u.d.y) { return REST; }
  return REST + (TOP - REST) * (0.5 - 0.5 * cos(2.0 * PI * tau / u.d.y));
}
// How long ago a wiper last passed angle th; huge if it never reaches it.
fn wipedAgo(th: f32) -> f32 {
  let k = (th - REST) / (TOP - REST);
  if (k < 0.0 || k > 1.0) { return 1e6; }
  let t1 = acos(1.0 - 2.0 * k) / (2.0 * PI) * u.d.y;
  let t2 = u.d.y - t1;
  let tau = u.c.w;
  if (tau < t1) { return tau + u.d.x - t2; }
  if (tau < t2) { return tau - t1; }
  return tau - t2;
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = u.b.xy;
  let H = res.y;
  let M = min(res.x, res.y);   // the cab's fittings scale with the screen's short side
  let p = vec2f(fc.x, res.y - fc.y);   // y up
  let t = u.b.z;
  let cab = u.d.z > 0.5;

  // The windscreen: between the pillars, under the roof, over the dash,
  // its top corners rounded. `edge` is how far in from its edge.
  let dashTop = H * 0.075 + H * 0.012 * sin(PI * p.x / res.x);
  let pillar = M * 0.03 + p.y * 0.05 * M / H;
  let roof = res.y - M * 0.045;
  let corner = M * 0.07;
  var inside = 1.0;
  var edge = 1e6;
  if (cab) {
    let cx = min(p.x - pillar, res.x - pillar - p.x);
    let cy = min(p.y - dashTop, roof - p.y);
    let dc = vec2f(max(corner - cx, 0.0), max(corner - (roof - p.y), 0.0));
    edge = select(min(cx, cy), corner - length(dc), dc.x > 0.0 && dc.y > 0.0);
    inside = smoothstep(-1.0, 1.0, edge);
  }

  var col = scene(p);

  var pivots = array<vec2f, 2>(vec2f(res.x * 0.27, H * 0.035), vec2f(res.x * 0.69, H * 0.035));
  let reach = max(res.x * 0.4, H * 0.72);

  if (cab && inside > 0.0) {
    // Snow on the glass. Each cell of a grid now and then catches a flake:
    // a ragged clump of crystals, out of focus this close, that melts
    // into a drop of water, which bends the road behind it upside down
    // like a lens. The wipers take them off.
    let cs = H / 13.0;
    let cell = floor(p / cs);
    let h1 = hash2(cell);
    if (h1 < 0.5) {
      let ctr = (cell + 0.25 + 0.5 * vec2f(hash2(cell + 7.1), hash2(cell + 3.3))) * cs;
      let period = 4.0 + 7.0 * hash2(cell + 1.9);
      let age = (t + hash2(cell + 5.7) * period) % period;
      var ago = 1e6;
      for (var k = 0; k < 2; k++) {
        let d = ctr - pivots[k];
        let r = length(d) / reach;
        if (r > BLADE0 && r < BLADE1) { ago = min(ago, wipedAgo(atan2(d.y, d.x))); }
      }
      let melt = smoothstep(period * 0.15, period * 0.5, age);
      let size = cs * (0.06 + 0.16 * pow(hash2(cell + 9.4), 2.0)) * (1.0 - 0.3 * melt);
      let d = p - ctr;
      let dir = d / max(length(d), 1e-3);
      let ragged = 0.55 + 0.9 * vnoise(dir * 2.2 + h1 * 40.0) * (1.0 - melt) + 0.45 * melt;
      let r = length(d) / (size * ragged);
      let soft = mix(0.45, 0.12, melt);
      let shape = 1.0 - smoothstep(1.0 - soft, 1.0, r);
      let on = step(age, ago) * smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(period * 0.8, period, age));
      if (shape * on > 0.001) {
        // The flake: white, its crystals catching the light.
        let ice = 0.82 + 0.18 * vnoise(d / size * 3.0 + h1 * 9.0);
        // The drop: the scene through it, flipped, a dark rim, a glint.
        let bent = scene(ctr - d * 0.7 * (1.0 + 0.4 * r * r)) * 0.85 + 0.05;
        let rim = smoothstep(0.55, 0.95, r) * 0.25;
        let glint = (1.0 - smoothstep(0.0, 0.22, length(d / size - vec2f(-0.3, 0.35)))) * 0.6;
        let drop = bent * (1.0 - rim) + glint;
        col = mix(col, mix(ice, drop, melt), shape * on * inside * mix(0.85, 0.9, melt));
      }
    }

    // Frost, feathering in from the edges and the corners of the glass.
    let fr = fbm2(p / (H * 0.05));
    let reachF = H * (0.02 + 0.09 * fr * fr);
    let frost = (1.0 - smoothstep(0.0, reachF, edge)) * (0.5 + 0.5 * fbm2(p / (H * 0.012) + 4.0));
    col = mix(col, 0.86 + 0.1 * fr, frost * 0.7);

    // The wipers: a black arm tapering out from its pivot under the dash,
    // a long rubber blade along the end of it; out of focus this close,
    // and a faint wet arc where they've just been.
    let th = wiperAt(u.c.w);
    let dir = vec2f(cos(th), sin(th));
    let side = vec2f(-dir.y, dir.x);
    let soft = H * 0.0025;
    var cover = 0.0;
    for (var k = 0; k < 2; k++) {
      let o = pivots[k];
      let along = clamp(dot(p - o, dir) / (reach * ARM), 0.0, 1.0);
      let arm = seg(p, o, o + dir * reach * ARM + side * H * 0.004) - mix(H * 0.008, H * 0.0035, along);
      let bl = seg(p, o + dir * reach * BLADE0 + side * H * 0.005, o + dir * reach * BLADE1 + side * H * 0.005) - H * 0.0028;
      cover = max(cover, 1.0 - smoothstep(-soft, soft, min(arm, bl)));
      let dp = p - o;
      let rr = length(dp) / reach;
      if (rr > BLADE0 && rr < BLADE1) {
        let ago = wipedAgo(atan2(dp.y, dp.x));
        col -= 0.035 * (1.0 - smoothstep(0.0, 0.8, ago)) * (0.5 + 0.5 * sin(length(dp) * 0.35));
      }
    }
    col = mix(col, 0.018, cover * inside);
  }

  let uv = fc.xy / res - 0.5;
  col *= 1.0 - u.a.y * pow(length(uv * vec2f(res.x / res.y, 1.0)) * 1.1, 2.4);

  // The cab round the glass: dark, a little light catching its edges, a
  // mirror hanging from the roof.
  if (cab) {
    var frame = 0.035 + 0.05 * (1.0 - smoothstep(0.0, H * 0.02, -edge)) + 0.02 * p.y / H;
    if (p.y < dashTop) {
      // The dash: a lip catching the light, and a few dim gauges.
      frame = 0.03 + 0.06 * (1.0 - smoothstep(0.0, H * 0.01, dashTop - p.y));
      let g = vec2f(res.x * 0.5 - H * 0.42, H * 0.035);
      for (var k = 0; k < 3; k++) {
        let gd = length(p - g - vec2f(f32(k) * H * 0.06, 0.0));
        frame += 0.12 * (1.0 - smoothstep(H * 0.017, H * 0.02, gd)) * (1.0 - smoothstep(H * 0.012, H * 0.016, gd)) + 0.05 * (1.0 - smoothstep(H * 0.016, H * 0.019, gd));
      }
    }
    col = mix(frame, col, inside);
    // The mirror: a dark frame round a glass that shows a blur of the white behind.
    let mc = vec2f(res.x * 0.5, roof - M * 0.07);
    let md = abs(p - mc) - vec2f(M * 0.12, M * 0.032);
    let mirror = length(max(md, vec2f(0.0))) + min(max(md.x, md.y), 0.0) - M * 0.01;
    let stem = 1.0 - smoothstep(M * 0.004, M * 0.006, abs(p.x - mc.x));
    col = mix(col, 0.04, max(1.0 - smoothstep(-1.0, 1.0, mirror), stem * step(mc.y, p.y) * step(p.y, roof)));
    let glass = 1.0 - smoothstep(-M * 0.009, -M * 0.007, mirror);
    if (glass > 0.0) {
      let m = (p - mc) / vec2f(M * 0.121, M * 0.033);
      col = mix(col, behind(m) * 0.85 * (1.0 - 0.25 * dot(m, m) * 0.5), glass);
    }
  }

  col = mix(col, 0.95, u.a.z * 0.7);
  col = mix(col, u.c.r, u.a.w);
  let n = fract(sin(dot(fc.xy + t * 37.0, vec2f(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) * 0.06 * u.b.w;
  return vec4f(vec3f(max(col, 0.0)), 1.0);
}
