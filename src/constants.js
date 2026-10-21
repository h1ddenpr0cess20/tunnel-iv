// Shared numbers. Units are metres; s is distance along the highway.
// x is across the road (right on the screen is +x), y up from the road,
// z ahead.

export const FAR = 90;           // the road fades into the white by here
export const NEAR = 4;           // and starts this far behind the eye
export const WINDOW = FAR + NEAR;
export const SPAWN_D = 96;       // things come out of the white this far ahead
export const EXIT_D = 1400;      // the light at the end always sits this far ahead
export const FOG_START = 5;
export const M_PER_UNIT = 1;

// The highway's mesh: rings along it, segments round it (see tube.wgsl).
export const RINGS = 160;
export const SEGS = 128;

// Three lanes and the shoulders, between snowbanks, under a vault of
// blowing snow: an ellipse RX across and RY high round a point HC above
// the road, its floor the road and the banks.
export const ROAD_W = 6.6;       // half the road, bank to bank
export const LANE = 3.6;
export const HC = 2.5;
export const RX = 10.5;
export const RY = 6.5;

// Your truck, in its own frame (x right, y up, z ahead, from the middle of
// its front axle on the road). It's a cab-over: you sit right over the
// front wheels and look straight down onto the blade.
export const X_MAX = 4.5;        // how far its middle can get from the road's
export const STEER_V = 8;        // how fast it moves across, m/s
export const EYE = [-0.55, 2.55, 0];
export const BLADE = { z: 2.3, w: 1.9, h: 1.15 };
export const HIT_R = 0.1;        // how close counts as hitting something
export const MISS_R = 1.1;       // and closer than this past it is a near miss
export const STREAK = 0.025;     // seconds of motion each streak of snow shows
export const HORN_COOL = 1.6;    // seconds between blasts of the horn

// Wave numbers for the road's bends (0-3 and 9-10), the banks' heights
// (4-5), the snow blowing across the road (6-7) and the lane dashes (8),
// with the phase each starts at. The shaders get (s * K + K0) mod 2π,
// worked out here in double precision.
export const K = [0.006, 0.013, 0.004, 0.011, 0.023, 0.041, 0.35, 0.13, Math.PI / 6, 0.021, 0.017, 0];
export const K0 = [0, 1.3, 2.1, 0.4, 0, 0.8, 0, 1.1, 0, 0.7, 2.9, 0];
const TAU = Math.PI * 2;

// Where the middle of the road is at depth z: x across, y up.
export function pathXY(z) {
  return [
    14 * Math.sin(z * K[0] + K0[0]) + 6 * Math.sin(z * K[1] + K0[1]) + 3 * Math.sin(z * K[9] + K0[9]),
    3 * Math.sin(z * K[2] + K0[2]) + 1.2 * Math.sin(z * K[3] + K0[3]) + 0.6 * Math.sin(z * K[10] + K0[10]),
  ];
}
// Which way it's heading: d/dz of pathXY.
export function pathD(z) {
  return [
    14 * K[0] * Math.cos(z * K[0] + K0[0]) + 6 * K[1] * Math.cos(z * K[1] + K0[1]) + 3 * K[9] * Math.cos(z * K[9] + K0[9]),
    3 * K[2] * Math.cos(z * K[2] + K0[2]) + 1.2 * K[3] * Math.cos(z * K[3] + K0[3]) + 0.6 * K[10] * Math.cos(z * K[10] + K0[10]),
  ];
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// How high the snow is x across the road at depth z: nothing on the road,
// rising into a bank either side. The same as bank() in the shaders.
export function bankH(x, z) {
  const side = Math.sign(x) || 1;
  const h = 2 + 0.5 * Math.sin(z * K[4] + K0[4] + side * 1.9) + 0.35 * Math.sin(z * K[5] + K0[5] + side * 0.7);
  return h * smooth(ROAD_W, ROAD_W + 2.4, Math.abs(x));
}

export function phases(s, out) {
  for (let i = 0; i < 12; i++) out[i] = (((s * K[i] + K0[i]) % TAU) + TAU) % TAU;
  return out;
}
