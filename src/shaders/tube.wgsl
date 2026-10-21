// The highway: a road between snowbanks, under a vault of blowing snow.
//
// A mesh of rings along the road and segments round it, made up here from
// the vertex index alone, held to your view while the road runs through
// it. Each ring is an ellipse round a point above the road, its floor cut
// off flat by the road and the banks either side. The road is packed
// snow, rutted dark where the traffic has been, its lane lines just
// showing through, with snow snaking across it in the wind. The banks are
// heaped white. Above them the blowing snow goes up like a wall, and
// overhead the storm swirls like ink in milk. Your headlights light the
// road ahead, and far away it all goes white.
//
// Space: x right, y up, z forward, relative to the eye's depth.

struct U {
  vp: mat4x4f,
  a: vec4f,           // resolution.xy, time, device pixel ratio
  b: vec4f,           // eye xyz, how far the storm has swirled
  c: vec4f,           // fog colour rgb, fog start
  d: vec4f,           // depth mod 2048, near, far, gain
  e: vec4f,           // the middle of your headlights xyz, half the gap between them
  f: vec4f,           // which way they point xyz, on
  g: vec4f,           // your truck's right xyz, the beacon
  p: array<vec4f, 3>, // phases (s * K + K0) mod 2π
  k: array<vec4f, 3>, // wave numbers K
};
@group(0) @binding(0) var<uniform> u: U;

const TAU = 6.2831853;
const RINGS = 160u;
const SEGS = 128u;
const ROAD_W = 6.6;
const HC = 2.5;
const RX = 10.5;
const RY = 6.5;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) w: vec3f,
  @location(1) n: vec3f,
  @location(2) loc: vec3f,   // across and up from the middle of the road, angle round
};

fn P(i: u32) -> f32 { return u.p[i / 4u][i % 4u]; }
fn K(i: u32) -> f32 { return u.k[i / 4u][i % 4u]; }
fn ph(i: u32, z: f32) -> f32 { return P(i) + z * K(i); }

fn centre(z: f32) -> vec2f {
  return vec2f(14.0 * sin(ph(0u, z)) + 6.0 * sin(ph(1u, z)) + 3.0 * sin(ph(9u, z)),
               3.0 * sin(ph(2u, z)) + 1.2 * sin(ph(3u, z)) + 0.6 * sin(ph(10u, z)));
}
// How high the snow is x across the road, as bankH() in constants.js.
fn bank(x: f32, z: f32) -> f32 {
  let side = select(-1.0, 1.0, x >= 0.0);
  let h = 2.0 + 0.5 * sin(ph(4u, z) + side * 1.9) + 0.35 * sin(ph(5u, z) + side * 0.7);
  return h * smoothstep(ROAD_W, ROAD_W + 2.4, abs(x));
}
// The section at angle a round the vault: across and up from the middle of the road.
fn section(a: f32, z: f32) -> vec2f {
  let x = RX * cos(a);
  return vec2f(x, max(HC + RY * sin(a), bank(x, z)));
}
fn at(a: f32, z: f32) -> vec3f { return vec3f(centre(z) + section(a, z), z); }

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VO {
  let q = vi / 6u;
  let c = vi % 6u;
  let di = select(0u, 1u, c == 1u || c == 2u || c == 4u);
  let dj = select(0u, 1u, c == 2u || c == 4u || c == 5u);
  let ring = q / SEGS + di;
  let seg = q % SEGS + dj;
  let near = u.d.y;
  let far = u.d.z;
  let z = -near + (near + far) * pow(f32(ring) / f32(RINGS), 1.6);
  let a = f32(seg) / f32(SEGS) * TAU - 1.5707963;
  let pos = at(a, z);
  let dA = at(a + 0.004, z) - at(a - 0.004, z);
  let dZ = at(a, z + 0.1) - at(a, z - 0.1);
  var o: VO;
  o.pos = u.vp * vec4f(pos, 1.0);
  o.w = pos;
  // Inwards. Where the bank stands above the vault's widest point,
  // neighbouring points round the section coincide: there it faces up.
  let cr = cross(dZ, dA);
  o.n = select(vec3f(0.0, 1.0, 0.0), normalize(cr), length(cr) > 1e-6);
  o.loc = vec3f(section(a, z), a);
  return o;
}

