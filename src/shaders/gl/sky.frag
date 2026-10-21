#version 300 es
// The light at the end, for WebGL 2 (see sky.wgsl).
precision highp float;

layout(std140) uniform U {
  vec4 a;   // centre (NDC xy), radius (NDC y units), aspect w/h
  vec4 b;   // time, gain, pixels per radius, unused
  vec4 c;   // fog colour rgb
} u;
in vec2 vNdc;
out vec4 outColor;

void main() {
  vec2 d = (vNdc - u.a.xy) * vec2(u.a.w, 1.0) / max(u.a.z, 1e-4);
  float r = length(d);
  vec3 col = u.c.rgb;
  float ang = atan(d.y, d.x);
  float rays = 0.75 + 0.25 * sin(ang * 9.0 + u.b.x * 0.2) * sin(ang * 5.0 - u.b.x * 0.13);
  col += vec3(1.0, 0.93, 0.78) * (2.2 * exp(-r * r * 2.0) + 0.5 * exp(-r * 0.7) * rays);
  col += vec3(1.0, 1.0, 0.97) * 3.0 * (1.0 - smoothstep(0.5, 0.75, r));
  outColor = vec4(col * u.b.y, 1.0);
}
