// WebGPU where the browser has it, WebGL 2 where it doesn't.
// ?renderer=webgl or ?renderer=webgpu pins one.
import { createWebGPU } from './gpu.js';
import { createWebGL } from './gl.js';

export async function createRenderer(canvas, meshes) {
  const want = new URLSearchParams(location.search).get('renderer');
  if (want !== 'webgl') {
    try {
      return { canvas, ...(await createWebGPU(canvas, meshes)) };
    } catch (err) {
      if (want === 'webgpu') throw err;
      console.warn('WebGPU unavailable, using WebGL 2:', err.message);
    }
  }
  // A canvas that has had a WebGPU context can't give a WebGL one: start afresh.
  const fresh = canvas.cloneNode(false);
  canvas.replaceWith(fresh);
  return { canvas: fresh, ...createWebGL(fresh, meshes) };
}
