// Snow: the blizzard blowing across the road, the snow your blade throws
// up, and the lamps glowing through it all.
//
// Every particle is made up here from its index alone. The blizzard fills
// the air over the road, each flake falling and blown across by the wind,
// repeating every window's length along it; you drive through them, so
// they stream at you. The plume is thrown up off the top of your blade,
// mostly away to the right, and left behind as you drive on; the more snow
// on the blade, the more of it. Each is drawn as a short streak from where
// it is now to where it was STREAK seconds ago, and blended over what's
// behind, so flakes show grey against the white and blaze in your
// headlights. Lamps (tail lights, hazards, reflectors) come last: soft
// glows, bigger the further off they are, as fog spreads them.
//
// Space: x right, y up, z forward, relative to the eye's depth.

struct U {
  vp: mat4x4f,        // view-projection now
  pvp: mat4x4f,       // and STREAK seconds ago
  a: vec4f,           // resolution.xy, time, device pixel ratio
  b: vec4f,           // window offset (s - near mod window), unused, wind now, wind then
  c: vec4f,           // window, near, far, gain
  d: vec4f,           // particle count, how many are blizzard, how many plume, lamps
  e: vec4f,           // focal length px, longest streak px, speed, STREAK
  f: vec4f,           // the middle of your headlights xyz, half the gap between them
  g: vec4f,           // which way they point xyz, snow on the blade
  h: vec4f,           // your truck's right xyz, the beacon
  i: vec4f,           // your truck's frame: where it is xyz, headlights on
  fx: vec4f,          // its right
  fy: vec4f,          // its up
  fz: vec4f,          // its forward
  p: array<vec4f, 3>, // phases (s * K + K0) mod 2π
  kw: array<vec4f, 3>,// wave numbers K
  lamp: array<vec4f, 16>, // xyz, brightness
};
@group(0) @binding(0) var<uniform> u: U;

const TAU = 6.2831853;
const SPAN = 26.0;     // the blizzard is this wide
const HIGH = 13.0;     // and this high
const BLADE_Z = 2.3;
const BLADE_W = 1.9;
const BLADE_YAW = 0.26;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) q: vec2f,                         // pixels along and across the streak
  @location(1) @interpolate(flat) f: vec4f,      // half length, radius, intensity, brightness (0 for a lamp)
};

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd(v: u32) -> f32 { return f32(pcg(v)) / 4294967296.0; }

fn P(i: u32) -> f32 { return u.p[i / 4u][i % 4u]; }
fn K(i: u32) -> f32 { return u.kw[i / 4u][i % 4u]; }
fn ph(i: u32, z: f32) -> f32 { return P(i) + z * K(i); }

fn centre(z: f32) -> vec2f {
  return vec2f(14.0 * sin(ph(0u, z)) + 6.0 * sin(ph(1u, z)) + 3.0 * sin(ph(9u, z)),
               3.0 * sin(ph(2u, z)) + 1.2 * sin(ph(3u, z)) + 0.6 * sin(ph(10u, z)));
}
fn wrap(v: f32, span: f32) -> f32 { return v - span * floor(v / span); }

// How much your headlights light a point in the air.
fn headlights(p: vec3f) -> f32 {
  var k = 0.0;
  for (var side = -1.0; side < 2.0; side += 2.0) {
    let d = p - (u.f.xyz + u.h.xyz * side * u.f.w);
    let dist = length(d);
    k += smoothstep(0.84, 0.95, dot(d / dist, u.g.xyz)) / (1.0 + dist * dist * 0.006);
  }
  return k * u.i.w;
}

