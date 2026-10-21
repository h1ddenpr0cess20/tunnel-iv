#version 300 es
// Snow, for WebGL 2: the same particles as particles.wgsl, made up from
// their index alone and drawn as streaks, and the lamps glowing through it.
precision highp float;
precision highp int;

layout(std140) uniform U {
  mat4 vp;      // view-projection now
  mat4 pvp;     // and STREAK seconds ago
  vec4 a;       // resolution.xy, time, device pixel ratio
  vec4 b;       // window offset, unused, wind now, wind then
  vec4 c;       // window, near, far, gain
  vec4 d;       // particle count, how many are blizzard, how many plume, lamps
  vec4 e;       // focal length px, longest streak px, speed, STREAK
  vec4 f;       // the middle of your headlights xyz, half the gap between them
  vec4 g;       // which way they point xyz, snow on the blade
  vec4 h;       // your truck's right xyz, the beacon
  vec4 i;       // your truck's frame: where it is xyz, headlights on
  vec4 fx;      // its right
  vec4 fy;      // its up
  vec4 fz;      // its forward
  vec4 p[3];    // phases (s * K + K0) mod 2π
  vec4 kw[3];   // wave numbers K
  vec4 lamp[16];// xyz, brightness
} u;

out vec2 vQ;
flat out vec4 vF;

const float TAU = 6.2831853;
const float SPAN = 26.0;
const float HIGH = 13.0;
const float BLADE_Z = 2.3;
const float BLADE_W = 1.9;
const float BLADE_YAW = 0.26;

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float rnd(uint v) { return float(pcg(v)) / 4294967296.0; }

float P(uint i) { return u.p[i / 4u][i % 4u]; }
float K(uint i) { return u.kw[i / 4u][i % 4u]; }
float ph(uint i, float z) { return P(i) + z * K(i); }

vec2 centre(float z) {
  return vec2(14.0 * sin(ph(0u, z)) + 6.0 * sin(ph(1u, z)) + 3.0 * sin(ph(9u, z)),
              3.0 * sin(ph(2u, z)) + 1.2 * sin(ph(3u, z)) + 0.6 * sin(ph(10u, z)));
}
float wrapf(float v, float span) { return v - span * floor(v / span); }

float headlights(vec3 p) {
  float k = 0.0;
  for (int j = 0; j < 2; j++) {
    float side = j == 0 ? -1.0 : 1.0;
    vec3 d = p - (u.f.xyz + u.h.xyz * side * u.f.w);
    float dist = length(d);
    k += smoothstep(0.84, 0.95, dot(d / dist, u.g.xyz)) / (1.0 + dist * dist * 0.006);
  }
  return k * u.i.w;
}

vec3 thrown(uint h, float age) {
  float speed = u.e.z;
  float lx = (rnd(h + 3u) * 2.0 - 1.0) * BLADE_W;
  float x0 = lx * cos(BLADE_YAW);
  float z0 = BLADE_Z + 0.45 - lx * sin(BLADE_YAW);
  bool powder = rnd(h + 9u) < 0.3;
  float along = 0.5 + 0.5 * lx / BLADE_W;
  float vx = (0.3 + 4.5 * rnd(h + 4u)) * (0.25 + along) - 0.6 * rnd(h + 8u);
  float vy = 1.0 + 4.5 * rnd(h + 5u);
  float vz = speed * (0.1 + 0.3 * rnd(h + 6u));
  float drag = 2.0;
  if (powder) { drag = 5.0; vy *= 0.7; vx *= 0.6; }
  float fwd = vz * (1.0 - exp(-drag * age)) / drag;
  float g = powder ? 1.5 : 5.0;
  return vec3(x0 + vx * (1.0 - exp(-drag * 0.4 * age)) / (drag * 0.4), 1.15 + vy * age - 0.5 * g * age * age, z0 + fwd - speed * age);
}
vec3 truck(vec3 p) { return u.i.xyz + u.fx.xyz * p.x + u.fy.xyz * p.y + u.fz.xyz * p.z; }

void none() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vQ = vec2(0.0);
  vF = vec4(0.0);
}

