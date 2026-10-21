// Things on the highway: robots and their shovels, cars, a jackknifed
// semi, loose tires, reflector posts, snow drifts, and your blade, its
// marker rods and the snow rolling off it.
//
// Lit flat by the white sky all round, a little brighter from above, and
// by your headlights ahead; glossy things reflect the white. Each vertex
// says which part of a thing it is on (its region), and fine detail (a
// robot's black joints and glass face, a car's lights, trim and windows,
// a trailer's ribs and reflective tape) is worked out here per pixel in
// the mesh's own space, so it stays put as they move. Snow settles on
// whatever faces up, and banks up where they meet the road. Robots' legs
// swing as they walk, and the snow off your blade churns. Everything
// comes out of the white.

struct U {
  vp: mat4x4f,
  a: vec4f,           // time, fog start, fog end, gain
  eye: vec4f,         // eye xyz, the beacon
  fog: vec4f,         // fog colour rgb, unused
  e: vec4f,           // the middle of your headlights xyz, half the gap between them
  f: vec4f,           // which way they point xyz, on
  g: vec4f,           // your truck's right xyz, unused
};
struct Inst {
  pos: vec4f,         // xyz, finish (see MAT in game.js)
  q: vec4f,           // turn
  scl: vec4f,         // size xyz, seed
  rad: vec4f,         // xy: up off the road, z: where the road is along it, w: 1 if on it
  anim: vec4f,        // legs' swing, lamps lit, snow on it, snow churning
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<uniform> inst: array<Inst, 200>;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) n: vec3f,
  @location(1) w: vec3f,
  @location(2) m: vec3f,
  @location(3) mn: vec3f,
  @location(4) hgt: f32,
  @location(5) cav: f32,
  @location(6) @interpolate(flat) i: u32,
  @location(7) @interpolate(flat) region: u32,
};

// Finishes.
const SNOW = 0;
const TRAILER = 1;
const TRACTOR = 2;
const POST = 3;
const WHITE = 10;
const BLACK = 11;
const VISOR = 12;
const HANDLE = 13;
const SCOOP = 14;
const PAINT = 15;
const GLASS = 16;
const TIRE = 17;
const RIM = 18;
const TRIM = 19;
const TAIL = 20;
const LENS = 21;
const STEEL = 22;
const TIP = 23;

const HIP_Y = 0.92;

fn qrot(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

fn hash(p: vec3f) -> f32 {
  let q = fract(p * 0.3183099 + vec3f(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
fn noise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3f(1.0, 0.0, 0.0)), w.x),
        mix(hash(i + vec3f(0.0, 1.0, 0.0)), hash(i + vec3f(1.0, 1.0, 0.0)), w.x), w.y),
    mix(mix(hash(i + vec3f(0.0, 0.0, 1.0)), hash(i + vec3f(1.0, 0.0, 1.0)), w.x),
        mix(hash(i + vec3f(0.0, 1.0, 1.0)), hash(i + vec3f(1.0, 1.0, 1.0)), w.x), w.y), w.z);
}

