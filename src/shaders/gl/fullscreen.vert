#version 300 es
// One triangle over the whole screen.
out vec2 vNdc;

void main() {
  vec2 p = vec2(gl_VertexID == 2 ? 3.0 : -1.0, gl_VertexID == 0 ? -3.0 : 1.0);
  vNdc = p;
  gl_Position = vec4(p, 0.0, 1.0);
}