// Value noise whose lattice wraps every `per` cells along z, so the
// pattern never jumps when the depth wraps round 2048.
fn hash(p: vec3f) -> f32 {
  let q = fract(p * 0.3183099 + vec3f(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
fn noise(p: vec3f, per: f32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let z0 = i.z - per * floor(i.z / per);
  let z1 = select(z0 + 1.0, 0.0, z0 + 1.0 >= per);
  let a = vec3f(i.x, i.y, z0);
  let b = vec3f(i.x, i.y, z1);
  return mix(
    mix(mix(hash(a), hash(a + vec3f(1.0, 0.0, 0.0)), w.x),
        mix(hash(a + vec3f(0.0, 1.0, 0.0)), hash(a + vec3f(1.0, 1.0, 0.0)), w.x), w.y),
    mix(mix(hash(b), hash(b + vec3f(1.0, 0.0, 0.0)), w.x),
        mix(hash(b + vec3f(0.0, 1.0, 0.0)), hash(b + vec3f(1.0, 1.0, 0.0)), w.x), w.y), w.z);
}
fn fbm(p: vec3f, per: f32) -> f32 {
  var v = 0.0;
  var amp = 0.5;
  var q = p;
  var pr = per;
  for (var i = 0; i < 3; i++) {
    v += amp * noise(q, pr);
    q = q * 2.0 + vec3f(1.7, 9.2, 0.0);
    pr *= 2.0;
    amp *= 0.5;
  }
  return v / 0.875;
}

// The storm overhead, marbled like ink combed out on water: lines that
// start out running straight along the road (so in perspective they
// stream out at you from the white far ahead), pushed about five times
// by a slow flow until they swirl, then drawn as grey bands with fine
// white veins, pooling to black where the ink is thick. It swirls on
// with the flow. Returns how light it is.
fn storm(a: f32, zw: f32, flow: f32, aa: f32) -> f32 {
  var x = a * 3.0;
  var y = zw * 0.0625;
  for (var i = 0; i < 5; i++) {
    let fi = f32(i);
    let nx = noise(vec3f(x * 0.625 + 3.1 * fi, flow + 1.7 * fi, y * 0.625), 80.0) - 0.5;
    let ny = noise(vec3f(x * 0.625 + 8.3 * fi + 5.0, flow + 4.2 * fi, y * 0.625), 80.0) - 0.5;
    x += 2.2 * nx;
    y += 2.2 * ny;
  }
  // Broad bands, finer ones among them, veins along their crests; all
  // fading to their average where they'd crowd closer than a pixel.
  let s = sin(x * 15.0);
  let f = sin(x * 41.0 + y * 2.0);
  let ink = smoothstep(0.3, 0.7, fbm(vec3f(x * 0.375, 2.0 + flow * 0.5, y * 0.375), 48.0));
  let band = mix(0.5, smoothstep(-0.1, 1.0, 0.5 + 0.5 * s), aa) * (0.3 + 0.7 * ink);
  let fine = mix(0.5, 0.5 + 0.5 * f, aa * aa);
  let e = (s - 0.95) / 0.05;
  let vein = exp(-e * e) * aa;
  return max(0.04 + 0.52 * band * (0.75 + 0.5 * fine), vein * 0.9);
}

// How much your two headlights light point p, facing n.
fn headlights(p: vec3f, n: vec3f) -> f32 {
  var k = 0.0;
  for (var side = -1.0; side < 2.0; side += 2.0) {
    let L = u.e.xyz + u.g.xyz * side * u.e.w;
    let d = p - L;
    let dist = length(d);
    let l = d / dist;
    let cone = smoothstep(0.86, 0.96, dot(l, u.f.xyz));
    k += cone * max(dot(n, -l), 0.0) / (1.0 + dist * dist * 0.004);
  }
  return k * u.f.w;
}

@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let t = u.a.z;
  let z = in.w.z;
  let zw = u.d.x + z;
  let xr = in.loc.x;
  let yr = in.loc.y;
  let a = in.loc.z;
  let n = normalize(in.n);
  // How many of the storm's bands a pixel spans, for antialiasing them.
  let aa = 1.0 - smoothstep(0.6, 2.2, (fwidth(a) * 3.0 + fwidth(zw) * 0.03) * 15.0);
  let toEye = u.b.xyz - in.w;
  let dist = length(toEye);

  // On the ground (the road and the tops and faces of the banks), or up
  // in the blowing snow?
  let ground = bank(xr, z);
  let up = smoothstep(ground + 0.2, ground + 1.6, yr);

  // The road: snow packed by the traffic into two tracks down each lane,
  // grey and glazed, the asphalt showing through them here and there;
  // loose snow between them in soft drifts; the paint just showing; and
  // snow snaking across in the wind.
  var g = 0.74 + 0.1 * noise(vec3f(xr * 0.6, 0.5, zw * 0.25), 512.0) + 0.05 * noise(vec3f(xr * 6.0, 1.5, zw * 3.0), 6144.0);
  var rut = 0.0;
  let wob = noise(vec3f(xr * 4.0, 2.0, zw), 2048.0) - 0.5;
  for (var lane = -1.0; lane < 2.0; lane += 1.0) {
    let e = abs(abs(xr - lane * 3.6) - 0.9) + 0.1 * wob;
    rut += 1.0 - smoothstep(0.16, 0.3, e);
  }
  rut = clamp(rut, 0.0, 1.0) * (1.0 - smoothstep(ROAD_W - 1.0, ROAD_W, abs(xr)));
  let tread = noise(vec3f(xr * 20.0, 4.0, zw * 12.0), 24576.0);
  let bare = smoothstep(0.6, 0.78, noise(vec3f(xr * 2.0, 3.0, zw * 0.75), 1536.0));
  g = mix(g, 0.6 + 0.08 * tread, rut * 0.7);
  g = mix(g, 0.3 + 0.06 * tread, rut * bare * 0.6);
  let dash = step(fract(ph(8u, z) / TAU), 0.25);
  let paint = (1.0 - smoothstep(0.06, 0.1, abs(abs(xr) - 1.8))) * dash + (1.0 - smoothstep(0.07, 0.11, abs(abs(xr) - (ROAD_W - 0.5))));
  g = mix(g, 0.95, paint * smoothstep(0.45, 0.7, noise(vec3f(xr * 2.0, 5.0, zw * 2.0), 4096.0)) * 0.35);
  let snake = noise(vec3f(xr * 0.3 - t * 1.4, 7.0, zw * 2.5), 5120.0) * noise(vec3f(xr * 0.9 - t * 2.1, 2.0, zw * 0.75), 1536.0);
  g = mix(g, 0.9, 0.5 * smoothstep(0.3, 0.6, snake));
  // The banks: heaped, lumpy, clean.
  let heap = smoothstep(ROAD_W - 0.2, ROAD_W + 0.8, abs(xr));
  g = mix(g, 0.86 + 0.12 * noise(vec3f(xr * 1.5, yr * 2.0, zw * 0.75), 1536.0), heap);

  // Lit by the white sky all round, and your headlights.
  let sky = 0.62 + 0.3 * n.y;
  let hl = headlights(in.w, n);
  var col = vec3f(g) * (sky + hl * 1.4 + u.g.w * 0.05 * exp(-dist * 0.1));
  // A little sheen on the ruts, where they've glazed over.
  let r = reflect(-toEye / dist, n);
  col += vec3f(0.5) * rut * pow(max(r.z, 0.0), 30.0) * (1.0 - heap);

  let fog = pow(smoothstep(u.c.w, u.d.z, dist), 0.7);
  col = mix(col, u.c.rgb, fog);

  // Up in the blowing snow: a white wall, streaming, and over it the storm,
  // which comes down to meet the snow and only goes white far off.
  if (up > 0.001) {
    let stream = fbm(vec3f(cos(a) * 3.0 - t * 0.3, sin(a) * 3.0, zw * 0.25), 512.0);
    var w = mix(0.8 + 0.18 * stream, u.c.r, fog);
    let high = smoothstep(ground + 0.8, ground + 3.0, yr);
    if (high > 0.001) {
      let far = pow(smoothstep(25.0, u.d.z, dist), 1.6);
      w = mix(w, mix(storm(a, zw, u.b.w, aa), u.c.r, far), high);
    }
    col = mix(col, vec3f(w), up);
  }
  return vec4f(col * u.d.w, 1.0);
}
