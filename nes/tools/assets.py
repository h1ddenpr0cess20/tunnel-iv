"""Builds the NES picture: CHR banks (chr.bin) and the tables the ROM reads (data.inc).

The screen, by rows of tiles:
  0-1    the cab roof with the HUD (fixed tiles, R1)
  2-11   the storm overhead: NF frames that loop as you drive (R0, a bank per 4 rows per frame)
  12     the white wall at the horizon (with the road's first bank)
  13-23  the road: a 512 px wide picture, sheared row by row as you steer and as it bends (R0, banks per few
         rows per phase of the paint and the ruts going by)
  24-29  your blade and the dash (fixed)
"""
import os, sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
import render as R
import quant as Q
from font import FONT, glyph

OUT = os.path.join(os.path.dirname(__file__), '..')
NF = 16                                   # storm frames
ROAD_GROUPS = [(12, 16, 4), (16, 19, 8), (19, 21, 16), (21, 23, 16), (23, 24, 16)]   # rows [a, b), phases
PREVIEW = '--preview' in sys.argv

def tile_bytes(px):
    px = np.asarray(px, np.uint8)
    p0 = [int(sum(((int(px[y, x]) & 1) << (7 - x)) for x in range(8))) for y in range(8)]
    p1 = [int(sum((((int(px[y, x]) >> 1) & 1) << (7 - x)) for x in range(8))) for y in range(8)]
    return bytes(p0 + p1)

def cut(q, r0, r1, c0, c1):
    return [[q[r * 8:r * 8 + 8, c * 8:c * 8 + 8] for c in range(c0, c1)] for r in range(r0, r1)]

# ---------------------------------------------------------------- the frame round the glass
def glass_mask(xs, ys):
    """1 inside the windscreen (rows 2-12): 8 px pillars both sides, the top corners rounded."""
    e = np.minimum(xs + 0.5 - 8, 248 - xs - 0.5)
    top = ys + 0.5 - 16
    c = 14.0
    dx = np.maximum(c - e, 0); dy = np.maximum(c - top, 0)
    edge = np.where((dx > 0) & (dy > 0), c - np.sqrt(dx * dx + dy * dy), np.minimum(e, top))
    return edge

def frost(img, edge, ys, xs):
    fr = R.fbm(xs / 12.0, ys / 12.0, 0 * xs + 0.5, 1e9)
    reach = 2 + 9 * fr * fr
    k = (1 - R.smoothstep(0, reach, edge)) * (0.5 + 0.5 * R.fbm(xs / 3.0 + 4, ys / 3.0, 0 * xs + 1.5, 1e9))
    return img + ((0.86 + 0.1 * fr) - img) * k * 0.7

def sky_frame(k):
    ss = 2
    img = Q.ss_render(R.scene, 0, 256, 16, 96, ss=ss, zw0=k * R.STORM_L / NF)
    ys, xs = np.mgrid[16:96, 0:256].astype(float)
    e = glass_mask(xs, ys)
    img = frost(img, e, ys, xs)
    img = np.where(e > 0, img, 0.03)
    return img

def wall_row():
    img = Q.ss_render(R.scene, 0, 256, 96, 104, ss=2, zw0=0.0)
    ys, xs = np.mgrid[96:104, 0:256].astype(float)
    e = glass_mask(xs, ys)
    img = frost(img, e, ys, xs)
    return np.where(e > 0, img, 0.03)

def road_tone(img):
    """Snow reads white, as in the original: packed snow ~0.75 goes near white, the ruts to the light grey."""
    return np.clip(0.72 + (img - 0.55) * 1.12, 0, 1)

def road_rows(ph, y0, y1):
    """The 512-wide road picture rows y0..y1 (screen x = picture x - 128 when you're in the middle)."""
    return Q.ss_render(R.scene, -128, 384, y0, y1, ss=2, dash_ph=ph * R.DASH, storm_on=False)

