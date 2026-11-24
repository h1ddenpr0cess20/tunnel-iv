"""'Whiteout on the Highway' for the NES APU, from the song in src/sound.js (its sections, order, chords,
strums, drums and lead lines, read straight out of that file).

  pulse 1   the lead: bends (^) up from a whole step under, slides (_) from the note before, vibrato
  pulse 2   the twin lead a third up where the song has one; otherwise the rhythm guitar, palm-muted
            chugs and chords let ring on the root, an octave up
  triangle  the bass: driving eighths, stepping into each change, or held
  noise     the kit: kick, snare, hats, ride, china, toms, fills and rolls
185 beats a minute, a sixteenth every 4.86 frames. Goes round for ever from the first verse.
"""
import os, re, json, subprocess

SRC = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'sound.js')
OUT = os.path.join(os.path.dirname(__file__), '..', 'build', 'music.inc')

def song_tables():
    """Evaluate the song's tables with node (they're plain object literals)."""
    js = open(SRC).read()
    a = js.index('const SEMI'); b = js.index('// A line as notes')
    code = js[a:b] + '\nconsole.log(JSON.stringify({DRUMS, STRUMS, SECTIONS, ORDER, LOOP_TO}));'
    out = subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout
    return json.loads(out)

SEMI = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def midi(n):
    m = re.match(r'^([A-G])(#|b)?(\d)$', n)
    return 12 * (int(m.group(3)) + 1) + SEMI[m.group(1)] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)
SCALE = [2, 4, 5, 7, 9, 10, 0]
def third(m):
    pc = m % 12
    if pc not in SCALE: return m + 3
    up = SCALE[(SCALE.index(pc) + 2) % 7]
    return m + ((up - pc) % 12)

def parse_line(line):
    out = []
    toks = line.split(' ')
    step = 16 // len(toks)
    for i, tok in enumerate(toks):
        last = out[-1] if out else None
        if tok == '-':
            if last and last['end'] == i: last['len'] += step; last['end'] += 1
            continue
        if tok == '.': continue
        mark = tok[-1] if tok[-1] in '^!_' else None
        out.append(dict(at=i * step, len=step, end=i + 1, m=midi(tok[:-1] if mark else tok), bend=mark == '^', slide=mark == '_'))
    return out

BASE = 45                    # pulse notes: midi - 45
TRI_BASE = 24                # triangle notes: midi - 24
D_KICK, D_SNARE, D_HAT, D_RIDE, D_CRASH, D_CHINA, D_TOM1, D_TOM2, D_TOM3, D_TOM4, D_ROLL, D_ROLL2, D_KICKL = range(1, 14)

