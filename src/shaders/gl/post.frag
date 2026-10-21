#version 300 es
// The picture from the driver's seat, for WebGL 2 (see post.wgsl).
precision highp float;

layout(std140) uniform U {
  vec4 a;   // exposure, vignette, flash, fade
  vec4 b;   // resolution.xy, time, grain
  vec4 c;   // colour to fade to, seconds into the wipers' cycle
  vec4 d;   // wipers' cycle, seconds they take across and back, cab shown, device pixel ratio
  vec4 e;   // depth mod 2048, how far the storm has swirled
} u;
uniform sampler2D hdr;
out vec4 outColor;

const float PI = 3.14159265;
const float REST = 3.05;
const float TOP = 0.98;
const float ARM = 0.6;
const float BLADE0 = 0.26;
const float BLADE1 = 1.0;
const float HC = 2.5;
const float RX = 10.5;
const float RY = 6.5;
const vec2 EYE = vec2(-0.55, 2.55);

float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), w.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), w.x), w.y);
}
float fbm2(vec2 p) {
  return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 7.1) + 0.125 * vnoise(p * 4.1 + 3.3) + 0.0625 * vnoise(p * 8.3 + 1.7);
}
float hash3(vec3 p) {
  vec3 q = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
float noise3(vec3 p, float per) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 w = f * f * (3.0 - 2.0 * f);
  float z0 = i.z - per * floor(i.z / per);
  float z1 = z0 + 1.0 >= per ? 0.0 : z0 + 1.0;
  vec3 a = vec3(i.xy, z0);
  vec3 b = vec3(i.xy, z1);
  return mix(
    mix(mix(hash3(a), hash3(a + vec3(1.0, 0.0, 0.0)), w.x),
        mix(hash3(a + vec3(0.0, 1.0, 0.0)), hash3(a + vec3(1.0, 1.0, 0.0)), w.x), w.y),
    mix(mix(hash3(b), hash3(b + vec3(1.0, 0.0, 0.0)), w.x),
        mix(hash3(b + vec3(0.0, 1.0, 0.0)), hash3(b + vec3(1.0, 1.0, 0.0)), w.x), w.y), w.z);
}
float storm(float a, float zw, float flow) {
  float x = a * 3.0;
  float y = zw * 0.0625;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float nx = noise3(vec3(x * 0.625 + 3.1 * fi, flow + 1.7 * fi, y * 0.625), 80.0) - 0.5;
    float ny = noise3(vec3(x * 0.625 + 8.3 * fi + 5.0, flow + 4.2 * fi, y * 0.625), 80.0) - 0.5;
    x += 2.2 * nx;
    y += 2.2 * ny;
  }
  float s = sin(x * 15.0);
  vec3 q = vec3(x * 0.375, 2.0 + flow * 0.5, y * 0.375);
  float ink = smoothstep(0.3, 0.7, (noise3(q, 48.0) * 0.5 + noise3(q * 2.0 + vec3(1.7, 9.2, 0.0), 96.0) * 0.25) / 0.75);
  float band = smoothstep(-0.1, 1.0, 0.5 + 0.5 * s) * (0.3 + 0.7 * ink);
  float e = (s - 0.95) / 0.05;
  return max(0.04 + 0.52 * band, exp(-e * e) * 0.9);
}