# ---------------------------------------------------------------- the blade and the dash
def cab_picture():
    """Rows 24-29 (y 192..239): the blade, angled, snow heaped on it, and the dash under it."""
    ys, xs = np.mgrid[192:240, 0:256].astype(float)
    ys = ys + 0.5; xs = xs + 0.5
    # The road beside the blade, where it shows.
    road = Q.ss_render(R.scene, 0, 256, 192, 240, ss=1, storm_on=False)
    img = road.copy()
    top = 190 + (xs - 30) * 0.075                 # the blade's top edge, its right end trailing lower
    bot = 214 + (xs - 30) * 0.02
    left = 22 + (ys - 190) * 0.6                    # its left end, cut at an angle
    on = (ys >= top) & (ys <= bot) & (xs >= left)
    u = np.clip((ys - top) / np.maximum(bot - top, 1), 0, 1)
    face = 0.30 - 0.12 * u + 0.05 * np.sin(xs * 0.9) * 0
    face = np.where(ys - top < 2.0, 0.78, face)     # the cutting edge along the top catching the light
    # hazard stripes on its outer end
    stripe = (xs - left < 26) & (((xs + ys * 1.0) // 6) % 2 == 0)
    face = np.where(stripe & (ys - top >= 2), 0.95, face)
    img = np.where(on, face, img)
    # Snow heaped on the blade, rolling off its right end.
    hx = (xs - 150) / 95.0
    heap = 9.0 * np.clip(1 - hx * hx, 0, 1) ** 0.6 * (1 + 0.15 * np.sin(xs * 0.37) + 0.08 * np.sin(xs * 1.3))
    snow = (ys < top + 3) & (ys > top + 3 - heap) & (np.abs(hx) < 1)
    sv = 0.93 - 0.25 * R.smoothstep(top + 3 - heap * 0.4, top + 3, ys)
    img = np.where(snow, sv, img)
    # The dash.
    dash = 217 + 2.5 * np.sin(np.pi * xs / 256)
    lip = (ys >= dash) & (ys < dash + 1.5)
    img = np.where(ys >= dash, 0.03, img)
    img = np.where(lip, 0.4, img)
    for gk in range(3):
        gx, gy = 30 + gk * 16, 229
        d = np.sqrt((xs - gx) ** 2 + (ys - gy) ** 2)
        img = np.where((d < 5.2) & (d > 3.8) & (ys > dash + 2), 0.4, img)
    # The pillars: the left one (the 8 px the PPU hides), and the right.
    img = np.where((xs > 248) & (ys < dash), 0.03, img)
    return img

def mirror_picture():
    """The rear-view mirror (cols 12-19, rows 2-4): a dark frame round the road behind, blurred white."""
    ys, xs = np.mgrid[16:32, 96:160].astype(float) + 0.5
    mx, my = 128.0, 23.5
    dx, dy = np.abs(xs - mx) - 28, np.abs(ys - my) - 5
    d = np.sqrt(np.maximum(dx, 0) ** 2 + np.maximum(dy, 0) ** 2) + np.minimum(np.maximum(dx, dy), 0) - 2.5
    img = np.full(xs.shape, -1.0)                 # -1: the sky shows through
    img = np.where(d < 0.5, 0.04, img)
    glass = d < -2.0
    u = (xs - mx) / 28.0; v = (ys - my) / 5.0
    road = 0.8 - 0.12 * (np.abs(u) < (0.15 + 0.35 * (v + 1) / 2)) * (v > -0.2)
    lane = np.abs(np.abs(u) - (0.05 + 0.18 * (v + 1) / 2)) < 0.03
    gl = np.where(v < -0.2, 0.9, road) - 0.25 * lane * (v > -0.2)
    img = np.where(glass, gl * (1 - 0.15 * (u * u + v * v)), img)
    stem = (np.abs(xs - mx) < 1.0) & (ys < my - 7)
    img = np.where(stem, 0.04, img)
    return img

# ---------------------------------------------------------------- tiles in the fixed banks
def text_tile(ch, ink=3, bg=0):
    g = glyph(ch)
    return tile_bytes([[ink if g[y][x] else bg for x in range(8)] for y in range(8)])

def big_tiles(ch):
    """A 16x16 letter for the title, as four tiles (tl, tr, bl, br): the 5x7 glyph doubled, softened."""
    g = np.array(glyph(ch), np.uint8)
    b = np.kron(g, np.ones((2, 2), np.uint8)) * 3
    return [tile_bytes(b[0:8, 0:8]), tile_bytes(b[0:8, 8:16]), tile_bytes(b[8:16, 0:8]), tile_bytes(b[8:16, 8:16])]

def main():
    meta = {}
    banks = []                                  # 2 KB banks, each 128 tiles (bytes)
    def add_bank(tiles):
        assert len(tiles) <= 128, len(tiles)
        tiles = list(tiles) + [bytes(16)] * (128 - len(tiles))
        banks.append(b''.join(tiles))
        return len(banks) - 1

    # Nametables: 64 x 30 tile indices (both halves), all palette 0.
    NT = np.zeros((30, 64), np.uint8)

    # ---- the fixed banks (R1): text, the mirror, the cab roof
    blank = bytes(16)
    solid = [tile_bytes(np.full((8, 8), c)) for c in range(4)]
    fixed = [None] * 128
    CH = ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-:!?,/\'<>^'
    for i, ch in enumerate(CH):
        fixed[i] = text_tile(ch)
    dim_letters = 'DISTANCEPLOWXT'
    dim = {}
    n = len(CH)
    for ch in sorted(set(dim_letters)):
        fixed[n] = text_tile(ch, ink=1); dim[ch] = n; n += 1
    mq = Q.quant(np.where(mirror_picture() < 0, 0.03, mirror_picture()), 96, 16)
    mraw = mirror_picture()
    mirror_slots = {}
    for r in range(2):
        for c in range(8):
            t = mq[r * 8:r * 8 + 8, c * 8:c * 8 + 8]
            sky_through = (mraw[r * 8:r * 8 + 8, c * 8:c * 8 + 8] < 0).mean() > 0.5
            mirror_slots[(r, c)] = (n, sky_through)
            fixed[n] = tile_bytes(t); n += 1
    fixed[n] = solid[0]; BLACK = 128 + n; n += 1
    meta['fixed_used'] = n
    import texts as T
    title_chars = set(''.join(t for _, _, t in T.TITLE + [T.BEST]) + '0123456789, m.')
    title_bank = list(fixed)
    free = [CH.index(ch) for ch in CH if ch not in title_chars] + list(dim.values()) + list(range(n, 128))
    free = sorted(set(free))
    big = {}
    for ch in sorted(set(''.join(w for _, w in T.TITLE_BIG)) - {' '}):
        idx = []
        for t in big_tiles(ch):
            i = free.pop(0); title_bank[i] = t; idx.append(128 + i)
        big[ch] = idx
    R1_GAME = add_bank([t or blank for t in fixed])
    R1_TITLE = add_bank([t or blank for t in title_bank])

    # ---- the storm: NF frames, three banks each (rows 2-3, 4-7, 8-11)
    sky = []
    for k in range(NF):
        img = sky_frame(k)
        q = Q.quant(img, 0, 0)
        sky.append(q)
        print('storm frame', k, flush=True)
    SKY0 = len(banks)
    for k in range(NF):
        q = sky[k]
        for r0, r1 in ((2, 4), (4, 8), (8, 12)):
            tl = []
            for r in range(r0, r1):
                for c in range(32):
                    tl.append(tile_bytes(q[(r - 2) * 8:(r - 2) * 8 + 8, c * 8:c * 8 + 8]))
            add_bank(tl)
    for r in range(2, 12):
        base = (r - 2) * 32 if r < 4 else ((r - 4) * 32 if r < 8 else (r - 8) * 32)
        for c in range(32):
            NT[r, c] = base + c
            NT[r, c + 32] = base + c
    # The mirror over the storm (its corners let the storm through where they're clear).
    for (r, c), (idx, through) in mirror_slots.items():
        if not through:
            NT[2 + r, 12 + c] = 128 + idx
    # The cab roof: black, the HUD written over it.
    NT[0:2, :] = BLACK

    # ---- the road: rows 12-23, groups of rows, each a bank per phase
    wall = Q.quant(wall_row(), 0, 96)
    road_ph = {}
    nph_max = max(g[2] for g in ROAD_GROUPS)
    for p in range(nph_max):
        img = road_tone(road_rows(p / nph_max, 104, 192))
        road_ph[p] = Q.quant(img, 0, 104)
        print('road phase', p, flush=True)
    groups = []
    for (a, b, nph) in ROAD_GROUPS:
        step = nph_max // nph
        sigs = {}
        order = []
        for r in range(a, b):
            for c in range(64):
                if r == 12:
                    cc = c & 31
                    sig = tuple(wall[:, cc * 8:cc * 8 + 8].tobytes() for p in range(nph))
                else:
                    y = (r - 13) * 8
                    sig = tuple(road_ph[p * step][y:y + 8, c * 8:c * 8 + 8].tobytes() for p in range(nph))
                if sig not in sigs:
                    sigs[sig] = len(order); order.append(sig)
                NT[r, c] = sigs[sig]
        print(f'road rows {a}-{b - 1}: {len(order)} tiles x {nph} phases', flush=True)
        first = len(banks)
        for p in range(nph):
            add_bank([tile_bytes(np.frombuffer(sig[p], np.uint8).reshape(8, 8)) for sig in order])
        groups.append((a, b, nph, first))
    # Row 12 sits in NT0 only (it isn't scrolled): both halves the same.

    # ---- the cab
    cq = Q.quant(cab_picture(), 0, 192)
    cab_banks = []
    for r0, r1 in ((24, 30),):
        seen = {}; order = []
        for r in range(r0, r1):
            for c in range(32):
                t = tile_bytes(cq[(r - 24) * 8:(r - 24) * 8 + 8, c * 8:c * 8 + 8])
                if t not in seen:
                    seen[t] = len(order); order.append(t)
                NT[r, c] = NT[r, c + 32] = seen[t]
        print(f'cab rows {r0}-{r1 - 1}: {len(order)} tiles')
        cab_banks.append(add_bank(order))

    emit(NT, banks, meta, R1_GAME, R1_TITLE, SKY0, groups, cab_banks, dim, big, CH, BLACK)
    meta.update(R1_GAME=R1_GAME, R1_TITLE=R1_TITLE, SKY0=SKY0, groups=groups, cab=cab_banks,
                dim=dim, big=big, chars=CH, black=BLACK, bg_banks=len(banks))
    np.save(os.path.join(OUT, 'build', 'nt.npy'), NT)
    with open(os.path.join(OUT, 'build', 'bg.bin'), 'wb') as f:
        f.write(b''.join(banks))
    json.dump(meta, open(os.path.join(OUT, 'build', 'bg.json'), 'w'), indent=1)
    # Previews: the screen as the NES draws it, in the middle of the road, frame 0.
    scr = np.zeros((240, 256), np.uint8)
    scr[16:96] = sky[0]
    scr[96:104] = wall
    scr[104:192] = road_ph[0][:, 128:384]
    scr[192:240] = cq
    Image.fromarray((Q.LEVEL[scr] * 255).astype(np.uint8)).resize((512, 480), Image.NEAREST).save(os.path.join(OUT, 'build', 'preview_bg.png'))
    frames = [Image.fromarray((Q.LEVEL[s] * 255).astype(np.uint8)).resize((512, 160), Image.NEAREST) for s in sky]
    frames[0].save(os.path.join(OUT, 'build', 'storm.gif'), save_all=True, append_images=frames[1:], duration=120, loop=0)

def emit(NT, banks, meta, R1_GAME, R1_TITLE, SKY0, groups, cab_banks, dim, big, CH, BLACK):
    import sprites as SP
    import texts as T
    out = []
    E = out.append
    def byt(name, vals, per=16):
        vals = [int(v) & 0xFF for v in vals]
        E(f'{name}:')
        for i in range(0, len(vals), per):
            E('  .byte ' + ','.join(f'${v:02X}' for v in vals[i:i + per]))
    E('; generated by tools/assets.py')
    E(f'R1_GAME = {R1_GAME * 2}')
    E(f'R1_TITLE = {R1_TITLE * 2}')
    E(f'CAB_BANK = {cab_banks[0] * 2}')
    E(f'NF = {NF}')
    E(f'BLACK_T = {BLACK}')
    byt('SKYB', [(SKY0 + i) * 2 for i in range(NF * 3)])
    E(f'NGROUPS = {len(groups)}')
    byt('GRP_BASE', [g[3] * 2 for g in groups])
    byt('GRP_SHIFT', [{4: 6, 8: 5, 16: 4, 32: 3}[g[2]] for g in groups])
    # Scroll list lines and which bank each starts (an index into this frame's bank picks; see main.s)
    byt('NT0', NT[:, :32].reshape(-1))
    byt('NT1', NT[:, 32:].reshape(-1))
    rows = list(range(13, 24))
    K = []; Z = []
    for r in rows:
        dy = r * 8 + 4.5 - R.HY
        K.append(round(dy / R.EYE_Y / 16 * 64))
        Z.append(min(255, round(R.EYE_Y * R.F / dy)))
    byt('ROWK', K)
    byt('ROWZ', Z)
    # Depth tables, by zq: z = zq/4 m below 32 m, 32 + (zq - 128)/2 m beyond.
    zs = [max(zq / 4.0, 0.25) if zq < 128 else 32 + (zq - 128) / 2.0 for zq in range(256)]
    gy = [min(255, round(R.HY + R.EYE_Y * R.F / z)) for z in zs]
    ppm = [min(65535, round(R.F / z * 256)) for z in zs]
    import math
    bk = []
    for z in zs:
        b = min(range(8), key=lambda i: abs(math.log(max(z, 1) / SP.ZB[i])))
        bk.append(b)
    byt('ZGY', gy); byt('ZPPML', [v & 255 for v in ppm]); byt('ZPPMH', [v >> 8 for v in ppm]); byt('ZBUCK', bk)
    # Sprites.
    sbanks, smeta = SP.build()
    nbg = len(banks)
    spr0 = nbg * 2                       # 1KB bank number of the first sprite bank
    E(f'SPR_COMMON = {spr0}')
    E(f'SPR_DYN = {spr0 + 1}')
    for k, v in smeta['fixed'].items():
        E(f'SPT_{k.upper()} = ${v * 2 + 1:02X}')
    views = list(smeta['views'].keys())
    E(f'NVIEWS = {len(views)}')
    for i, v in enumerate(views):
        E(f'V_{v.upper()} = {i}')
    recs = []
    ptrs = []
    for v in views:
        for b in range(8):
            r = smeta['views'][v][b]
            if r is None:
                ptrs.append(None); continue
            bank, frames = r
            name = f'MS_{v}_{b}'
            bval = 0 if bank == 'common' else (spr0 + 1 + bank)
            vals = [bval, len(frames)]
            for fr in frames:
                vals.append(len(fr))
                for dx, dy, t in fr:
                    vals += [dx & 0xFF, dy & 0xFF, t * 2 + 1]
            recs.append((name, vals)); ptrs.append(name)
    E('MSPTRL:'); E('  .byte ' + ','.join(f'<{p}' if p else '0' for p in ptrs))
    E('MSPTRH:'); E('  .byte ' + ','.join(f'>{p}' if p else '0' for p in ptrs))
    for name, vals in recs:
        byt(name, vals)
    # Text: tiles for characters.
    cmap = {ch: 128 + i for i, ch in enumerate(CH)}
    def enc(t): return [cmap[ch] for ch in t]
    def string(name, row, col, t, wide=False):
        if col is None: col = (32 - len(t)) // 2
        vals = [row, col, len(t)] + enc(t)
        byt(name, vals)
    for i, (row, col, t) in enumerate(T.TITLE):
        string(f'STR_T{i}', row, col, t)
    E(f'NTITLE = {len(T.TITLE)}')
    E('TITLE_STRS: .word ' + ','.join(f'STR_T{i}' for i in range(len(T.TITLE))))
    for i, (row, t) in enumerate(T.TITLE_BIG):
        tl = [];bl = []
        for ch in t:
            if ch == ' ':
                tl += [cmap[' '], cmap[' ']]; bl += [cmap[' '], cmap[' ']]
            else:
                a, b2, c, d = big[ch]; tl += [a, b2]; bl += [c, d]
        col = (32 - len(tl)) // 2
        byt(f'STR_BIG{i}', [row, col, len(tl)] + tl + bl)
    string('STR_BEST', *T.BEST)
    string('STR_OVER', *T.OVER[0])
    string('STR_OVER1', *T.OVER[1])
    string('STR_OVER2', *T.OVER[2])
    string('STR_PAUSE0', *T.PAUSED[0])
    string('STR_PAUSE1', *T.PAUSED[1])
    string('STR_GO', *T.GO)
    for t in [m for _, m in T.MILESTONES] + list(T.HINTS.values()) + list(T.DEATH.values()):
        assert len(t) <= 30, f'too long for the screen: {t!r}'
    for i, (m, t) in enumerate(T.MILESTONES):
        byt(f'STR_MS{i}', [len(t)] + enc(t))
    E('MS_AT: .word ' + ','.join(str(m) for m, _ in T.MILESTONES) + ',65535')
    E('MS_STR: .word ' + ','.join(f'STR_MS{i}' for i in range(len(T.MILESTONES))))
    KINDS = ['robot', 'crew', 'car', 'drift', 'buried', 'walker', 'jackknife', 'spin', 'tire', 'leaper']
    for k in KINDS:
        byt(f'STR_H_{k}', [len(T.HINTS[k])] + enc(T.HINTS[k]))
        if k in T.DEATH:
            byt(f'STR_D_{k}', [len(T.DEATH[k])] + enc(T.DEATH[k]))
    E('HINT_STR: .word ' + ','.join(f'STR_H_{k}' for k in KINDS))
    E('DEATH_STR: .word ' + ','.join(f'STR_D_{k}' if k in T.DEATH else 'STR_D_robot' for k in KINDS))
    # HUD labels (dim) on the roof row 0.
    dmap = {ch: 128 + i for ch, i in dim.items()}
    lab = [dmap.get(ch, cmap[' ']) if ch != ' ' else cmap[' '] for ch in ' DISTANCE PLOWED        NEXT EXIT ']
    byt('HUD_LABELS', lab)
    E(f'T_SPACE = {cmap[" "]}')
    E(f'T_0 = {cmap["0"]}')
    E(f'T_DOT = {cmap["."]}')
    E(f'T_COMMA = {cmap[","]}')
    E(f'T_M = {cmap["m"]}')
    E(f'T_E = {cmap["e"]}')
    E(f'T_DASH = {cmap["-"]}')
    open(os.path.join(OUT, 'build', 'data.inc'), 'w').write('\n'.join(out) + '\n')
    chr_ = b''.join(banks) + b''.join(sbanks)
    chr_ += bytes(0x40000 - len(chr_))
    assert len(chr_) == 0x40000, len(chr_)
    open(os.path.join(OUT, 'build', 'chr.bin'), 'wb').write(chr_)
    print(f'CHR: {len(banks)} background banks, {len(sbanks)} 1KB sprite banks')

if __name__ == '__main__':
    os.makedirs(os.path.join(OUT, 'build'), exist_ok=True)
    main()