// A flake of the plume `age` seconds after it left the blade, in your truck's frame.
fn thrown(h: u32, age: f32) -> vec3f {
  let speed = u.e.z;
  let lx = (rnd(h + 3u) * 2.0 - 1.0) * BLADE_W;
  let x0 = lx * cos(BLADE_YAW);
  let z0 = BLADE_Z + 0.45 - lx * sin(BLADE_YAW);
  let powder = rnd(h + 9u) < 0.3;
  // Most of it goes off the trailing end, to the right; some straight up.
  let along = 0.5 + 0.5 * lx / BLADE_W;
  var vx = (0.3 + 4.5 * rnd(h + 4u)) * (0.25 + along) - 0.6 * rnd(h + 8u);
  var vy = 1.0 + 4.5 * rnd(h + 5u);
  let vz = speed * (0.1 + 0.3 * rnd(h + 6u));
  var drag = 2.0;
  if (powder) { drag = 5.0; vy *= 0.7; vx *= 0.6; }
  let fwd = vz * (1.0 - exp(-drag * age)) / drag;
  let g = select(5.0, 1.5, powder);
  return vec3f(x0 + vx * (1.0 - exp(-drag * 0.4 * age)) / (drag * 0.4), 1.15 + vy * age - 0.5 * g * age * age, z0 + fwd - speed * age);
}
fn truck(p: vec3f) -> vec3f { return u.i.xyz + u.fx.xyz * p.x + u.fy.xyz * p.y + u.fz.xyz * p.z; }