float behind(vec2 m) {
  vec3 d = normalize(vec3(m.x * 0.6, m.y * 0.17 - 0.02, -1.0));
  vec2 e = vec2(EYE.x, EYE.y - HC);
  float A = (d.x / RX) * (d.x / RX) + (d.y / RY) * (d.y / RY);
  float B = 2.0 * (e.x * d.x / (RX * RX) + e.y * d.y / (RY * RY));
  float C = (e.x / RX) * (e.x / RX) + (e.y / RY) * (e.y / RY) - 1.0;
  float dist = (-B + sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
  float c;
  float tr = d.y < 0.0 ? -EYE.y / d.y : 1e6;
  if (tr < dist) {
    dist = tr;
    float x = EYE.x + d.x * tr;
    float zw = u.e.x + d.z * tr;
    float lane = 1.0 - smoothstep(1.6, 2.0, abs(x));
    float wr = (x - 2.4) / 0.5;
    float windrow = exp(-wr * wr);
    c = mix(0.74, 0.4 + 0.1 * noise3(vec3(x * 3.0, 1.0, zw * 2.0), 4096.0), lane);
    c = mix(c, 0.92, windrow * 0.8);
  } else {
    vec2 p = e + d.xy * dist;
    float a = atan(p.y / RY, p.x / RX);
    float high = smoothstep(0.5, 4.0, p.y);
    c = mix(0.82, storm(a, u.e.x + d.z * dist, u.e.y), high);
  }
  return mix(c, 0.86, pow(smoothstep(4.0, 80.0, dist), 0.8));
}

float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

float scene(vec2 p) {
  vec2 res = u.b.xy;
  ivec2 q = clamp(ivec2(p), ivec2(0), ivec2(res) - 1);
  vec3 c = texelFetch(hdr, q, 0).rgb;
  vec3 t = vec3(1.0) - exp(-c * u.a.x);
  float l = dot(t, vec3(0.3, 0.59, 0.11));
  return l * l * (3.0 - 2.0 * l) * 0.92 + l * 0.08;
}

float wiperAt(float tau) {
  if (tau >= u.d.y) return REST;
  return REST + (TOP - REST) * (0.5 - 0.5 * cos(2.0 * PI * tau / u.d.y));
}
float wipedAgo(float th) {
  float k = (th - REST) / (TOP - REST);
  if (k < 0.0 || k > 1.0) return 1e6;
  float t1 = acos(1.0 - 2.0 * k) / (2.0 * PI) * u.d.y;
  float t2 = u.d.y - t1;
  float tau = u.c.w;
  if (tau < t1) return tau + u.d.x - t2;
  if (tau < t2) return tau - t1;
  return tau - t2;
}

void main() {
  vec2 res = u.b.xy;
  float H = res.y;
  float M = min(res.x, res.y);
  vec2 p = gl_FragCoord.xy;   // y up already
  float t = u.b.z;
  bool cab = u.d.z > 0.5;

  float dashTop = H * 0.075 + H * 0.012 * sin(PI * p.x / res.x);
  float pillar = M * 0.03 + p.y * 0.05 * M / H;
  float roof = res.y - M * 0.045;
  float corner = M * 0.07;
  float inside = 1.0;
  float edge = 1e6;
  if (cab) {
    float cx = min(p.x - pillar, res.x - pillar - p.x);
    float cy = min(p.y - dashTop, roof - p.y);
    vec2 dc = vec2(max(corner - cx, 0.0), max(corner - (roof - p.y), 0.0));
    edge = dc.x > 0.0 && dc.y > 0.0 ? corner - length(dc) : min(cx, cy);
    inside = smoothstep(-1.0, 1.0, edge);
  }

  float col = scene(p);

  vec2 pivots[2] = vec2[2](vec2(res.x * 0.27, H * 0.035), vec2(res.x * 0.69, H * 0.035));
  float reach = max(res.x * 0.4, H * 0.72);

  if (cab && inside > 0.0) {
    float cs = H / 13.0;
    vec2 cell = floor(p / cs);
    float h1 = hash2(cell);
    if (h1 < 0.5) {
      vec2 ctr = (cell + 0.25 + 0.5 * vec2(hash2(cell + 7.1), hash2(cell + 3.3))) * cs;
      float period = 4.0 + 7.0 * hash2(cell + 1.9);
      float age = mod(t + hash2(cell + 5.7) * period, period);
      float ago = 1e6;
      for (int k = 0; k < 2; k++) {
        vec2 d = ctr - pivots[k];
        float r = length(d) / reach;
        if (r > BLADE0 && r < BLADE1) ago = min(ago, wipedAgo(atan(d.y, d.x)));
      }
      float melt = smoothstep(period * 0.15, period * 0.5, age);
      float size = cs * (0.06 + 0.16 * pow(hash2(cell + 9.4), 2.0)) * (1.0 - 0.3 * melt);
      vec2 d = p - ctr;
      vec2 dir = d / max(length(d), 1e-3);
      float ragged = 0.55 + 0.9 * vnoise(dir * 2.2 + h1 * 40.0) * (1.0 - melt) + 0.45 * melt;
      float r = length(d) / (size * ragged);
      float soft = mix(0.45, 0.12, melt);
      float shape = 1.0 - smoothstep(1.0 - soft, 1.0, r);
      float on = step(age, ago) * smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(period * 0.8, period, age));
      if (shape * on > 0.001) {
        float ice = 0.82 + 0.18 * vnoise(d / size * 3.0 + h1 * 9.0);
        float bent = scene(ctr - d * 0.7 * (1.0 + 0.4 * r * r)) * 0.85 + 0.05;
        float rim = smoothstep(0.55, 0.95, r) * 0.25;
        float glint = (1.0 - smoothstep(0.0, 0.22, length(d / size - vec2(-0.3, 0.35)))) * 0.6;
        float drop = bent * (1.0 - rim) + glint;
        col = mix(col, mix(ice, drop, melt), shape * on * inside * mix(0.85, 0.9, melt));
      }
    }

    float fr = fbm2(p / (H * 0.05));
    float reachF = H * (0.02 + 0.09 * fr * fr);
    float frost = (1.0 - smoothstep(0.0, reachF, edge)) * (0.5 + 0.5 * fbm2(p / (H * 0.012) + 4.0));
    col = mix(col, 0.86 + 0.1 * fr, frost * 0.7);

    float th = wiperAt(u.c.w);
    vec2 dir = vec2(cos(th), sin(th));
    vec2 side = vec2(-dir.y, dir.x);
    float soft = H * 0.0025;
    float cover = 0.0;
    for (int k = 0; k < 2; k++) {
      vec2 o = pivots[k];
      float along = clamp(dot(p - o, dir) / (reach * ARM), 0.0, 1.0);
      float arm = seg(p, o, o + dir * reach * ARM + side * H * 0.004) - mix(H * 0.008, H * 0.0035, along);
      float bl = seg(p, o + dir * reach * BLADE0 + side * H * 0.005, o + dir * reach * BLADE1 + side * H * 0.005) - H * 0.0028;
      cover = max(cover, 1.0 - smoothstep(-soft, soft, min(arm, bl)));
      vec2 dp = p - o;
      float rr = length(dp) / reach;
      if (rr > BLADE0 && rr < BLADE1) {
        float ago = wipedAgo(atan(dp.y, dp.x));
        col -= 0.035 * (1.0 - smoothstep(0.0, 0.8, ago)) * (0.5 + 0.5 * sin(length(dp) * 0.35));
      }
    }
    col = mix(col, 0.018, cover * inside);
  }

  vec2 uv = p / res - 0.5;
  col *= 1.0 - u.a.y * pow(length(uv * vec2(res.x / res.y, 1.0)) * 1.1, 2.4);

  if (cab) {
    float frame = 0.035 + 0.05 * (1.0 - smoothstep(0.0, H * 0.02, -edge)) + 0.02 * p.y / H;
    if (p.y < dashTop) {
      frame = 0.03 + 0.06 * (1.0 - smoothstep(0.0, H * 0.01, dashTop - p.y));
      vec2 g = vec2(res.x * 0.5 - H * 0.42, H * 0.035);
      for (int k = 0; k < 3; k++) {
        float gd = length(p - g - vec2(float(k) * H * 0.06, 0.0));
        frame += 0.12 * (1.0 - smoothstep(H * 0.017, H * 0.02, gd)) * (1.0 - smoothstep(H * 0.012, H * 0.016, gd)) + 0.05 * (1.0 - smoothstep(H * 0.016, H * 0.019, gd));
      }
    }
    col = mix(frame, col, inside);
    vec2 mc = vec2(res.x * 0.5, roof - M * 0.07);
    vec2 md = abs(p - mc) - vec2(M * 0.12, M * 0.032);
    float mirror = length(max(md, vec2(0.0))) + min(max(md.x, md.y), 0.0) - M * 0.01;
    float stem = 1.0 - smoothstep(M * 0.004, M * 0.006, abs(p.x - mc.x));
    col = mix(col, 0.04, max(1.0 - smoothstep(-1.0, 1.0, mirror), stem * step(mc.y, p.y) * step(p.y, roof)));
    float glass = 1.0 - smoothstep(-M * 0.009, -M * 0.007, mirror);
    if (glass > 0.0) {
      vec2 m = (p - mc) / vec2(M * 0.121, M * 0.033);
      col = mix(col, behind(m) * 0.85 * (1.0 - 0.25 * dot(m, m) * 0.5), glass);
    }
  }

  col = mix(col, 0.95, u.a.z * 0.7);
  col = mix(col, u.c.r, u.a.w);
  float n = fract(sin(dot(gl_FragCoord.xy + t * 37.0, vec2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) * 0.06 * u.b.w;
  outColor = vec4(vec3(max(col, 0.0)), 1.0);
}