@vertex
fn vs(@location(0) p0: vec3f, @location(1) n0: vec3f, @location(2) cav: f32, @location(3) region: f32,
      @builtin(instance_index) ii: u32) -> VO {
  let it = inst[ii];
  let reg = u32(region + 0.5);
  let t = u.a.x;
  var p = p0;
  var n = n0;
  if (reg == 4u || reg == 5u) {
    // A robot's legs swing from the hip, one forward as the other goes back.
    let a = it.anim.x * select(-1.0, 1.0, reg == 4u);
    let c = cos(a);
    let s = sin(a);
    let d = p - vec3f(0.0, HIP_Y, 0.0);
    p = vec3f(0.0, HIP_Y, 0.0) + vec3f(d.x, d.y * c - d.z * s, d.y * s + d.z * c);
    n = vec3f(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
  } else if (reg == 40u) {
    // The snow rolling off the blade turns over and churns.
    let a = -t * 2.5;
    let c = cos(a);
    let s = sin(a);
    let r = vec3f(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
    let k = noise(r * 2.5 + vec3f(0.0, t * 1.3, -t * 2.0)) - 0.5;
    p = p + n * k * 0.3 * it.anim.w;
  }
  let w = it.pos.xyz + qrot(it.q, p * it.scl.xyz);
  var o: VO;
  o.pos = u.vp * vec4f(w, 1.0);
  o.n = qrot(it.q, n / it.scl.xyz);
  o.w = w;
  o.m = p;
  o.mn = n;
  o.hgt = select(10.0, dot(w.xy, it.rad.xy) - it.rad.z, it.rad.w > 0.5);
  o.cav = cav;
  o.i = ii;
  o.region = reg;
  return o;
}

// How much your two headlights light point p, facing n.
fn headlights(p: vec3f, n: vec3f) -> f32 {
  var k = 0.0;
  for (var side = -1.0; side < 2.0; side += 2.0) {
    let d = p - (u.e.xyz + u.g.xyz * side * u.e.w);
    let dist = length(d);
    let l = d / dist;
    k += smoothstep(0.86, 0.96, dot(l, u.f.xyz)) * max(dot(n, -l), 0.0) / (1.0 + dist * dist * 0.004);
  }
  return k * u.f.w;
}

// A car's paint, by seed: black, charcoal, gunmetal, grey or silver.
fn paint(s: f32) -> f32 {
  let k = i32(fract(s * 13.7) * 5.0);
  var c = array<f32, 5>(0.02, 0.05, 0.11, 0.22, 0.42);
  return c[k];
}

// What a region of a thing is made of, and where.
fn finish(region: u32, mat: i32, m: vec3f, mn: vec3f) -> i32 {
  switch (region) {
    case 1u: { return WHITE; }
    case 2u: { return BLACK; }
    case 3u: { return WHITE; }
    case 7u, 8u: { return VISOR; }
    case 4u, 5u: {
      let y = m.y;
      return select(WHITE, BLACK, y < 0.095 || (y > 0.46 && y < 0.57) || y > 0.86);
    }
    case 6u: { return select(WHITE, BLACK, abs(m.x) > 0.135 || m.y < 1.08); }
    case 10u: { return HANDLE; }
    case 11u: { return SCOOP; }
    case 20u: {
      let ax = abs(m.x);
      if (m.z < -2.0 && ax > 0.42 && ax < 0.86 && m.y > 0.66 && m.y < 0.9) { return TAIL; }
      if (m.z > 1.95 && ax > 0.38 && ax < 0.82 && m.y > 0.56 && m.y < 0.76) { return LENS; }
      if (m.y < 0.47) { return TRIM; }
      return PAINT;
    }
    case 21u: {
      if (mn.y > 0.8 || abs(m.z + 0.25) < 0.07 || m.y > 1.38) { return PAINT; }
      return GLASS;
    }
    case 22u: { return TIRE; }
    case 23u: { return RIM; }
    case 30u: { return STEEL; }
    case 31u, 32u: { return BLACK; }
    case 33u: { return TIP; }
    case 40u, 41u: { return SNOW; }
    default: { return mat; }
  }
}

@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let it = inst[in.i];
  let seed = it.scl.w;
  let m = in.m;
  let mn = normalize(in.mn);
  let mat = finish(in.region, i32(it.pos.w + 0.5), m, mn);
  var n = normalize(in.n);
  let toEye = u.eye.xyz - in.w;
  let dist = length(toEye);
  let v = toEye / dist;
  if (dot(n, v) < 0.0 && (mat == SCOOP || mat == STEEL)) { n = -n; }   // thin things show both faces

  var albedo = 0.5;
  var spec = 0.04;          // reflectance
  var shine = 16.0;
  var emit = 0.0;
  var cover = 1.0;          // how much snow can settle on it
  let hl = headlights(in.w, n);

  if (mat == SNOW) {
    // Carved by the wind into ripples, which catch the light.
    let q = in.w * vec3f(3.0, 6.0, 3.0);
    let rip = vec3f(noise(q + vec3f(0.1, 0.0, 0.0)) - noise(q - vec3f(0.1, 0.0, 0.0)), 0.0, noise(q + vec3f(0.0, 0.0, 0.1)) - noise(q - vec3f(0.0, 0.0, 0.1)));
    n = normalize(n + rip * 2.5);
    albedo = 0.72 + 0.08 * noise(m * 9.0);
    spec = 0.02;
    emit = 0.6 * step(0.985, hash(floor(in.w * 40.0))) * hl;   // glints
    cover = 0.0;
  } else if (mat == WHITE) {
    albedo = 0.72;
    spec = 0.35; shine = 60.0;
    cover = 0.5;
    // Seams between the shells: down the middle of the chest and the front of each leg.
    if (in.region == 6u && abs(m.x) < 0.007 && mn.z > 0.2) { albedo = 0.12; }
    if ((in.region == 4u || in.region == 5u) && abs(abs(m.x) - 0.11) < 0.006 && mn.z > 0.5) { albedo = 0.12; }
  } else if (mat == BLACK) {
    albedo = 0.025;
    spec = 0.3; shine = 40.0;
    cover = 0.5;
  } else if (mat == VISOR) {
    albedo = 0.01;
    spec = 0.6; shine = 120.0;
    // A faint strip of light across the face.
    if (in.region == 8u) { emit = 0.45 * (0.8 + 0.2 * sin(u.a.x * 3.0 + seed * 20.0)); }
    cover = 0.0;
  } else if (mat == HANDLE) {
    albedo = 0.07;
    spec = 0.15; shine = 30.0;
  } else if (mat == SCOOP) {
    albedo = 0.4 * (0.85 + 0.15 * noise(m * vec3f(60.0, 60.0, 8.0)));
    spec = 0.3; shine = 40.0;
  } else if (mat == PAINT) {
    albedo = paint(seed);
    spec = 0.5; shine = 90.0;
    // Door seams down the sides.
    if (abs(mn.x) > 0.6 && (abs(m.z + 0.25) < 0.012 || abs(m.z - 0.95) < 0.012) && m.y < 0.9) { albedo *= 0.3; }
  } else if (mat == GLASS) {
    albedo = 0.015;
    spec = 0.6; shine = 100.0;
    cover = 0.2;
  } else if (mat == TIRE) {
    albedo = 0.03 * (0.8 + 0.4 * step(0.5, fract(atan2(m.y, m.z) * 6.0)));
    spec = 0.05;
    cover = 0.3;
  } else if (mat == RIM) {
    albedo = 0.5;
    spec = 0.6; shine = 80.0;
    cover = 0.3;
  } else if (mat == TRIM) {
    albedo = 0.04;
    spec = 0.1;
  } else if (mat == TAIL) {
    albedo = 0.08;
    spec = 0.5; shine = 80.0;
    emit = 0.15 + 1.1 * it.anim.y;
    cover = 0.0;
  } else if (mat == LENS) {
    albedo = 0.6;
    spec = 0.7; shine = 120.0;
    emit = 1.4;   // headlamps burn steadily
    cover = 0.0;
  } else if (mat == STEEL) {
    // Your blade: worn black steel, scraped bright along its edges.
    albedo = 0.05 * (0.7 + 0.6 * noise(m * vec3f(3.0, 40.0, 3.0)));
    spec = 0.35; shine = 50.0;
    albedo = mix(albedo, 0.5, smoothstep(1.08, 1.14, m.y) * 0.6);
    cover = 0.5;
  } else if (mat == TIP) {
    albedo = 0.9;
    emit = 0.5;
    spec = 0.4; shine = 60.0;
    cover = 0.0;
  } else if (mat == TRAILER) {
    // Corrugated sides, a stripe of reflective tape along the bottom, doors at the back.
    let side = abs(mn.x) > 0.7;
    let zm = m.z * it.scl.z;
    albedo = 0.62;
    if (side) {
      albedo *= 0.9 + 0.12 * sin(zm * 21.0);
      if (m.y > -0.9 && m.y < -0.78) {
        let on = step(0.5, fract(zm / 0.6));
        albedo = mix(0.1, 0.95, on);
        emit = on * hl * 1.5;
      }
    }
    if (abs(mn.z) > 0.7 && abs(m.x) < 0.012) { albedo = 0.1; }
    spec = 0.2; shine = 30.0;
  } else if (mat == TRACTOR) {
    albedo = 0.1;
    spec = 0.45; shine = 80.0;
    if (m.y > 0.25 && m.y < 0.75 && (abs(mn.x) > 0.7 || mn.z > 0.7)) { albedo = 0.015; spec = 0.6; }
  } else if (mat == POST) {
    albedo = 0.75;
    spec = 0.2;
    if (m.y > 0.68) { albedo = 0.95; emit = hl * 2.0; }
    cover = 0.0;
  }

  // Snow settles on whatever faces up, and banks up round their feet.
  let settle = smoothstep(0.45, 0.8, n.y) * it.anim.z * cover * (0.55 + 0.45 * noise(in.w * 7.0));
  let banked = (1.0 - smoothstep(0.0, 0.12 + 0.1 * noise(in.w * 5.0), in.hgt)) * cover;
  let snow = clamp(max(settle, banked), 0.0, 1.0);
  albedo = mix(albedo, 0.78, snow);
  spec = mix(spec, 0.03, snow);

  // The light: the white sky all round, a soft glow from above where the
  // sun is somewhere behind the storm, your headlights.
  let sky = 0.48 + 0.25 * (0.5 + 0.5 * n.y);
  let key = 0.45 * max(dot(n, normalize(vec3f(-0.35, 0.85, -0.4))), 0.0);
  let light = sky + key + hl * 1.7 + u.eye.w * 0.06 * exp(-dist * 0.1);
  var col = albedo * light * (1.0 - spec * 0.4) * in.cav;

  // The white, reflected, and the glare of your headlights off gloss.
  let r = reflect(-v, n);
  // Glossier things reflect more, little straight on and a lot at a glance.
  let fres = spec * (0.1 + 0.9 * pow(1.0 - max(dot(n, v), 0.0), 5.0));
  let env = mix(0.45, 0.95, smoothstep(-0.3, 0.3, r.y));
  col += env * fres;
  col += pow(max(dot(r, -u.f.xyz), 0.0), shine) * spec * hl * 3.0;
  col += emit;

  let fog = pow(smoothstep(u.a.y, u.a.z, dist), 1.2);
  let c3 = mix(vec3f(col), u.fog.rgb, fog);
  return vec4f(c3 * u.a.w, 1.0);
}
