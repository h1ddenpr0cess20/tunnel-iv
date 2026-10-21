// WebGPU renderer: the light at the end, the highway, the things on it
// and the snow into a half-float picture, then src/shaders/post.wgsl
// onto the screen. src/gl.js draws the same frame with WebGL 2.
import particlesCode from './shaders/particles.wgsl?raw';
import tubeCode from './shaders/tube.wgsl?raw';
import thingsCode from './shaders/things.wgsl?raw';
import skyCode from './shaders/sky.wgsl?raw';
import postCode from './shaders/post.wgsl?raw';
import { SIZES, TUBE_VERTS } from './frame.js';

const HDR = 'rgba16float';
const DEPTH = 'depth24plus';

export async function createWebGPU(canvas, meshes) {
  if (!navigator.gpu) throw new Error('This browser does not support WebGPU.');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No WebGPU adapter is available on this device.');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('This canvas has no WebGPU context.');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  async function shader(name, code) {
    const module = device.createShaderModule({ code });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter(m => m.type === 'error');
    if (errors.length) throw new Error(errors.map(m => `${name}:${m.lineNum}: ${m.message}`).join('\n'));
    return module;
  }
  const [mParticles, mTube, mThings, mSky, mPost] = await Promise.all([
    shader('particles.wgsl', particlesCode), shader('tube.wgsl', tubeCode), shader('things.wgsl', thingsCode),
    shader('sky.wgsl', skyCode), shader('post.wgsl', postCode),
  ]);

  // Snow is premultiplied by its coverage; lamps only add light.
  const over = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' };
  const skyPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: mSky, entryPoint: 'vs' },
    fragment: { module: mSky, entryPoint: 'fs', targets: [{ format: HDR }] },
    depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'always' },
  });
  const tubePipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: mTube, entryPoint: 'vs' },
    fragment: { module: mTube, entryPoint: 'fs', targets: [{ format: HDR }] },
    depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less' },
  });
  const thingsPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: mThings, entryPoint: 'vs',
      buffers: [{
        arrayStride: 32,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32' },
          { shaderLocation: 3, offset: 28, format: 'float32' },
        ],
      }],
    },
    fragment: { module: mThings, entryPoint: 'fs', targets: [{ format: HDR }] },
    depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less' },
  });
  const particlePipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: mParticles, entryPoint: 'vs' },
    fragment: { module: mParticles, entryPoint: 'fs', targets: [{ format: HDR, blend: { color: over, alpha: over } }] },
    depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'less' },
  });
  const postPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: mPost, entryPoint: 'vs' },
    fragment: { module: mPost, entryPoint: 'fs', targets: [{ format }] },
  });

  const ubuf = size => device.createBuffer({ size: size * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const buf = {
    particles: ubuf(SIZES.particles), tube: ubuf(SIZES.tube), things: ubuf(SIZES.things), inst: ubuf(SIZES.inst),
    sky: ubuf(SIZES.sky), post: ubuf(SIZES.post),
  };
  const vbuf = device.createBuffer({ size: meshes.data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(vbuf, 0, meshes.data);

  const group = (pipe, entries) => device.createBindGroup({
    layout: pipe.getBindGroupLayout(0),
    entries: entries.map((resource, binding) => ({ binding, resource })),
  });
  const skyGroup = group(skyPipe, [{ buffer: buf.sky }]);
  const tubeGroup = group(tubePipe, [{ buffer: buf.tube }]);
  const thingsGroup = group(thingsPipe, [{ buffer: buf.things }, { buffer: buf.inst }]);
  const particleGroup = group(particlePipe, [{ buffer: buf.particles }]);

  let hdr = null, depth = null, postGroup = null, size = [0, 0];
  function targets(w, h) {
    if (size[0] === w && size[1] === h) return;
    size = [w, h];
    hdr?.destroy(); depth?.destroy();
    hdr = device.createTexture({ size: [w, h], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    depth = device.createTexture({ size: [w, h], format: DEPTH, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    postGroup = group(postPipe, [{ buffer: buf.post }, hdr.createView()]);
  }

  return {
    kind: 'webgpu',
    draw(f) {
      targets(canvas.width, canvas.height);
      const q = device.queue;
      for (const k of Object.keys(buf)) q.writeBuffer(buf[k], 0, f[k]);

      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: hdr.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
        depthStencilAttachment: { view: depth.createView(), depthLoadOp: 'clear', depthStoreOp: 'discard', depthClearValue: 1 },
      });
      pass.setPipeline(skyPipe);
      pass.setBindGroup(0, skyGroup);
      pass.draw(3);
      pass.setPipeline(tubePipe);
      pass.setBindGroup(0, tubeGroup);
      pass.draw(TUBE_VERTS);
      if (f.groups.length) {
        pass.setPipeline(thingsPipe);
        pass.setBindGroup(0, thingsGroup);
        pass.setVertexBuffer(0, vbuf);
        for (const g of f.groups) {
          const r = meshes.ranges[g.mesh];
          pass.draw(r.count, g.count, r.first, g.first);
        }
      }
      pass.setPipeline(particlePipe);
      pass.setBindGroup(0, particleGroup);
      pass.draw(6, f.count);
      pass.end();

      const post = enc.beginRenderPass({
        colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      });
      post.setPipeline(postPipe);
      post.setBindGroup(0, postGroup);
      post.draw(3);
      post.end();
      q.submit([enc.finish()]);
    },
  };
}
