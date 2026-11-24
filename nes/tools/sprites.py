"""Sprites from the remastered game's models, rendered by the engine (build/models, see tools/capture/), turned
black and white, shrunk to the sizes things are at as they come at you, and cut into 8x16 tiles."""
import os, json
import numpy as np
from PIL import Image

F = 160.0
ZB = [6.0, 8.5, 12.0, 17.0, 24.0, 34.0, 48.0, 68.0]     # depth buckets (m)
MODELS = os.path.join(os.path.dirname(__file__), '..', 'models')
SPECS = json.load(open(os.path.join(os.path.dirname(__file__), 'capture', 'specs.json')))
SPAN = {s['name']: s['span'] for s in SPECS}

# What's drawn, and from which captures: (name, [captures (animation frames)], buckets used)
VIEWS = [
    ('dig_front', ['dig_front_0', 'dig_front_14'], range(8)),
    ('dig_side', ['dig_side_0', 'dig_side_14'], range(8)),
    ('walk', ['walk_0', 'walk_8'], range(8)),
    ('leap', ['leap_3'], range(8)),
    ('car_light', ['car_light_0'], range(8)),
    ('car_dark', ['car_dark_0'], range(8)),
    ('spin45', ['car_light_45'], range(8)),
    ('spin90', ['car_light_90'], range(8)),
    ('spin135', ['car_light_135'], range(8)),
    ('spin180', ['car_light_180'], range(8)),
    ('buried', ['buried'], range(8)),
    ('semi', ['semi'], range(8)),
    ('tire', ['tire_0', 'tire_1'], range(8)),
    ('mound', ['mound'], range(8)),
]

def load(name):
    im = np.asarray(Image.open(os.path.join(MODELS, name + '.png')).convert('RGBA')).astype(float) / 255
    return im

def shrink(im, k):
    """Area-average an RGBA image by factor k (< 1), alpha premultiplied."""
    h, w = im.shape[:2]
    nh, nw = max(1, int(round(h * k))), max(1, int(round(w * k)))
    pm = im.copy(); pm[..., :3] *= pm[..., 3:4]
    out = np.asarray(Image.fromarray((pm * 255).astype(np.uint8), 'RGBA').resize((nw, nh), Image.BOX)).astype(float) / 255
    a = out[..., 3:4]
    rgb = np.where(a > 0, out[..., :3] / np.maximum(a, 1e-6), 0)
    return np.concatenate([rgb, a], axis=2)

def to_levels(im, lo=0.18, hi=0.55):
    """-> 0 clear, 1 dark, 2 mid, 3 light."""
    lum = im[..., 0] * 0.3 + im[..., 1] * 0.59 + im[..., 2] * 0.11
    lv = np.where(lum < lo, 1, np.where(lum < hi, 2, 3))
    return np.where(im[..., 3] > 0.45, lv, 0).astype(np.uint8)

MAX_W = 56               # 7 sprites: a line holds 8, and the marker rod has one
ROBOT = ('dig_', 'walk', 'leap')
ROBOT_SCALE = 1.2         # robots drawn a bit bigger than life, so they read at a distance

def bold(im):
    """A robot: a dark silhouette (thin limbs kept, thickened a pixel when small), lit edges mid grey."""
    a = im[..., 3]
    lum = im[..., 0] * 0.3 + im[..., 1] * 0.59 + im[..., 2] * 0.11
    on = a > 0.22
    if im.shape[0] < 40:                     # small: thicken sideways so limbs survive
        on = on | np.roll(on, 1, axis=1)
    lv = np.where(lum > 0.62, 2, 1)
    lv = np.where(a > 0.22, lv, 1)
    return np.where(on, lv, 0).astype(np.uint8)

def heap(lv):
    """A snow heap: white on top, its shadowed underside and rim grey, so it stands off the white road."""
    on = lv > 0
    h = on.shape[0]
    rows = np.nonzero(on.any(axis=1))[0]
    out = np.where(on, 3, 0).astype(np.uint8)
    if len(rows) == 0:
        return out
    top, bot = rows.min(), rows.max()
    cut = top + max(1, int(round((bot - top + 1) * 0.6)))
    out[cut:][on[cut:]] = 2
    edge = on & ~(np.roll(on, 1, 0) & np.roll(on, -1, 0) & np.roll(on, 1, 1) & np.roll(on, -1, 1))
    out[edge] = 2
    return out

