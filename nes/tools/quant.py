"""The NES's greys and ordered dithering."""
import numpy as np
GREYS = [0x0F, 0x00, 0x10, 0x30]
LEVEL = np.array([0.0, 0.36, 0.72, 1.0])
BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16.0

def quant(img, x0=0, y0=0):
    """img: light 0..1 at NES pixels -> 0..3, dithered (the pattern pinned to picture coordinates x0, y0)."""
    h, w = img.shape
    v = np.clip(img, 0, 1)
    i = np.clip(np.searchsorted(LEVEL, v, side='right') - 1, 0, 2)
    t = (v - LEVEL[i]) / (LEVEL[i + 1] - LEVEL[i])
    yy, xx = np.mgrid[0:h, 0:w]
    th = BAYER[(yy + y0) % 4, (xx + x0) % 4]
    return (i + (t > th)).astype(np.uint8)

def ss_render(fn, x0, x1, y0, y1, ss=2, **kw):
    """Render fn over NES pixels [x0,x1) x [y0,y1) at ss x ss samples per pixel, averaged."""
    ys, xs = np.mgrid[0:(y1 - y0) * ss, 0:(x1 - x0) * ss].astype(float)
    xs = x0 + (xs + 0.5) / ss - 0.5
    ys = y0 + (ys + 0.5) / ss - 0.5
    img = fn(xs, ys, **kw)
    return img.reshape(y1 - y0, ss, x1 - x0, ss).mean(axis=(1, 3))

def tiles(q):
    """q: (8r) x (8c) of 0..3 -> list of 8x8 tuples, row-major."""
    h, w = q.shape
    out = []
    for r in range(h // 8):
        for c in range(w // 8):
            out.append(q[r * 8:r * 8 + 8, c * 8:c * 8 + 8].tobytes())
    return out
