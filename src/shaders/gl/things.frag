#version 300 es
// Things on the highway, for WebGL 2 (see things.wgsl).
precision highp float;

layout(std140) uniform U {
  mat4 vp;
  vec4 a;
  vec4 eye;
  vec4 fog;
  vec4 e;
  vec4 f;
  vec4 g;
} u;

in vec3 vN;
in vec3 vW;
in vec3 vM;
in vec3 vMN;
in float vHgt;
in float vCav;
flat in vec4 vMat;
flat in vec4 vAnim;
out vec4 outColor;

const int SNOW = 0;
const int TRAILER = 1;
const int TRACTOR = 2;
const int POST = 3;
const int WHITE = 10;
const int BLACK = 11;
const int VISOR = 12;
const int HANDLE = 13;
const int SCOOP = 14;
const int PAINT = 15;
const int GLASS = 16;
const int TIRE = 17;
const int RIM = 18;
const int TRIM = 19;
const int TAIL = 20;
const int LENS = 21;
const int STEEL = 22;
const int TIP = 23;

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

float headlights(vec3 p, vec3 n) {
  float k = 0.0;
  for (int i = 0; i < 2; i++) {
    float side = i == 0 ? -1.0 : 1.0;
    vec3 d = p - (u.e.xyz + u.g.xyz * side * u.e.w);
    float dist = length(d);
    vec3 l = d / dist;
    k += smoothstep(0.86, 0.96, dot(l, u.f.xyz)) * max(dot(n, -l), 0.0) / (1.0 + dist * dist * 0.004);
  }
  return k * u.f.w;
}

float paint(float s) {
  int k = int(fract(s * 13.7) * 5.0);
  if (k == 0) return 0.02;
  if (k == 1) return 0.05;
  if (k == 2) return 0.11;
  if (k == 3) return 0.22;
  return 0.42;
}

int finish(int region, int mat, vec3 m, vec3 mn) {
  if (region == 1) return WHITE;
  if (region == 2) return BLACK;
  if (region == 3) return WHITE;
  if (region == 7 || region == 8) return VISOR;
  if (region == 4 || region == 5) {
    float y = m.y;
    return y < 0.095 || (y > 0.46 && y < 0.57) || y > 0.86 ? BLACK : WHITE;
  }
  if (region == 6) return abs(m.x) > 0.135 || m.y < 1.08 ? BLACK : WHITE;
  if (region == 10) return HANDLE;
  if (region == 11) return SCOOP;
  if (region == 20) {
    float ax = abs(m.x);
    if (m.z < -2.0 && ax > 0.42 && ax < 0.86 && m.y > 0.66 && m.y < 0.9) return TAIL;
    if (m.z > 1.95 && ax > 0.38 && ax < 0.82 && m.y > 0.56 && m.y < 0.76) return LENS;
    if (m.y < 0.47) return TRIM;
    return PAINT;
  }
  if (region == 21) {
    if (mn.y > 0.8 || abs(m.z + 0.25) < 0.07 || m.y > 1.38) return PAINT;
    return GLASS;
  }
  if (region == 22) return TIRE;
  if (region == 23) return RIM;
  if (region == 30) return STEEL;
  if (region == 31 || region == 32) return BLACK;
  if (region == 33) return TIP;
  if (region == 40 || region == 41) return SNOW;
  return mat;
}

