#version 300 es
precision highp float;

in vec2 vQ;
flat in vec4 vF;
out vec4 outColor;

void main() {
  float hl = vF.x;
  float rad = vF.y;
  float d = length(vec2(max(abs(vQ.x) - hl, 0.0), vQ.y));
  if (vF.w == 0.0) {
    float v = vF.z * (exp(-(d * d) / (0.5 * rad * rad)) + 0.25 * exp(-d / (rad * 1.6)));
    outColor = vec4(vec3(v), 0.0);
    return;
  }
  float tail = 0.2 + 0.8 * clamp((vQ.x + hl) / max(2.0 * hl, 1e-3), 0.0, 1.0);
  float core = exp(-(d * d) / (0.72 * rad * rad));
  float a = min(1.0, vF.z * (core + 0.08 * exp(-d / (rad * 1.3))) * tail);
  outColor = vec4(vec3(vF.w * a), a * 0.85);
}
