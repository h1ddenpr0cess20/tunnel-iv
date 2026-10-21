#version 300 es
// The highway, for WebGL 2 (see tube.wgsl).
precision highp float;

layout(std140) uniform U {
  mat4 vp;
  vec4 a;
  vec4 b;
  vec4 c;
  vec4 d;
  vec4 e;
  vec4 f;
  vec4 g;
  vec4 p[3];
  vec4 k[3];
} u;

in vec3 vW;
in vec3 vN;
in vec3 vLoc;
out vec4 outColor;

const float TAU = 6.2831853;
const float ROAD_W = 6.6;

float P(int i) { return u.p[i / 4][i % 4]; }
float K(int i) { return u.k[i / 4][i % 4]; }
float ph(int i, float z) { return P(i) + z * K(i); }

float bank(float x, float z) {
  float side = x >= 0.0 ? 1.0 : -1.0;
  float h = 2.0 + 0.5 * sin(ph(4, z) + side * 1.9) + 0.35 * sin(ph(5, z) + side * 0.7);
  return h * smoothstep(ROAD_W, ROAD_W + 2.4, abs(x));
}

float hash(vec3 p) {
  vec3 q = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
float noise(vec3 p, float per) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 w = f * f * (3.0 - 2.0 * f);
  float z0 = i.z - per * floor(i.z / per);
  float z1 = z0 + 1.0 >= per ? 0.0 : z0 + 1.0;
  vec3 a = vec3(i.xy, z0);
  vec3 b = vec3(i.xy, z1);
  return mix(
    mix(mix(hash(a), hash(a + vec3(1.0, 0.0, 0.0)), w.x),
        mix(hash(a + vec3(0.0, 1.0, 0.0)), hash(a + vec3(1.0, 1.0, 0.0)), w.x), w.y),
    mix(mix(hash(b), hash(b + vec3(1.0, 0.0, 0.0)), w.x),
        mix(hash(b + vec3(0.0, 1.0, 0.0)), hash(b + vec3(1.0, 1.0, 0.0)), w.x), w.y), w.z);
}
float fbm(vec3 p, float per) {
  float v = 0.0;
  float amp = 0.5;
  vec3 q = p;
  float pr = per;
  for (int i = 0; i < 3; i++) {
    v += amp * noise(q, pr);
    q = q * 2.0 + vec3(1.7, 9.2, 0.0);
    pr *= 2.0;
    amp *= 0.5;
  }
  return v / 0.875;
}

float storm(float a, float zw, float flow, float aa) {
  float x = a * 3.0;
  float y = zw * 0.0625;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float nx = noise(vec3(x * 0.625 + 3.1 * fi, flow + 1.7 * fi, y * 0.625), 80.0) - 0.5;
    float ny = noise(vec3(x * 0.625 + 8.3 * fi + 5.0, flow + 4.2 * fi, y * 0.625), 80.0) - 0.5;
    x += 2.2 * nx;
    y += 2.2 * ny;
  }
  float s = sin(x * 15.0);
  float f = sin(x * 41.0 + y * 2.0);
  float ink = smoothstep(0.3, 0.7, fbm(vec3(x * 0.375, 2.0 + flow * 0.5, y * 0.375), 48.0));
  float band = mix(0.5, smoothstep(-0.1, 1.0, 0.5 + 0.5 * s), aa) * (0.3 + 0.7 * ink);
  float fine = mix(0.5, 0.5 + 0.5 * f, aa * aa);
  float e = (s - 0.95) / 0.05;
  float vein = exp(-e * e) * aa;
  return max(0.04 + 0.52 * band * (0.75 + 0.5 * fine), vein * 0.9);
}

float headlights(vec3 p, vec3 n) {
  float k = 0.0;
  for (int i = 0; i < 2; i++) {
    float side = i == 0 ? -1.0 : 1.0;
    vec3 L = u.e.xyz + u.g.xyz * side * u.e.w;
    vec3 d = p - L;
    float dist = length(d);
    vec3 l = d / dist;
    float cone = smoothstep(0.86, 0.96, dot(l, u.f.xyz));
    k += cone * max(dot(n, -l), 0.0) / (1.0 + dist * dist * 0.004);
  }
  return k * u.f.w;
}

