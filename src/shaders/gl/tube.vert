#version 300 es
// The highway, for WebGL 2: the same mesh as tube.wgsl, made up from the
// vertex index alone.
precision highp float;
precision highp int;

layout(std140) uniform U {
  mat4 vp;
  vec4 a;       // resolution.xy, time, device pixel ratio
  vec4 b;       // eye xyz, how far the storm has swirled
  vec4 c;       // fog colour rgb, fog start
  vec4 d;       // depth mod 2048, near, far, gain
  vec4 e;       // the middle of your headlights xyz, half the gap between them
  vec4 f;       // which way they point xyz, on
  vec4 g;       // your truck's right xyz, the beacon
  vec4 p[3];    // phases (s * K + K0) mod 2π
  vec4 k[3];    // wave numbers K
} u;

out vec3 vW;
out vec3 vN;
out vec3 vLoc;

const float TAU = 6.2831853;
const int RINGS = 160;
const int SEGS = 128;
const float ROAD_W = 6.6;
const float HC = 2.5;
const float RX = 10.5;
const float RY = 6.5;

float P(int i) { return u.p[i / 4][i % 4]; }
float K(int i) { return u.k[i / 4][i % 4]; }
float ph(int i, float z) { return P(i) + z * K(i); }

vec2 centre(float z) {
  return vec2(14.0 * sin(ph(0, z)) + 6.0 * sin(ph(1, z)) + 3.0 * sin(ph(9, z)),
              3.0 * sin(ph(2, z)) + 1.2 * sin(ph(3, z)) + 0.6 * sin(ph(10, z)));
}
float bank(float x, float z) {
  float side = x >= 0.0 ? 1.0 : -1.0;
  float h = 2.0 + 0.5 * sin(ph(4, z) + side * 1.9) + 0.35 * sin(ph(5, z) + side * 0.7);
  return h * smoothstep(ROAD_W, ROAD_W + 2.4, abs(x));
}
vec2 section(float a, float z) {
  float x = RX * cos(a);
  return vec2(x, max(HC + RY * sin(a), bank(x, z)));
}
vec3 at(float a, float z) { return vec3(centre(z) + section(a, z), z); }

void main() {
  int q = gl_VertexID / 6;
  int c = gl_VertexID % 6;
  int di = (c == 1 || c == 2 || c == 4) ? 1 : 0;
  int dj = (c == 2 || c == 4 || c == 5) ? 1 : 0;
  int ring = q / SEGS + di;
  int seg = q % SEGS + dj;
  float zn = u.d.y;
  float zf = u.d.z;
  float z = -zn + (zn + zf) * pow(float(ring) / float(RINGS), 1.6);
  float a = float(seg) / float(SEGS) * TAU - 1.5707963;
  vec3 pos = at(a, z);
  vec3 dA = at(a + 0.004, z) - at(a - 0.004, z);
  vec3 dZ = at(a, z + 0.1) - at(a, z - 0.1);
  gl_Position = u.vp * vec4(pos, 1.0);
  gl_Position.z = gl_Position.z * 2.0 - gl_Position.w;
  vW = pos;
  vec3 cr = cross(dZ, dA);
  vN = length(cr) > 1e-6 ? normalize(cr) : vec3(0.0, 1.0, 0.0);
  vLoc = vec3(section(a, z), a);
}
