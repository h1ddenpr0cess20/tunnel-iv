"""Numpy port of the original's tube.wgsl (road, banks, the wall of blowing snow, the storm) for the NES picture.

The NES camera: f = 160 px, the horizon at y = 104, the eye 2.55 m up and 0.55 m left of the truck's middle,
looking straight down the road. Everything along the road that the NES animates repeats: the paint, the bare
patches in the ruts and the storm overhead, so a few frames loop seamlessly.
"""
import numpy as np

F = 160.0
CX, HY = 128.0, 104.0
EYE_X, EYE_Y = -0.55, 2.55
ROAD_W, HC, RX, RY = 6.6, 2.5, 10.5, 6.5
FAR, FOG_START = 90.0, 5.0
FOG = 0.85
DASH = 12.0                    # the lane paint repeats every 12 m (K[8] = pi/6)
STORM_L = 51.2                 # the storm's loop along the road
SS = 2                         # supersampling (for antialiasing the storm)

def fract(x): return x - np.floor(x)
def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def hash3(x, y, z):
    qx = fract(x * 0.3183099 + 0.1) * 17.0
    qy = fract(y * 0.3183099 + 0.2) * 17.0
    qz = fract(z * 0.3183099 + 0.3) * 17.0
    return fract(qx * qy * qz * (qx + qy + qz))

def noise(x, y, z, per):
    """Value noise, its lattice wrapping every `per` cells along z (as the shader's)."""
    ix, iy, iz = np.floor(x), np.floor(y), np.floor(z)
    fx, fy, fz = x - ix, y - iy, z - iz
    wx, wy, wz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    z0 = iz - per * np.floor(iz / per)
    z1 = np.where(z0 + 1 >= per, 0.0, z0 + 1)
    def lay(zz):
        a = hash3(ix, iy, zz); b = hash3(ix + 1, iy, zz)
        c = hash3(ix, iy + 1, zz); d = hash3(ix + 1, iy + 1, zz)
        return (a + (b - a) * wx) + ((c + (d - c) * wx) - (a + (b - a) * wx)) * wy
    l0, l1 = lay(z0), lay(z1)
    return l0 + (l1 - l0) * wz

def fbm(x, y, z, per):
    v, amp = 0.0, 0.5
    for _ in range(3):
        v = v + amp * noise(x, y, z, per)
        x, y, z = x * 2 + 1.7, y * 2 + 9.2, z * 2
        per *= 2
        amp *= 0.5
    return v / 0.875

def storm(a, zw, flow=3.0, aa=1.0):
    """The ink overhead (tube.wgsl storm()), looping every STORM_L metres along the road."""
    x = a * 3.0
    y = zw * 0.0625
    P = STORM_L * 0.0625 * 0.625            # lattice cells per loop along z: 2
    for i in range(5):
        nx = noise(x * 0.625 + 3.1 * i, flow + 1.7 * i + 0 * x, y * 0.625, P) - 0.5
        ny = noise(x * 0.625 + 8.3 * i + 5.0, flow + 4.2 * i + 0 * x, y * 0.625, P) - 0.5
        x = x + 2.2 * nx
        y = y + 2.2 * ny
    s = np.sin(x * 15.0)
    f = np.sin(x * 41.0 + y * 2.0 * 0)      # (its y term doesn't loop: the fine bands run along the road)
    ink = smoothstep(0.3, 0.7, fbm(x * 0.375, 2.0 + flow * 0.5 + 0 * x, y * 0.625, P))
    band = (0.5 + (smoothstep(-0.1, 1.0, 0.5 + 0.5 * s) - 0.5) * aa) * (0.3 + 0.7 * ink)
    fine = 0.5 + (0.5 * f) * aa * aa
    e = (s - 0.95) / 0.05
    vein = np.exp(-e * e) * aa
    return np.maximum(0.04 + 0.52 * band * (0.75 + 0.5 * fine), vein * 0.9)

def bank(x):
    return 2.0 * smoothstep(ROAD_W, ROAD_W + 2.4, np.abs(x))

def rays(xs, ys, eye_x=EYE_X):
    dx = (xs + 0.5 - CX) / F
    dy = (HY - ys - 0.5) / F
    return dx, dy

def vault_hit(dx, dy, eye_x=EYE_X):
    """Depth where a ray from the eye meets the vault's ellipse (it's inside it)."""
    # ((ex + dx z)/RX)^2 + ((EYE_Y - HC + dy z)/RY)^2 = 1
    ey = EYE_Y - HC
    A = (dx / RX) ** 2 + (dy / RY) ** 2
    B = 2 * (eye_x * dx / RX ** 2 + ey * dy / RY ** 2)
    C = (eye_x / RX) ** 2 + (ey / RY) ** 2 - 1
    return (-B + np.sqrt(B * B - 4 * A * C)) / (2 * A)

