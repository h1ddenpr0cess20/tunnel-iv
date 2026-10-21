// The way out, at the end of the road: the white everything fades into,
// and at the heart of it, a glare of light. Always just ahead.

struct U {
  a: vec4f,   // centre (NDC xy), radius (NDC y units), aspect w/h
  b: vec4f,   // time, gain, pixels per radius, unused
  c: vec4f,   // fog colour rgb, unused
};
@group(0) @binding(0) var<uniform> u: U;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) ndc: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  var o: VO;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.ndc = p[i];
  return o;
}

@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let d = (in.ndc - u.a.xy) * vec2f(u.a.w, 1.0) / max(u.a.z, 1e-4);
  let r = length(d);
  var col = u.c.rgb;
  // The glare: white at the heart, a haze round it, and rays turning slowly.
  let ang = atan2(d.y, d.x);
  let rays = 0.75 + 0.25 * sin(ang * 9.0 + u.b.x * 0.2) * sin(ang * 5.0 - u.b.x * 0.13);
  col += vec3f(1.0, 0.93, 0.78) * (2.2 * exp(-r * r * 2.0) + 0.5 * exp(-r * 0.7) * rays);
  col += vec3f(1.0, 1.0, 0.97) * 3.0 * (1.0 - smoothstep(0.5, 0.75, r));
  return vec4f(col * u.b.y, 1.0);
}