def sprite(name, b):
    im = load(name)
    robot = name.startswith(ROBOT)
    k = (F / ZB[b]) / (256.0 / SPAN[name]) * (ROBOT_SCALE if robot else 1)
    sm = shrink(im, k)
    lv = bold(sm) if robot else to_levels(sm)
    if name == 'mound':
        lv = heap(lv)
        if lv.shape[1] > MAX_W:              # a drift is wide: squeezed to what a line of sprites can hold
            ys, xs = np.nonzero(lv)
            lv = lv[:, xs.min():xs.max() + 1]
            idx = (np.arange(MAX_W) * lv.shape[1] / MAX_W).astype(int)
            lv = lv[:, idx]
            sm = sm[:, :MAX_W]
    ys, xs = np.nonzero(lv)
    if len(ys) == 0:
        return None
    # anchor: the bottom of it, at the middle of the picture (where the model stands)
    ax = sm.shape[1] / 2.0
    ay = ys.max() + 1
    x0, x1, y0 = xs.min(), xs.max() + 1, ys.min()
    return lv[y0:ay, x0:x1], x0 - ax, y0 - ay       # pixels, offset of their top left from the anchor

def metasprite(px, ox, oy):
    """Cut into 8x16 tiles on a grid from the top left; empty tiles dropped."""
    h, w = px.shape
    H, W = -(-h // 16) * 16, -(-w // 8) * 8
    pad = np.zeros((H, W), np.uint8)
    pad[H - h:, :w] = px                     # bottom-aligned, so it stands on the anchor
    oy -= H - h
    parts = []
    for r in range(H // 16):
        for c in range(W // 8):
            t = pad[r * 16:r * 16 + 16, c * 8:c * 8 + 8]
            if t.any():
                parts.append((int(round(ox)) + c * 8, int(round(oy)) + r * 16, t))
    return parts

if __name__ == '__main__':
    total = 0
    for view, caps, bs in VIEWS:
        n = []
        for b in bs:
            k = 0
            for cname in caps:
                s = sprite(cname, b)
                if s: k += len(metasprite(*s))
            n.append(k)
        total += sum(n)
        print(view, n, sum(n))
    print('total', total)

# ---------------------------------------------------------------- packing
CAPS = {'semi': range(3, 8), 'spin45': range(1, 8), 'spin90': range(1, 8), 'spin135': range(1, 8), 'spin180': range(1, 8)}
COMMON_FROM = 6          # buckets from here on (48 m and further) live in the always-loaded bank

def tile16(t):
    """8x16 of 0..3 -> 32 bytes (two 8x8 tiles, NES planar)."""
    out = b''
    for half in (t[:8], t[8:]):
        p0 = bytes(int(sum(((int(half[y, x]) & 1) << (7 - x)) for x in range(8))) for y in range(8))
        p1 = bytes(int(sum((((int(half[y, x]) >> 1) & 1) << (7 - x)) for x in range(8))) for y in range(8))
        out += p0 + p1
    return out

POST_H = [2, 3, 4, 6, 8, 10, 13, 16]   # reflector post heights in px

def flakes_and_fittings():
    """Tiles that are always there: snowflakes and streaks, reflector posts, the marker rod, the pillar, a glow."""
    T = {}
    def blank(): return np.zeros((16, 8), np.uint8)
    t = blank(); t[0, 0] = 3; T['dot1'] = t
    t = blank(); t[0:2, 0:2] = 3; T['dot2'] = t
    for name, (dx, dy, n) in {'s45': (1, 1, 4), 's45l': (1, 1, 7), 's22': (2, 1, 7), 's67': (1, 2, 7), 'sv': (0, 1, 6), 'sh': (1, 0, 6)}.items():
        t = blank()
        x = y = 0.0
        for i in range(n):
            t[int(y), int(x)] = 3 if i > n // 3 else 2
            x += dx / max(dx, dy, 1) * (1 if dx else 0); y += dy / max(dx, dy, 1) * (1 if dy else 0)
            x = min(x, 7); y = min(y, 15)
        T[name] = t
    t = blank(); t[:, 3] = 1; T['post'] = t                      # a post: a dark line ...
    for h in POST_H:                                             # ... or a short one standing on the
        t = blank(); t[16 - h:, 3] = 1                           # tile's bottom, its reflector on top
        if h >= 8: t[16 - h:18 - h, 2:5] = 3
        elif h >= 4: t[16 - h:17 - h, 3:5] = 3
        T[f'post_h{h}'] = t
    t = blank(); t[:, 2] = 1; t[:, 3] = 2; T['rod'] = t
    t = blank(); t[4:, 2] = 1; t[4:, 3] = 2; t[0:4, 1:5] = 3; t[0, 1] = t[0, 4] = t[3, 1] = t[3, 4] = 0; T['rod_top'] = t
    t = np.ones((16, 8), np.uint8); T['pillar'] = t
    return T

def build():
    """-> (list of 1KB banks (bytes), meta): meta['views'][view][bucket] = (bank, [(dx, dy, tile)]) or None."""
    common = []                     # 8x16 tiles in the two always-loaded banks
    def put(lst, t, limit):
        b = tile16(t)
        if b in lst: return lst.index(b)
        lst.append(b)
        assert len(lst) <= limit, f'bank full ({limit})'
        return len(lst) - 1
    fit = flakes_and_fittings()
    fixed = {k: put(common, v, 32) for k, v in fit.items()}
    views = {}
    dyn = []                        # dynamic banks: lists of tiles
    groups = []                     # (view, [buckets], [frames per bucket]) packed together in one bank
    for view, caps, bs in VIEWS:
        bs = CAPS.get(view, bs)
        views[view] = {}
        pend = {}
        for b in range(8):
            if b not in bs:
                views[view][b] = None
                continue
            frames = []
            for cname in caps:
                s = sprite(cname, b)
                frames.append(metasprite(*s) if s else [])
            if b == 7 and views[view].get(6) is not None:
                views[view][b] = views[view][6]           # the smallest: as at 48 m
                continue
            if b >= COMMON_FROM and view.startswith('spin'):
                views[view][b] = views['car_light'][b]      # that far off, a car is a car
                continue
            if b >= COMMON_FROM and view != 'semi':
                frames = [frames[0]] * len(frames)
                recs = [[(dx, dy, put(common, t, 32)) for dx, dy, t in fr] for fr in frames]
                views[view][b] = ('common', recs)
                continue
            if sum(len(fr) for fr in frames) > 32:        # too big to animate: hold the first frame
                frames = [frames[0]] * len(frames)
            pend[b] = frames
        # the near ones each on their own; 12 m and further together, so one bank covers the middle distance
        size = lambda bl: len(set(tile16(t) for b in bl for fr in pend[b] for _, _, t in fr))
        cur = []
        for b in sorted(pend):
            if b < 2:
                groups.append((view, [b])); continue
            if cur and size(cur + [b]) > 32:
                groups.append((view, cur)); cur = []
            cur.append(b)
        if cur: groups.append((view, cur))
        views[view]['_pend'] = pend
    def fits(bank, view, bl):
        trial = list(bank)
        for b in bl:
            for fr in views[view]['_pend'][b]:
                for _, _, t in fr:
                    tb = tile16(t)
                    if tb not in trial: trial.append(tb)
        return len(trial) <= 32
    for view, bl in groups:                     # first fit
        for i, bank in enumerate(dyn):
            if fits(bank, view, bl): break
        else:
            dyn.append([]); i = len(dyn) - 1
        for b in bl:
            frames = views[view]['_pend'][b]
            views[view][b] = (i, [[(dx, dy, put(dyn[i], t, 32)) for dx, dy, t in fr] for fr in frames])
    for view in views: views[view].pop('_pend', None)
    print(f'sprites: {len(common)} common tiles, {len(dyn)} banks of the rest ({sum(map(len, dyn))} tiles)')
    pad = lambda lst, n: b''.join(lst) + bytes(32 * (n - len(lst)))
    banks = [pad(common, 32)] + [pad(d, 32) for d in dyn]
    return banks, {'views': views, 'fixed': fixed}

if __name__ == '__main__':
    build()
