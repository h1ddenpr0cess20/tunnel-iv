import * as GFX from 'madness-engine/gfx';
import { createStage } from 'madness-engine/stage';
import { createElectricCar, createFreighter } from 'madness-engine/vehicles';
import { wheelKit } from 'madness-engine/vehicles/parts';
import { createRobots } from '../src/scene/robots.js';
import { moundGeometry, snowMaterial } from '../src/scene/shapes.js';

const host = document.getElementById('host');
const stage = await createStage(host, {
  backdrop: '#ff00ff', room: null, shadows: false, pixelRatio: 1,
  lights: { hemisphere: { sky: '#ffffff', ground: '#555555', intensity: 1.0 },
            key: { color: '#ffffff', intensity: 2.2, from: new GFX.Vector3(0.35, 0.8, -0.6).normalize() }, fill: null },
});
const { scene, camera } = stage;
const robots = createRobots();
const tireKit = wheelKit(GFX, {
  tire: new GFX.MeshStandardMaterial({ color: 0x18181a, roughness: 0.9, metalness: 0.04 }),
  rim: new GFX.MeshStandardMaterial({ color: 0xdfe3e7, roughness: 0.3, metalness: 0.5 }),
  trim: new GFX.MeshStandardMaterial({ color: 0x22262a, roughness: 0.55, metalness: 0.22 }),
}, { radius: 0.37, width: 0.25, style: 'treaded' });
const mound = moundGeometry(), snowM = snowMaterial();

let cur = null;
// view: camera `dist` m behind along -z (game +z ahead == engine z after mirror x), eye 2.55 m up, frame `span` m across
function shoot({ obj, dist = 14, span = 6, cy = 1 }) {
  if (cur) scene.remove(cur);
  cur = obj; scene.add(obj);
  camera.aspect = 1;
  camera.fov = 2 * Math.atan(span / 2 / dist) * 180 / Math.PI;
  camera.near = 0.5; camera.far = 200;
  camera.updateProjectionMatrix();
  camera.position.set(0, 2.55, -dist);
  camera.lookAt(0, 2.55 - (2.55 - cy) * 1, 0);
  camera.updateMatrixWorld();
  stage.renderer.render(scene, camera);
  return stage.renderer.domElement.toDataURL('image/png');
}
const g = (...ch) => { const o = new GFX.Group(); ch.forEach(c => o.add(c)); return o; };
window.cap = async (spec) => {
  let obj;
  const [kind, ...rest] = spec.kind.split(':');
  if (kind === 'robot') {
    const r = robots.robot(rest[0], 0); r.set(spec.frame || 0); obj = g(r.group); r.group.rotation.y = spec.yaw || 0;
  } else if (kind === 'car' || kind === 'freighter') {
    const c = (kind === 'car' ? createElectricCar : createFreighter)(GFX, { paint: spec.paint || '#e9edf0' });
    obj = g(c.group); c.group.rotation.y = spec.yaw || 0; if (spec.off) c.group.position.set(...spec.off);
    if (spec.buried) {
      const m = new GFX.Mesh(mound, snowM); m.scale.set(1.55, 0.57, 3.2); m.position.set(0, 0.4 + 0.35, 1.3);
      c.group.position.y = -0.35; obj.add(m);
    }
  } else if (kind === 'tire') {
    const t = tireKit.make('loose', 1); obj = g(t); t.rotation.x = spec.spin || 0; t.position.y = 0.37;
  } else if (kind === 'mound') {
    const m = new GFX.Mesh(mound, snowM); m.scale.set(...(spec.scl || [2, 0.6, 1.4])); obj = g(m);
  }
  return shoot({ obj, ...spec });
};
window.ready = true;