void main() {
  uint ii = uint(gl_InstanceID);
  int vi = gl_VertexID;
  vec2 res = u.a.xy;
  float W = u.c.x;
  float t = u.a.z;
  uint count = uint(u.d.x);
  uint nFall = uint(u.d.y);
  float tau = u.e.w;
  vec2 cn = vec2((vi == 1 || vi == 2 || vi == 4) ? 1.0 : -1.0, (vi == 2 || vi == 4 || vi == 5) ? 1.0 : -1.0);

  if (ii >= count) {
    vec4 L = u.lamp[ii - count];
    vec4 ca = u.vp * vec4(L.xyz, 1.0);
    if (ca.w < 0.3) { none(); return; }
    vec2 A = (ca.xy / ca.w * 0.5 + 0.5) * res;
    float scatter = 1.0 + 2.5 * smoothstep(8.0, 60.0, ca.w);
    float rad = max(2.0 * u.a.w, 0.08 * u.e.x / ca.w) * scatter;
    float I = L.w * 1.6 * u.c.w * (1.0 - 0.6 * smoothstep(u.c.z * 0.6, u.c.z, ca.w));
    float ext = 5.0 * rad;
    gl_Position = vec4((A + cn * ext) / res * 2.0 - 1.0, clamp(ca.z / ca.w, 0.0, 1.0) * 2.0 - 1.0, 1.0);
    vQ = cn * ext;
    vF = vec4(0.0, rad, I, 0.0);
    return;
  }

  vec3 pNow;
  vec3 pThen;
  float size;
  float lum;
  float I = 1.0;

  if (ii < nFall) {
    uint h = ii * 8u + 17u;
    float zoff = rnd(h) * W - u.b.x;
    if (zoff < 0.0) zoff += W;
    float z = zoff - u.c.y;
    float x0 = rnd(h + 1u) * SPAN;
    float y0 = rnd(h + 2u) * HIGH;
    float fall = 0.7 + 1.1 * rnd(h + 5u);
    float blow = 0.6 + 0.7 * rnd(h + 6u);
    float fl = rnd(h + 7u) * TAU;
    vec2 c = centre(z);
    float xn = wrapf(x0 + u.b.z * blow + 0.25 * sin(t * 1.7 + fl), SPAN) - SPAN * 0.5;
    float yn = wrapf(y0 - t * fall + 0.15 * sin(t * 2.3 + fl * 1.3), HIGH);
    float xt = wrapf(x0 + u.b.w * blow + 0.25 * sin((t - tau) * 1.7 + fl), SPAN) - SPAN * 0.5;
    float yt = wrapf(y0 - (t - tau) * fall + 0.15 * sin((t - tau) * 2.3 + fl * 1.3), HIGH);
    if (abs(xt - xn) > 2.0 || abs(yt - yn) > 2.0) { xt = xn; yt = yn; }
    pNow = vec3(c + vec2(xn, yn), z);
    pThen = vec3(c + vec2(xt, yt), z);
    size = 0.007 + 0.016 * pow(rnd(h + 3u), 2.0);
    lum = 0.95 + 0.2 * rnd(h + 4u);
    I = smoothstep(1.2, 2.2, z);
  } else {
    uint j = ii - nFall;
    uint h = j * 16u + 3000017u;
    if (rnd(h + 2u) > u.g.w) { none(); return; }
    bool powder = rnd(h + 9u) < 0.3;
    float life = powder ? 1.5 + rnd(h) : 0.7 + 0.7 * rnd(h);
    float age = fract(t / life + rnd(h + 1u)) * life;
    vec3 a = thrown(h, age);
    if (a.y < 0.0) { none(); return; }
    pNow = truck(a);
    pThen = truck(thrown(h, max(age - tau, 0.0)) - vec3(0.0, 0.0, u.e.z * min(tau, age)));
    size = powder ? 0.05 + 0.06 * rnd(h + 10u) : 0.012 + 0.03 * rnd(h + 10u);
    lum = 0.85;
    I = (powder ? 0.35 : 1.0) * smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.6, 1.0, age / life));
    I *= smoothstep(0.9, 1.6, dot(pNow - u.i.xyz, u.fz.xyz));
  }

  vec4 ca = u.vp * vec4(pNow, 1.0);
  if (ca.w < 0.15) { none(); return; }
  vec4 cb = u.pvp * vec4(pThen, 1.0);
  if (cb.w < 0.15) cb = ca;
  vec2 A = (ca.xy / ca.w * 0.5 + 0.5) * res;
  vec2 B = (cb.xy / cb.w * 0.5 + 0.5) * res;

  lum *= 0.85 + 2.6 * headlights(pNow) + 0.4 * u.h.w * exp(-ca.w * 0.15);
  float fade = 1.0 - smoothstep(u.c.z * 0.25, u.c.z * 0.85, ca.w);
  float blur = 1.0 + 3.0 * (1.0 - smoothstep(1.5, 4.5, ca.w));
  float rTrue = size * u.e.x / ca.w * blur;
  float minR = 0.7 * u.a.w;
  float rad = clamp(rTrue, minR, 9.0 * u.a.w);
  I = I * fade * u.c.w * min(1.0, (rTrue * rTrue) / (rad * rad)) / (blur * blur);
  if (I < 0.004) { none(); return; }

  vec2 d = A - B;
  float len = length(d);
  if (len > u.e.y) { d *= u.e.y / len; len = u.e.y; }
  vec2 dir = len > 0.01 ? d / max(len, 1e-4) : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  I *= mix(1.0, (2.0 * rad) / (2.0 * rad + len), 0.6);

  float ext = 2.5 * rad + 1.0;
  float hl = len * 0.5;
  float along = cn.x * (hl + ext);
  float across = cn.y * ext;
  vec2 px = A - d * 0.5 + dir * along + perp * across;

  gl_Position = vec4(px / res * 2.0 - 1.0, clamp(ca.z / ca.w, 0.0, 1.0) * 2.0 - 1.0, 1.0);
  vQ = vec2(along, across);
  vF = vec4(hl, rad, I, lum);
}