void main() {
  float seed = vMat.y;
  int region = int(vMat.z + 0.5);
  vec3 m = vM;
  vec3 mn = normalize(vMN);
  int mat = finish(region, int(vMat.x + 0.5), m, mn);
  vec3 n = normalize(vN);
  vec3 toEye = u.eye.xyz - vW;
  float dist = length(toEye);
  vec3 v = toEye / dist;
  if (dot(n, v) < 0.0 && (mat == SCOOP || mat == STEEL)) n = -n;

  float albedo = 0.5;
  float spec = 0.04;
  float shine = 16.0;
  float emit = 0.0;
  float cover = 1.0;
  float hl = headlights(vW, n);

  if (mat == SNOW) {
    vec3 q = vW * vec3(3.0, 6.0, 3.0);
    vec3 rip = vec3(noise(q + vec3(0.1, 0.0, 0.0)) - noise(q - vec3(0.1, 0.0, 0.0)), 0.0, noise(q + vec3(0.0, 0.0, 0.1)) - noise(q - vec3(0.0, 0.0, 0.1)));
    n = normalize(n + rip * 2.5);
    albedo = 0.72 + 0.08 * noise(m * 9.0);
    spec = 0.02;
    emit = 0.6 * step(0.985, hash(floor(vW * 40.0))) * hl;
    cover = 0.0;
  } else if (mat == WHITE) {
    albedo = 0.72;
    spec = 0.35; shine = 60.0;
    cover = 0.5;
    // Seams between the shells: down the middle of the chest and the front of each leg.
    if (region == 6 && abs(m.x) < 0.007 && mn.z > 0.2) { albedo = 0.12; }
    if ((region == 4 || region == 5) && abs(abs(m.x) - 0.11) < 0.006 && mn.z > 0.5) { albedo = 0.12; }
  } else if (mat == BLACK) {
    albedo = 0.025;
    spec = 0.3; shine = 40.0;
    cover = 0.5;
  } else if (mat == VISOR) {
    albedo = 0.01;
    spec = 0.6; shine = 120.0;
    if (region == 8) emit = 0.45 * (0.8 + 0.2 * sin(u.a.x * 3.0 + seed * 20.0));
    cover = 0.0;
  } else if (mat == HANDLE) {
    albedo = 0.07;
    spec = 0.15; shine = 30.0;
  } else if (mat == SCOOP) {
    albedo = 0.4 * (0.85 + 0.15 * noise(m * vec3(60.0, 60.0, 8.0)));
    spec = 0.3; shine = 40.0;
  } else if (mat == PAINT) {
    albedo = paint(seed);
    spec = 0.5; shine = 90.0;
    if (abs(mn.x) > 0.6 && (abs(m.z + 0.25) < 0.012 || abs(m.z - 0.95) < 0.012) && m.y < 0.9) albedo *= 0.3;
  } else if (mat == GLASS) {
    albedo = 0.015;
    spec = 0.6; shine = 100.0;
    cover = 0.2;
  } else if (mat == TIRE) {
    albedo = 0.03 * (0.8 + 0.4 * step(0.5, fract(atan(m.y, m.z) * 6.0)));
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
    emit = 0.15 + 1.1 * vAnim.y;
    cover = 0.0;
  } else if (mat == LENS) {
    albedo = 0.6;
    spec = 0.7; shine = 120.0;
    emit = 1.4;   // headlamps burn steadily
    cover = 0.0;
  } else if (mat == STEEL) {
    albedo = 0.05 * (0.7 + 0.6 * noise(m * vec3(3.0, 40.0, 3.0)));
    spec = 0.35; shine = 50.0;
    albedo = mix(albedo, 0.5, smoothstep(1.08, 1.14, m.y) * 0.6);
    cover = 0.5;
  } else if (mat == TIP) {
    albedo = 0.9;
    emit = 0.5;
    spec = 0.4; shine = 60.0;
    cover = 0.0;
  } else if (mat == TRAILER) {
    bool side = abs(mn.x) > 0.7;
    float zm = m.z * vMat.w;
    albedo = 0.62;
    if (side) {
      albedo *= 0.9 + 0.12 * sin(zm * 21.0);
      if (m.y > -0.9 && m.y < -0.78) {
        float on = step(0.5, fract(zm / 0.6));
        albedo = mix(0.1, 0.95, on);
        emit = on * hl * 1.5;
      }
    }
    if (abs(mn.z) > 0.7 && abs(m.x) < 0.012) albedo = 0.1;
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

  float settle = smoothstep(0.45, 0.8, n.y) * vAnim.z * cover * (0.55 + 0.45 * noise(vW * 7.0));
  float banked = (1.0 - smoothstep(0.0, 0.12 + 0.1 * noise(vW * 5.0), vHgt)) * cover;
  float snow = clamp(max(settle, banked), 0.0, 1.0);
  albedo = mix(albedo, 0.78, snow);
  spec = mix(spec, 0.03, snow);

  float sky = 0.48 + 0.25 * (0.5 + 0.5 * n.y);
  float key = 0.45 * max(dot(n, normalize(vec3(-0.35, 0.85, -0.4))), 0.0);
  float light = sky + key + hl * 1.7 + u.eye.w * 0.06 * exp(-dist * 0.1);
  float col = albedo * light * (1.0 - spec * 0.4) * vCav;

  vec3 r = reflect(-v, n);
  float fres = spec * (0.1 + 0.9 * pow(1.0 - max(dot(n, v), 0.0), 5.0));
  float env = mix(0.45, 0.95, smoothstep(-0.3, 0.3, r.y));
  col += env * fres;
  col += pow(max(dot(r, -u.f.xyz), 0.0), shine) * spec * hl * 3.0;
  col += emit;

  float fog = pow(smoothstep(u.a.y, u.a.z, dist), 1.2);
  outColor = vec4(mix(vec3(col), u.fog.rgb, fog) * u.a.w, 1.0);
}