def build():
    T = song_tables()
    S, ORDER = T['SECTIONS'], T['ORDER']
    bars = []
    for k, name in enumerate(ORDER):
        sec = S[name]
        n = len(sec['chords'])
        for i, c in enumerate(sec['chords']):
            build_ = bool(sec.get('build')) and i == n - 1
            bars.append(dict(sec=sec, name=name, roots=[midi(x) for x in c.split('/')], lead=parse_line(sec['lead'][i]),
                             first=i == 0, last=i == n - 1, bar=i,
                             fill=(i % 8 == 7 or i == n - 1) and sec['drums'] != 'swell' and not build_,
                             build=build_, start=k == T['LOOP_TO'] and i == 0))
    loop_bar = next(i for i, b in enumerate(bars) if b['start'])
    root_at = lambda bar, step: bar['roots'][1 if len(bar['roots']) > 1 and step >= 8 else 0]
    ch = {0: [], 1: [], 2: [], 3: []}
    modes = []
    last_lead = None
    for bi, bar in enumerate(bars):
        nxt = bars[bi + 1] if bi + 1 < len(bars) else bars[loop_bar]
        sec = bar['sec']
        p1 = [0] * 16; p2 = [0] * 16; tri = [0] * 16; noi = [0] * 16
        # the lead, and its twin
        twin = bool(sec.get('twin')) and bool(bar['lead'])
        for e in bar['lead']:
            v = e['m'] - BASE
            assert 1 <= v < 64, e
            code = v | (0x80 if e['bend'] else 0) | (0x40 if e['slide'] else 0)
            p1[e['at']] = code
            if twin:
                t = third(e['m']) - BASE
                p2[e['at']] = t | (0x80 if e['bend'] else 0)
            endstep = e['at'] + e['len']
            if endstep < 16 and p1[endstep] == 0:
                p1[endstep] = 0xFF
                if twin and p2[endstep] == 0: p2[endstep] = 0xFF
        # the rhythm guitar where there's no twin: the root an octave up (low D is under the pulse's range)
        if not twin:
            strum = T['STRUMS'][sec['strum']]
            for i, hit in enumerate(strum):
                if hit:
                    r = root_at(bar, i) + 12
                    p2[i] = (r - BASE) | (0x40 if hit == 1 else 0)
        # the bass
        for i in range(16):
            root = root_at(bar, i)
            if sec['bass'] == 'eighths' and i % 2 == 0:
                into = root_at(nxt, 0)
                step = (into - 2 if into > root else into + 1) if i == 14 and into != root else root
                tri[i] = step - TRI_BASE
            elif sec['bass'] == 'hold' and (i == 0 or (i == 8 and len(bar['roots']) > 1)):
                tri[i] = (root - TRI_BASE) | 0x80
        # the kit
        D = T['DRUMS'].get(sec['drums'])
        for i in range(16):
            hit = 0
            if sec['drums'] == 'swell':
                if bar['bar'] == 0 and i == 0: hit = D_CRASH
                elif bar['bar'] == 2 and i % 2 == 0: hit = D_TOM3 if i < 8 else D_TOM2
                elif bar['last']: hit = D_ROLL if i < 8 else D_ROLL2
            elif bar['build'] and i >= 8:
                hit = D_KICK if i % 4 == 0 else (D_ROLL2 if i >= 12 else D_ROLL)
            elif bar['fill'] and i >= 12:
                hit = [D_TOM1, D_TOM2, D_TOM3, D_TOM4][i - 12]
            else:
                if bar['first'] and i == 0: hit = D_CRASH
                elif i in D['snare']: hit = D_SNARE
                elif bar['name'] == 'chorus' and i == 0 and bar['bar'] % 2 == 1: hit = D_CHINA
                elif i in D['kick']: hit = D_KICKL if D.get('lean') and i % 4 else D_KICK
                elif i in D.get('hat', []): hit = D_HAT
                elif i in D.get('ride', []): hit = D_RIDE
            noi[i] = hit
        ch[0].append(p1); ch[1].append(p2); ch[2].append(tri); ch[3].append(noi)
        modes.append(1 if twin else 0)
    return ch, modes, loop_bar

def emit():
    ch, modes, loop_bar = build()
    pats = []
    index = {}
    orders = {}
    for c in range(4):
        orders[c] = []
        for bi, p in enumerate(ch[c]):
            key = (c == 1 and modes[bi], tuple(p))
            if key not in index:
                index[key] = len(pats); pats.append((modes[bi] if c == 1 else 0, p))
            orders[c].append(index[key])
    o = ['; generated by tools/music.py: Whiteout on the Highway']
    o.append(f'SONG_BARS = {len(ch[0])}')
    o.append(f'SONG_LOOP = {loop_bar}')
    for c in range(4):
        o.append(f'ORD{c}: .byte ' + ','.join(str(x) for x in orders[c]))
    o.append('PAT_L: .byte ' + ','.join(f'<PAT{i}' for i in range(len(pats))))
    o.append('PAT_H: .byte ' + ','.join(f'>PAT{i}' for i in range(len(pats))))
    for i, (mode, p) in enumerate(pats):
        o.append(f'PAT{i}: .byte {mode},' + ','.join(f'${v:02X}' for v in p))
    # periods: pulse notes midi 45 + v, triangle midi 24 + v
    cpu = 1789773.0
    f = lambda m: 440 * 2 ** ((m - 69) / 12)
    pp = [min(2047, round(cpu / (16 * f(BASE + v)) - 1)) for v in range(64)]
    tp = [min(2047, round(cpu / (32 * f(TRI_BASE + v)) - 1)) for v in range(64)]
    o.append('PER_L: .byte ' + ','.join(str(v & 255) for v in pp))
    o.append('PER_H: .byte ' + ','.join(str(v >> 8) for v in pp))
    o.append('TPER_L: .byte ' + ','.join(str(v & 255) for v in tp))
    o.append('TPER_H: .byte ' + ','.join(str(v >> 8) for v in tp))
    open(OUT, 'w').write('\n'.join(o) + '\n')
    print(f'music: {len(ch[0])} bars, {len(pats)} patterns ({17 * len(pats)} bytes), loops to bar {loop_bar}')

if __name__ == '__main__':
    emit()