def ground_hit(dx, dy, eye_x=EYE_X, zmax=400.0):
    """Depth where a downward ray meets the road or a bank (marched), or the vault if it rises over the bank."""
    z = np.full(dx.shape, zmax)
    hit = np.zeros(dx.shape, bool)
    zs = np.concatenate([np.linspace(0.5, 20, 160), np.geomspace(20, zmax, 200)])
    prev = None
    for zz in zs:
        x = eye_x + dx * zz
        y = EYE_Y + dy * zz
        under = (y <= bank(x)) & ~hit
        z = np.where(under, zz, z)
        hit |= under
    return z, hit

def scene(xs, ys, zw0=0.0, dash_ph=0.0, eye_x=EYE_X, storm_on=True):
    """Light (0..1) at screen pixels xs, ys (arrays). zw0: how far along the road (storm, bare patches);
    dash_ph: the paint's offset along the road, in metres."""
    dx, dy = rays(xs, ys)
    out = np.zeros(dx.shape)
    zv = np.where(dy > -1e-6, vault_hit(dx, np.maximum(dy, -1e-6), eye_x), 1e9)
    zg, hit = ground_hit(dx, dy, eye_x)
    use_g = hit & (zg < zv)
    # --- ground
    z = np.where(use_g, zg, 1.0)
    xr = eye_x + dx * z
    yr = EYE_Y + dy * z
    zw = zw0 + z
    g = np.full(z.shape, 0.76)
    rut = np.zeros(z.shape)
    for lane in (-1, 0, 1):
        e = np.abs(np.abs(xr - lane * 3.6) - 0.9)
        rut = rut + (1 - smoothstep(0.16, 0.3, e))
    rut = np.clip(rut, 0, 1) * (1 - smoothstep(ROAD_W - 1, ROAD_W, np.abs(xr)))
    # Bare patches along the ruts, repeating with the paint.
    u = fract((zw + dash_ph) / DASH)
    bare = smoothstep(0.6, 0.78, noise(xr * 2.0, 3.0 + 0 * xr, u * 4.0, 4.0))
    g = g + (0.6 - g) * rut * 0.7
    g = g + (0.3 - g) * rut * bare * 0.6
    dash = (fract((z + dash_ph) / DASH) < 0.25).astype(float)
    paint = (1 - smoothstep(0.06, 0.1, np.abs(np.abs(xr) - 1.8))) * dash + (1 - smoothstep(0.07, 0.11, np.abs(np.abs(xr) - (ROAD_W - 0.5))))
    g = g + (0.95 - g) * paint * 0.5
    heap = smoothstep(ROAD_W - 0.2, ROAD_W + 0.8, np.abs(xr))
    g = g + (0.9 - g) * heap
    dist = np.sqrt((xr - eye_x) ** 2 + (yr - EYE_Y) ** 2 + z ** 2)
    col = g * 0.95
    fog = smoothstep(FOG_START, FAR, dist) ** 0.7
    gcol = col + (FOG - col) * fog
    # --- up: the wall of blowing snow and the storm
    z2 = np.where(use_g, 1.0, np.minimum(zv, 1e4))
    xv = eye_x + dx * z2
    yv = EYE_Y + dy * z2
    a = np.arctan2((yv - HC) / RY, xv / RX)
    ground = bank(xv)
    dist2 = np.sqrt((xv - eye_x) ** 2 + (yv - EYE_Y) ** 2 + z2 ** 2)
    fog2 = smoothstep(FOG_START, FAR, dist2) ** 0.7
    w = 0.86 + (FOG - 0.86) * fog2
    high = smoothstep(ground + 0.8, ground + 3.0, yv)
    far = smoothstep(25.0, FAR, dist2) ** 1.6
    if storm_on:
        aa = 1.0
        if a.ndim == 2:
            fa = np.abs(np.gradient(a, axis=0)) + np.abs(np.gradient(a, axis=1))
            zz = np.minimum(z2, 400.0)
            fz = np.abs(np.gradient(zz, axis=0)) + np.abs(np.gradient(zz, axis=1))
            aa = 1 - smoothstep(0.6, 2.2, (fa * 3 + fz * 0.03) * 15 / SS)
        st = storm(a, zw0 + z2, aa=aa)
        w = w + ((st + (FOG - st) * far) - w) * high
    out = np.where(use_g, gcol, w)
    return out

def windscreen(xs, ys):
    """The cab round the glass (post.wgsl): 0 outside the windscreen, 1 inside; `edge` px in from the edge."""
    H = 240.0
    p_y = H - ys - 0.5
    p_x = xs + 0.5
    pillar = 240 * 0.03 + p_y * 0.05
    roof = H - 16.0            # the HUD rows sit on the roof
    corner = 16.0
    cx = np.minimum(p_x - pillar, 256 - pillar - p_x)
    cy = roof - p_y
    dcx = np.maximum(corner - cx, 0)
    dcy = np.maximum(corner - cy, 0)
    edge = np.where((dcx > 0) & (dcy > 0), corner - np.sqrt(dcx ** 2 + dcy ** 2), np.minimum(cx, cy))
    return edge
