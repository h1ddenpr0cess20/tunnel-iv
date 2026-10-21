#version 300 es
// Things on the highway, for WebGL 2 (see things.wgsl).
precision highp float;

struct Inst {
  vec4 pos;     // xyz, finish (see MAT in game.js)
  vec4 q;       // turn
  vec4 scl;     // size xyz, seed
  vec4 rad;     // xy: up off the road, z: where the road is along it, w: 1 if on it
  vec4 anim;    // legs' swing, lamps lit, snow on it, snow churning
};
layout(std140) uniform U {
  mat4 vp;
  vec4 a;       // time, fog start, fog end, gain
  vec4 eye;     // eye xyz, the beacon
  vec4 fog;     // fog colour rgb
  vec4 e;       // the middle of your headlights xyz, half the gap between them
  vec4 f;       // which way they point xyz, on
  vec4 g;       // your truck's right xyz
} u;
layout(std140) uniform D { Inst inst[200]; } di;
uniform int base;   // WebGL 2 has no first instance, so each mesh's range starts here

layout(location = 0) in vec3 p0;
layout(location = 1) in vec3 n0;
layout(location = 2) in float cav;
layout(location = 3) in float region;

out vec3 vN;
out vec3 vW;
out vec3 vM;
out vec3 vMN;
out float vHgt;
out float vCav;
flat out vec4 vMat;    // finish, seed, region, length
flat out vec4 vAnim;

const float HIP_Y = 0.92;

vec3 qrot(vec4 q, vec3 v) {
  vec3 t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}
float hash(vec3 p) {
  vec3 q = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 w = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), w.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), w.x), w.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), w.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), w.x), w.y), w.z);
}

void main() {
  Inst it = di.inst[base + gl_InstanceID];
  int reg = int(region + 0.5);
  float t = u.a.x;
  vec3 p = p0;
  vec3 n = n0;
  if (reg == 4 || reg == 5) {
    float a = it.anim.x * (reg == 4 ? 1.0 : -1.0);
    float c = cos(a);
    float s = sin(a);
    vec3 d = p - vec3(0.0, HIP_Y, 0.0);
    p = vec3(0.0, HIP_Y, 0.0) + vec3(d.x, d.y * c - d.z * s, d.y * s + d.z * c);
    n = vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
  } else if (reg == 40) {
    float a = -t * 2.5;
    float c = cos(a);
    float s = sin(a);
    vec3 r = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
    float k = noise(r * 2.5 + vec3(0.0, t * 1.3, -t * 2.0)) - 0.5;
    p = p + n * k * 0.3 * it.anim.w;
  }
  vec3 w = it.pos.xyz + qrot(it.q, p * it.scl.xyz);
  gl_Position = u.vp * vec4(w, 1.0);
  gl_Position.z = gl_Position.z * 2.0 - gl_Position.w;
  vN = qrot(it.q, n / it.scl.xyz);
  vW = w;
  vM = p;
  vMN = n;
  vHgt = it.rad.w > 0.5 ? dot(w.xy, it.rad.xy) - it.rad.z : 10.0;
  vCav = cav;
  vMat = vec4(it.pos.w, it.scl.w, float(reg), it.scl.z);
  vAnim = it.anim;
}