void main() {
  float t = u.a.z;
  float z = vW.z;
  float zw = u.d.x + z;
  float xr = vLoc.x;
  float yr = vLoc.y;
  float a = vLoc.z;
  vec3 n = normalize(vN);
  float aa = 1.0 - smoothstep(0.6, 2.2, (fwidth(a) * 3.0 + fwidth(zw) * 0.03) * 15.0);
  vec3 toEye = u.b.xyz - vW;
  float dist = length(toEye);

  float ground = bank(xr, z);
  float up = smoothstep(ground + 0.2, ground + 1.6, yr);

  float g = 0.74 + 0.1 * noise(vec3(xr * 0.6, 0.5, zw * 0.25), 512.0) + 0.05 * noise(vec3(xr * 6.0, 1.5, zw * 3.0), 6144.0);
  float rut = 0.0;
  float wob = noise(vec3(xr * 4.0, 2.0, zw), 2048.0) - 0.5;
  for (int i = -1; i < 2; i++) {
    float e = abs(abs(xr - float(i) * 3.6) - 0.9) + 0.1 * wob;
    rut += 1.0 - smoothstep(0.16, 0.3, e);
  }
  rut = clamp(rut, 0.0, 1.0) * (1.0 - smoothstep(ROAD_W - 1.0, ROAD_W, abs(xr)));
  float tread = noise(vec3(xr * 20.0, 4.0, zw * 12.0), 24576.0);
  float bare = smoothstep(0.6, 0.78, noise(vec3(xr * 2.0, 3.0, zw * 0.75), 1536.0));
  g = mix(g, 0.6 + 0.08 * tread, rut * 0.7);
  g = mix(g, 0.3 + 0.06 * tread, rut * bare * 0.6);
  float dash = step(fract(ph(8, z) / TAU), 0.25);
  float paint = (1.0 - smoothstep(0.06, 0.1, abs(abs(xr) - 1.8))) * dash + (1.0 - smoothstep(0.07, 0.11, abs(abs(xr) - (ROAD_W - 0.5))));
  g = mix(g, 0.95, paint * smoothstep(0.45, 0.7, noise(vec3(xr * 2.0, 5.0, zw * 2.0), 4096.0)) * 0.35);
  float snake = noise(vec3(xr * 0.3 - t * 1.4, 7.0, zw * 2.5), 5120.0) * noise(vec3(xr * 0.9 - t * 2.1, 2.0, zw * 0.75), 1536.0);
  g = mix(g, 0.9, 0.5 * smoothstep(0.3, 0.6, snake));
  float heap = smoothstep(ROAD_W - 0.2, ROAD_W + 0.8, abs(xr));
  g = mix(g, 0.86 + 0.12 * noise(vec3(xr * 1.5, yr * 2.0, zw * 0.75), 1536.0), heap);

  float sky = 0.62 + 0.3 * n.y;
  float hl = headlights(vW, n);
  vec3 col = vec3(g) * (sky + hl * 1.4 + u.g.w * 0.05 * exp(-dist * 0.1));
  vec3 r = reflect(-toEye / dist, n);
  col += vec3(0.5) * rut * pow(max(r.z, 0.0), 30.0) * (1.0 - heap);

  float fog = pow(smoothstep(u.c.w, u.d.z, dist), 0.7);
  col = mix(col, u.c.rgb, fog);

  if (up > 0.001) {
    float stream = fbm(vec3(cos(a) * 3.0 - t * 0.3, sin(a) * 3.0, zw * 0.25), 512.0);
    float w = mix(0.8 + 0.18 * stream, u.c.r, fog);
    float high = smoothstep(ground + 0.8, ground + 3.0, yr);
    if (high > 0.001) {
      float far = pow(smoothstep(25.0, u.d.z, dist), 1.6);
      w = mix(w, mix(storm(a, zw, u.b.w, aa), u.c.r, far), high);
    }
    col = mix(col, vec3(w), up);
  }
  outColor = vec4(col * u.d.w, 1.0);
}