fn none() -> VO {
  var o: VO;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  o.q = vec2f(0.0);
  o.f = vec4f(0.0);
  return o;
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let res = u.a.xy;
  let W = u.c.x;
  let t = u.a.z;
  let count = u32(u.d.x);
  let nFall = u32(u.d.y);
  let tau = u.e.w;

  var corner = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
  );
  let cn = corner[vi];

  if (ii >= count) {
    // A lamp, glowing through the snow.
    let L = u.lamp[ii - count];
    let ca = u.vp * vec4f(L.xyz, 1.0);
    if (ca.w < 0.3) { return none(); }
    let A = (ca.xy / ca.w * 0.5 + 0.5) * res;
    let scatter = 1.0 + 2.5 * smoothstep(8.0, 60.0, ca.w);
    let rad = max(2.0 * u.a.w, 0.08 * u.e.x / ca.w) * scatter;
    let I = L.w * 1.6 * u.c.w * (1.0 - 0.6 * smoothstep(u.c.z * 0.6, u.c.z, ca.w));
    let ext = 5.0 * rad;
    var o: VO;
    o.pos = vec4f((A + cn * ext) / res * 2.0 - 1.0, clamp(ca.z / ca.w, 0.0, 1.0), 1.0);
    o.q = cn * ext;
    o.f = vec4f(0.0, rad, I, 0.0);
    return o;
  }

  var pNow: vec3f;
  var pThen: vec3f;
  var size: f32;
  var lum: f32;
  var I = 1.0;

  if (ii < nFall) {
    // The blizzard.
    let h = ii * 8u + 17u;
    var zoff = rnd(h) * W - u.b.x;
    if (zoff < 0.0) { zoff += W; }
    let z = zoff - u.c.y;
    let x0 = rnd(h + 1u) * SPAN;
    let y0 = rnd(h + 2u) * HIGH;
    let fall = 0.7 + 1.1 * rnd(h + 5u);
    let blow = 0.6 + 0.7 * rnd(h + 6u);
    let fl = rnd(h + 7u) * TAU;
    let c = centre(z);
    let xn = wrap(x0 + u.b.z * blow + 0.25 * sin(t * 1.7 + fl), SPAN) - SPAN * 0.5;
    let yn = wrap(y0 - t * fall + 0.15 * sin(t * 2.3 + fl * 1.3), HIGH);
    var xt = wrap(x0 + u.b.w * blow + 0.25 * sin((t - tau) * 1.7 + fl), SPAN) - SPAN * 0.5;
    var yt = wrap(y0 - (t - tau) * fall + 0.15 * sin((t - tau) * 2.3 + fl * 1.3), HIGH);
    if (abs(xt - xn) > 2.0 || abs(yt - yn) > 2.0) { xt = xn; yt = yn; }
    pNow = vec3f(c + vec2f(xn, yn), z);
    pThen = vec3f(c + vec2f(xt, yt), z);
    size = 0.007 + 0.016 * pow(rnd(h + 3u), 2.0);
    lum = 0.95 + 0.2 * rnd(h + 4u);
    // Not inside the cab.
    I = smoothstep(1.2, 2.2, z);
  } else {
    // The plume off the blade.
    let j = ii - nFall;
    let h = j * 16u + 3000017u;
    if (rnd(h + 2u) > u.g.w) { return none(); }
    let life = select(0.7 + 0.7 * rnd(h), 1.5 + rnd(h), rnd(h + 9u) < 0.3);
    let age = fract(t / life + rnd(h + 1u)) * life;
    let a = thrown(h, age);
    if (a.y < 0.0) { return none(); }
    pNow = truck(a);
    pThen = truck(thrown(h, max(age - tau, 0.0)) - vec3f(0.0, 0.0, u.e.z * min(tau, age)));
    size = select(0.012 + 0.03 * rnd(h + 10u), 0.05 + 0.06 * rnd(h + 10u), rnd(h + 9u) < 0.3);
    lum = 0.85;
    I = select(1.0, 0.35, rnd(h + 9u) < 0.3) * smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.6, 1.0, age / life));
    I *= smoothstep(0.9, 1.6, dot(pNow - u.i.xyz, u.fz.xyz));
  }

  let ca = u.vp * vec4f(pNow, 1.0);
  if (ca.w < 0.15) { return none(); }
  var cb = u.pvp * vec4f(pThen, 1.0);
  if (cb.w < 0.15) { cb = ca; }
  let A = (ca.xy / ca.w * 0.5 + 0.5) * res;
  let B = (cb.xy / cb.w * 0.5 + 0.5) * res;

  // Lit by your headlights and the beacon going round; fading into the white.
  lum *= 0.85 + 2.6 * headlights(pNow) + 0.4 * u.h.w * exp(-ca.w * 0.15);
  let fade = 1.0 - smoothstep(u.c.z * 0.25, u.c.z * 0.85, ca.w);
  // Right in front of the glass they're out of focus: bigger, fainter.
  let blur = 1.0 + 3.0 * (1.0 - smoothstep(1.5, 4.5, ca.w));
  let rTrue = size * u.e.x / ca.w * blur;
  let minR = 0.7 * u.a.w;
  let rad = clamp(rTrue, minR, 9.0 * u.a.w);
  I = I * fade * u.c.w * min(1.0, (rTrue * rTrue) / (rad * rad)) / (blur * blur);
  if (I < 0.004) { return none(); }

  var d = A - B;
  var len = length(d);
  if (len > u.e.y) { d = d * (u.e.y / len); len = u.e.y; }
  let dir = select(vec2f(1.0, 0.0), d / max(len, 1e-4), len > 0.01);
  let perp = vec2f(-dir.y, dir.x);
  I = I * mix(1.0, (2.0 * rad) / (2.0 * rad + len), 0.6);

  let ext = 2.5 * rad + 1.0;
  let hl = len * 0.5;
  let along = cn.x * (hl + ext);
  let across = cn.y * ext;
  let px = A - d * 0.5 + dir * along + perp * across;

  var o: VO;
  o.pos = vec4f(px / res * 2.0 - 1.0, clamp(ca.z / ca.w, 0.0, 1.0), 1.0);
  o.q = vec2f(along, across);
  o.f = vec4f(hl, rad, I, lum);
  return o;
}

// Blended over what's behind: colour premultiplied by coverage. Lamps
// only add light.
@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let hl = in.f.x;
  let rad = in.f.y;
  let d = length(vec2f(max(abs(in.q.x) - hl, 0.0), in.q.y));
  if (in.f.w == 0.0) {
    let v = in.f.z * (exp(-(d * d) / (0.5 * rad * rad)) + 0.25 * exp(-d / (rad * 1.6)));
    return vec4f(vec3f(v), 0.0);
  }
  // Brightest at the head of the streak, where it is now, fading to its tail.
  let tail = 0.2 + 0.8 * clamp((in.q.x + hl) / max(2.0 * hl, 1e-3), 0.0, 1.0);
  let core = exp(-(d * d) / (0.72 * rad * rad));
  let a = min(1.0, in.f.z * (core + 0.08 * exp(-d / (rad * 1.3))) * tail);
  return vec4f(vec3f(in.f.w * a), a * 0.85);
}
