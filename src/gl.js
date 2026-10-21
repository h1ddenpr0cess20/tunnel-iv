// WebGL 2 renderer: the same frame as src/gpu.js, with the shaders in
// src/shaders/gl. Uniforms go in std140 blocks laid out like the WGSL ones,
// so both renderers take the same arrays.
import particlesVert from './shaders/gl/particles.vert?raw';
import particlesFrag from './shaders/gl/particles.frag?raw';
import tubeVert from './shaders/gl/tube.vert?raw';
import tubeFrag from './shaders/gl/tube.frag?raw';
import thingsVert from './shaders/gl/things.vert?raw';
import thingsFrag from './shaders/gl/things.frag?raw';
import fullscreenVert from './shaders/gl/fullscreen.vert?raw';
import skyFrag from './shaders/gl/sky.frag?raw';
import postFrag from './shaders/gl/post.frag?raw';
import { SIZES, TUBE_VERTS } from './frame.js';

export function createWebGL(canvas, meshes) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('This browser supports neither WebGPU nor WebGL 2.');
  const floatTarget = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');

  // In lite mode (`?lite`, for weak devices) the heaviest shader work (fine noise on the road, the
  // storm's detail, frost and droplets on the glass) is compiled out.
  const q = new URLSearchParams(location.search);
  const lite = q.has('lite') && q.get('lite') !== '0';

  function program(name, vs, fs, blocks) {
    const compile = (type, src, label) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, lite ? src.replace('#version 300 es\n', '#version 300 es\n#define LITE\n') : src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`${label}: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs, `${name}.vert`));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs, `${name}.frag`));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`${name}: ${gl.getProgramInfoLog(p)}`);
    for (const [block, binding] of Object.entries(blocks)) {
      gl.uniformBlockBinding(p, gl.getUniformBlockIndex(p, block), binding);
    }
    return p;
  }
  const BIND = { particles: 0, tube: 1, things: 2, inst: 3, sky: 4, post: 5 };
  const progParticles = program('particles', particlesVert, particlesFrag, { U: BIND.particles });
  const progTube = program('tube', tubeVert, tubeFrag, { U: BIND.tube });
  const progThings = program('things', thingsVert, thingsFrag, { U: BIND.things, D: BIND.inst });
  const progSky = program('sky', fullscreenVert, skyFrag, { U: BIND.sky });
  const progPost = program('post', fullscreenVert, postFrag, { U: BIND.post });
  const baseLoc = gl.getUniformLocation(progThings, 'base');
  gl.useProgram(progPost);
  gl.uniform1i(gl.getUniformLocation(progPost, 'hdr'), 0);

  const ubo = {};
  for (const [k, binding] of Object.entries(BIND)) {
    ubo[k] = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo[k]);
    gl.bufferData(gl.UNIFORM_BUFFER, SIZES[k] * 4, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, binding, ubo[k]);
  }

  const empty = gl.createVertexArray();
  const thingsVao = gl.createVertexArray();
  gl.bindVertexArray(thingsVao);
  const vbuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
  gl.bufferData(gl.ARRAY_BUFFER, meshes.data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 24);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 32, 28);
  gl.bindVertexArray(null);

  let fbo = null, hdr = null, depth = null, size = [0, 0];
  function targets(w, h) {
    if (size[0] === w && size[1] === h) return;
    size = [w, h];
    if (fbo) { gl.deleteFramebuffer(fbo); gl.deleteTexture(hdr); gl.deleteRenderbuffer(depth); }
    hdr = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, hdr);
    if (floatTarget) gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, w, h);
    else gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, hdr, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  }

  function upload(k, data) {
    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo[k]);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
  }

  return {
    kind: 'webgl',
    draw(f) {
      if (gl.isContextLost()) return;
      const w = canvas.width, h = canvas.height;
      targets(w, h);
      for (const k of Object.keys(BIND)) upload(k, f[k]);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, w, h);
      gl.depthMask(true);
      gl.clearColor(0, 0, 0, 1);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(empty);
      gl.useProgram(progSky);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.useProgram(progTube);
      gl.drawArrays(gl.TRIANGLES, 0, TUBE_VERTS);

      if (f.groups.length) {
        gl.useProgram(progThings);
        gl.bindVertexArray(thingsVao);
        for (const g of f.groups) {
          const r = meshes.ranges[g.mesh];
          gl.uniform1i(baseLoc, g.first);
          gl.drawArraysInstanced(gl.TRIANGLES, r.first, r.count, g.count);
        }
      }

      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(progParticles);
      gl.bindVertexArray(empty);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, f.count);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(progPost);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, hdr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
