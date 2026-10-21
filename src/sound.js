// Synthesized sound, no samples. Audio starts on the first key press or tap.
//
// The band: heavy metal, a galloping highway anthem in E at 160 beats a
// minute, after the Madness Engine's band (Metroll's). Two rhythm
// guitars, hard left and right, the right a hair late, are a wall:
// power chords of detuned saws, the mids pushed into a hard clipper, the
// lows put back, the middle scooped, the fizz rolled off; palm-muted they
// thud, darkened before the amp. They gallop through the verses, chug
// sixteenths into the choruses and ring wide open in them. Two lead
// guitars play the hooks in harmony a third apart, bend into their long
// notes and dive off the whammy bar; one of them shreds the solo. The
// bass drives eighths and steps into each change, a sine under it. The
// drums are a metal kit (a kick with the beater's click on it, a cracking
// snare, toms and a china): the gallop in the verses, a skank beat
// building into the choruses, double bass under them, a half-time
// breakdown, a fill into every change. A dark string pad hangs over the
// choruses like the storm. The song goes round for ever, like the road.
// Under it there's the truck: the diesel, changing gear as you speed up,
// the blade scraping the road, the blizzard howling round the cab, and the
// wipers.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

const LEVEL = 0.7;
const BPM = 160;
const S16 = 60 / BPM / 4;  // a sixteenth, in seconds
const AHEAD = 0.25;        // schedule the band this far ahead

// ---- the song ---------------------------------------------------------------
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = n => {
  const m = /^([A-G])(#|b)?(\d)$/.exec(n);
  return 12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
};
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

// E minor, for harmonising the leads a third up.
const SCALE = [4, 6, 7, 9, 11, 0, 2];
const third = m => {
  const i = SCALE.indexOf(((m % 12) + 12) % 12);
  if (i < 0) return m + 3;
  const up = SCALE[(i + 2) % 7];
  return m + ((up - (m % 12) + 12) % 12);
};

// Drums on sixteen steps to the bar. `kick` and `snare` are the steps
// they hit; `hat`, `ride` the cymbal ticking time; `lean` plays each hit
// with fewer layers, for the fast ones.
const DRUMS = {
  // The gallop: the kick doubling the guitars' da-da-dum, the snare on two and four.
  gallop: { kick: [0, 2, 3, 8, 10, 11], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  // The skank beat, the snare on every off-beat, flat out.
  skank: { kick: [0, 3, 4, 8, 11, 12], snare: [2, 6, 10, 14], hat: [0, 4, 8, 12], lean: true },
  // Double bass under the snare's backbeat, the ride on the quarters.
  double: { kick: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], snare: [4, 12], ride: [0, 4, 8, 12], lean: true },
  // Half time: the kick dropping like an anvil, the snare on three.
  half: { kick: [0, 3, 10], snare: [8], ride: [0, 4, 8, 12] },
};
// How the rhythm guitars play: 0 rest, 1 a palm-muted chug, 2 a chord let ring.
const STRUMS = {
  ring: [2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0],
  gallop: [2, 0, 1, 1, 1, 0, 1, 1, 2, 0, 1, 1, 1, 0, 1, 1],
  palm: [2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1],
  open: [2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0],
  breakdown: [2, 0, 0, 1, 1, 0, 2, 0, 0, 1, 0, 1, 2, 0, 1, 1],
};

// Each bar names its chord by its root (two roots split the bar). Lead
// lines are eighths, or sixteenths if a bar has sixteen of them: a note
// picks once; ^ bends up into it from a whole step below; ! dives off the
// whammy bar; - holds the note before; . is a rest. `twin` doubles the
// lead a third up, on the other side.
const SECTIONS = {
  intro: {
    drums: 'swell', strum: 'ring', bass: 'hold', twin: true,
    chords: ['E2', 'C3', 'D3', 'E2'],
    lead: ['B4 - E5 - G5 - F#5 E5', 'G5 - - - E5 - C5 -', 'D5 - F#5 - A5 - G5 F#5', 'E5 - - - - - . .'],
  },
  verse: {
    drums: 'gallop', strum: 'gallop', bass: 'gallop',
    chords: ['E2', 'E2', 'C3/D3', 'E2', 'E2', 'E2', 'C3/D3', 'B2'],
    lead: [
      '. . . . . . . .', '. . . . . . . .', '. . . . . . . .', '. . . . B4 A4 G4 F#4',
      '. . . . . . . .', '. . . . . . . .', '. . . . . . . .', 'D#5^ - - - B4 - . .',
    ],
  },
  pre: {
    drums: 'skank', strum: 'palm', bass: 'eighths', twin: true, build: true,
    chords: ['C3', 'D3', 'C3', 'D3'],
    lead: ['E5^ - - - - - - -', 'F#5^ - - - - - - -', 'G5^ - - - - - - -', 'A5^ - - - B5 - . .'],
  },
  chorus: {
    drums: 'double', strum: 'open', bass: 'eighths', twin: true, pad: true,
    chords: ['E2', 'C3', 'G2', 'D3', 'E2', 'C3', 'D3', 'B2'],
    lead: [
      'B4 - - - E5 - - -', 'G5 - - - F#5 - E5 -', 'D5 - - - B4 - - -', 'A4^ - - - - - . .',
      'B4 - - - E5 - - -', 'G5 - - - A5 - B5 -', 'A5^ - - - G5 - F#5 -', 'F#5 - - - D#5 - - -',
    ],
  },
  breakdown: {
    drums: 'half', strum: 'breakdown', bass: 'hold',
    chords: ['E2', 'E2', 'E2', 'F2'],
    lead: ['. . . . . . . .', '. . . . . . . .', '. . . . . . . .', '. . . . E5! - - -'],
  },
  solo: {
    drums: 'double', strum: 'gallop', bass: 'eighths', build: true,
    chords: ['E2', 'D3', 'C3', 'D3', 'E2', 'D3', 'C3', 'B2'],
    lead: [
      'B4 - D5 E5 G5^ - - -',
      'F#5 E5 D5 E5 F#5 E5 D5 B4 A4 B4 D5 B4 A4 F#4 E4 D4',
      'E4 G4 A4 B4 C5^ - - -',
      'D5 E5 F#5 A5 D5 E5 F#5 A5 D5 E5 F#5 A5 B5 A5 F#5 D5',
      'E5^ - - - - - G5 E5',
      'D5 F#5 A5 D6 A5 F#5 D5 A4 D5 F#5 A5 D6 E6 D6 A5 F#5',
      'E5 G5 C6 E6 C6 G5 E5 C5 E5 G5 C6 E6 G6 E6 C6 G5',
      'F#6^ - - - D#6 - B5 -',
    ],
  },
};
// Round and round: after the last section it goes back to the first verse.
const ORDER = ['intro', 'verse', 'pre', 'chorus', 'verse', 'pre', 'chorus', 'breakdown', 'solo', 'chorus'];
const LOOP_TO = 1;

// A line as notes at (and lasting) so many sixteenths.
function parseLine(line) {
  const out = [];
  const toks = line.split(' ');
  const step = 16 / toks.length;
  toks.forEach((tok, i) => {
    const last = out[out.length - 1];
    if (tok === '-') { if (last && last.end === i) { last.len += step; last.end++; } return; }
    if (tok === '.') return;
    const mark = /[\^!]$/.exec(tok)?.[0];
    out.push({ at: i * step, len: step, end: i + 1, m: midi(mark ? tok.slice(0, -1) : tok), bend: mark === '^', dive: mark === '!' });
  });
  return out;
}

const SONG = ORDER.flatMap((name, k) => {
  const sec = SECTIONS[name];
  return sec.chords.map((c, i) => ({
    ...sec, name, roots: c.split('/').map(midi), lead: parseLine(sec.lead[i]),
    first: i === 0, last: i === sec.chords.length - 1, bar: i,
    fill: (i % 4 === 3 || i === sec.chords.length - 1) && sec.drums !== 'swell' && !(sec.build && i === sec.chords.length - 1),
    build: !!sec.build && i === sec.chords.length - 1, start: k === LOOP_TO && i === 0,
  }));
});
const LOOP_BAR = SONG.findIndex(b => b.start);
// The chord's root at sixteenth `step` of a bar, and the next one along.
const rootAt = (bar, step) => bar.roots[bar.roots.length > 1 && step >= 8 ? 1 : 0];

// A soft clip that gets harder as k goes up (Metroll's distortion).
function distortion(k) {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 0.35) / (Math.PI + k * Math.abs(x) * 0.35);
  }
  return curve;
}
function filter(ac, type, f, q = 0.7, gain = 0) {
  const b = ac.createBiquadFilter();
  b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain;
  return b;
}
function gainNode(ac, g) { const n = ac.createGain(); n.gain.value = g; return n; }
function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}
function panner(ac, pan) {
  const p = ac.createStereoPanner ? ac.createStereoPanner() : gainNode(ac, 1);
  if (p.pan) p.pan.value = pan;
  return p;
}
// A burst of stereo noise dying away over `secs`, for a room.
function impulse(ac, secs, decay) {
  const sr = ac.sampleRate, len = Math.floor(sr * secs);
  const ir = ac.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return ir;
}

export const Sound = {
  ac: null, out: null, sfx: null, bed: null, noise: null,
  music: null, bus: {}, band: null,
  engine: null, wind: null, blade: null,
  muted: store.get('nt4-muted') === '1',

  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ac = new AC(); } catch { return; }
    const ac = this.ac;
    this.out = ac.createGain();
    this.out.gain.value = this.muted ? 0 : LEVEL;
    // Glue, so a crash on top of everything doesn't clip.
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(this.out);
    this.out.connect(ac.destination);
    this.sfx = ac.createGain(); this.sfx.connect(comp);
    this.bed = ac.createGain(); this.bed.gain.value = 0.7; this.bed.connect(comp);

    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    this.initBand(comp);
    this.initTruck();
  },

  // ---- the truck and the storm ------------------------------------------------
  initTruck() {
    const ac = this.ac;
    const loop = (type, f, q, gain, pan = 0) => {
      const src = ac.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const bp = filter(ac, type, f, q);
      const g = gainNode(ac, gain);
      const p = ac.createStereoPanner ? ac.createStereoPanner() : gainNode(ac, 1);
      if (p.pan) p.pan.value = pan;
      chain(src, bp, g, p, this.bed); src.start(0, Math.random() * 1.5);
      return { bp, g };
    };
    // The diesel: a low growl that knocks at its firing rate.
    const growl = ac.createOscillator(); growl.type = 'sawtooth';
    const thump = ac.createOscillator(); thump.type = 'square';
    const eg = gainNode(ac, 0);
    const lp = filter(ac, 'lowpass', 240, 1.2);
    growl.connect(lp); thump.connect(gainNode(ac, 0.5)).connect(lp);
    chain(lp, eg, this.bed);
    const knock = loop('bandpass', 1500, 1.5, 0);
    const fire = ac.createOscillator(); fire.type = 'square';
    const fireG = gainNode(ac, 0);
    fire.connect(fireG); fireG.connect(knock.g.gain);
    growl.start(); thump.start(); fire.start();
    this.engine = { growl, thump, fire, fireG, eg, knock: knock.g, lp };
    // The blizzard: two howls, one each side, swelling and falling, and a hiss.
    this.wind = [loop('bandpass', 500, 5, 0.05, -0.6), loop('bandpass', 760, 6, 0.04, 0.6), loop('highpass', 3000, 0.5, 0.012)];
    for (const [w, f, depth] of [[this.wind[0], 0.09, 220], [this.wind[1], 0.13, 300]]) {
      const o = ac.createOscillator(); o.frequency.value = f;
      o.connect(gainNode(ac, depth)).connect(w.bp.frequency); o.start();
      const s = ac.createOscillator(); s.frequency.value = f * 0.7;
      s.connect(gainNode(ac, 0.03)).connect(w.g.gain); s.start();
    }
    // The blade on the road: a scrape and the rumble of the snow ahead of it.
    this.blade = [loop('bandpass', 650, 0.9, 0), loop('lowpass', 150, 0.7, 0)];
  },


  // ---- the band -------------------------------------------------------------
  initBand(dest) {
    const ac = this.ac;
    // The band's own bus: glued by a compressor, a limiter on the end so a
    // loud chorus can't clip, the very top rolled off, a little room.
    this.music = gainNode(ac, 0.4);
    const sum = gainNode(ac, 0.85);
    const glue = ac.createDynamicsCompressor();
    glue.threshold.value = -16; glue.knee.value = 12; glue.ratio.value = 4; glue.attack.value = 0.006; glue.release.value = 0.18;
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -4; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
    chain(sum, filter(ac, 'highpass', 38, 0.7), filter(ac, 'lowshelf', 150, 0.7, -4), filter(ac, 'highshelf', 6000, 0.7, -3), filter(ac, 'lowpass', 11000, 0.5), glue, limiter, this.music, dest);
    const room = ac.createConvolver(); room.buffer = impulse(ac, 0.9, 3);
    chain(sum, room, gainNode(ac, 0.16), glue);

    // The rhythm rigs, one hard left and one hard right, the right 11 ms
    // late and voiced a little differently, so the two play as a wall: the
    // lows trimmed and the mids pushed into the amp so it clips tight, then
    // driven hard; after it the lows put back for the chug, the middle
    // scooped, a bite of presence, the fizz rolled off. A palm mute goes in
    // through `muted`, darkened first, so it thuds where a chord rings.
    const curve = distortion(110);
    const rig = (pan, late) => {
      const input = gainNode(ac, 1);
      const muted = filter(ac, 'lowpass', 700, 0.9);
      muted.connect(input);
      let head = input;
      if (late) { const d = ac.createDelay(0.05); d.delayTime.value = late; head = input.connect(d); }
      const shape = ac.createWaveShaper(); shape.curve = curve; shape.oversample = '4x';
      chain(head, filter(ac, 'highpass', 110), filter(ac, 'peaking', 760 + late * 20000, 0.7, 7), gainNode(ac, 7), shape,
        filter(ac, 'lowshelf', 140, 0.7, 5), filter(ac, 'peaking', 480, 0.9, -6), filter(ac, 'peaking', 2400, 1, 4),
        filter(ac, 'lowpass', 4600 - late * 30000, 0.8), panner(ac, pan), gainNode(ac, 0.4), sum);
      return { input, muted };
    };
    // The leads, one each side of the middle: a milder drive, a filter, and
    // an echo a dotted eighth behind.
    const curveLead = distortion(60);
    const leadRig = pan => {
      const input = gainNode(ac, 1);
      const shape = ac.createWaveShaper(); shape.curve = curveLead; shape.oversample = '2x';
      const lp = filter(ac, 'lowpass', 3400);
      const out = chain(input, gainNode(ac, 3), shape, lp, panner(ac, pan), gainNode(ac, 0.22));
      out.connect(sum);
      const echo = ac.createDelay(1); echo.delayTime.value = S16 * 3;
      const fb = gainNode(ac, 0.28);
      lp.connect(gainNode(ac, 0.3)).connect(echo);
      echo.connect(fb).connect(echo);
      echo.connect(filter(ac, 'lowpass', 2500)).connect(panner(ac, -pan)).connect(gainNode(ac, 0.12)).connect(sum);
      return { input, lp };
    };
    const drums = gainNode(ac, 1);
    drums.connect(sum);
    this.bus = { sum, drums, rigs: [rig(-0.9, 0), rig(0.9, 0.011)], leads: [leadRig(-0.25), leadRig(0.3)], filters: new Map() };
    this.band = { on: true, bar: 0, step: 0, next: ac.currentTime + 0.1, lead: false };
  },

  // An envelope on gain g: up to peak, held, and away.
  env(g, when, peak, attack, hold, release) {
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.setValueAtTime(peak, when + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + hold + release);
    return when + attack + hold + release + 0.04;
  },
  osc(type, f, when, end, dest, detune = 0) {
    const o = this.ac.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, when); o.detune.value = detune;
    o.connect(dest); o.start(when); o.stop(end);
    return o;
  },
  // A burst of noise through one of the kit's filters, made once and shared.
  noiseHit(when, { freq = 1000, type = 'bandpass', q = 1, level = 0.3, length = 0.1 }) {
    const ac = this.ac, key = `${type} ${freq} ${q}`;
    if (!this.bus.filters.has(key)) this.bus.filters.set(key, chain(filter(ac, type, freq, q), this.bus.drums));
    const s = ac.createBufferSource(); s.buffer = this.noise;
    const g = ac.createGain();
    g.gain.setValueAtTime(level, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + length);
    s.connect(g); g.connect(this.bus.filters.get(key));
    s.start(when, Math.random() * 1.5); s.stop(when + length + 0.05);
  },

  // ---- the kit --------------------------------------------------------------
  // The kick with the beater's click on it, which is what cuts through the guitars.
  kick(when, level = 1, lean = false) {
    const g = chain(gainNode(this.ac, 1), this.bus.drums);
    const end = this.env(g, when, 0.85 * level, 0.001, 0.025, lean ? 0.16 : 0.24);
    this.osc('sine', 175, when, end, g).frequency.exponentialRampToValueAtTime(46, when + 0.06);
    this.noiseHit(when, { freq: 3500, type: 'highpass', q: 0.7, level: (lean ? 0.2 : 0.26) * level, length: 0.01 });
  },
  snare(when, level = 1, lean = false) {
    this.noiseHit(when, { freq: 1900, q: 0.6, level: 0.7 * level, length: lean ? 0.12 : 0.2 });
    if (!lean) this.noiseHit(when, { freq: 4500, type: 'highpass', q: 0.7, level: 0.22 * level, length: 0.15 });
    const g = chain(gainNode(this.ac, 1), this.bus.drums);
    const end = this.env(g, when, 0.55 * level, 0.001, 0.012, 0.12);
    this.osc('triangle', 240, when, end, g).frequency.exponentialRampToValueAtTime(165, when + 0.08);
  },
  hat(when, level = 1) { this.noiseHit(when, { freq: 7000, type: 'highpass', q: 0.7, level: 0.26 * level, length: 0.04 }); },
  ride(when, level = 1) {
    this.noiseHit(when, { freq: 6500, q: 1.4, level: 0.18 * level, length: 0.45 });
    this.noiseHit(when, { freq: 5000, type: 'highpass', q: 0.6, level: 0.05 * level, length: 0.8 });
  },
  tom(when, pitch, level = 1) {
    const g = chain(gainNode(this.ac, 1), this.bus.drums);
    const end = this.env(g, when, 0.6 * level, 0.002, 0.02, 0.28);
    this.osc('sine', pitch * 1.6, when, end, g).frequency.exponentialRampToValueAtTime(pitch, when + 0.12);
    this.noiseHit(when, { freq: 900, level: 0.1 * level, length: 0.05 });
  },
  cymbal(when, level = 1) {
    this.noiseHit(when, { freq: 4000, type: 'highpass', q: 0.5, level: 0.26 * level, length: 1.3 });
    this.noiseHit(when, { freq: 7000, q: 0.8, level: 0.12 * level, length: 0.8 });
  },
  // A china: trashy, short, for the accents.
  china(when, level = 1) {
    this.noiseHit(when, { freq: 3000, q: 2.5, level: 0.22 * level, length: 0.5 });
    this.noiseHit(when, { freq: 5500, type: 'highpass', q: 1.5, level: 0.14 * level, length: 0.35 });
  },

  // ---- the band's parts -------------------------------------------------------
  // A power chord (root, fifth, octave) of detuned saws into both rigs:
  // open, it rings; otherwise it's palm-muted, a short dark chug.
  guitar(when, root, length, open, level = 1) {
    const g = this.ac.createGain();
    for (const r of this.bus.rigs) g.connect(open ? r.input : r.muted);
    const end = this.env(g, when, level * (open ? 1 : 1.6), 0.002, open ? Math.max(0.1, length - 0.05) : 0.035, open ? 0.3 : 0.045);
    [root, root + 7, root + 12].forEach((n, i) => {
      this.osc('sawtooth', hz(n), when, end, g, i % 2 ? 6 : -6);
      if (i === 0) this.osc('sawtooth', hz(n), when, end, g, 11);
    });
  },
  // The bass: a saw through a filter that closes on each note, a sine an octave under.
  bassNote(when, m, length, level = 1) {
    const ac = this.ac;
    const f = filter(ac, 'lowpass', 1400);
    f.frequency.setValueAtTime(1400, when);
    f.frequency.exponentialRampToValueAtTime(320, when + 0.18);
    const g = chain(gainNode(ac, 0.45 * level), this.bus.sum);
    f.connect(g);
    const end = this.env(g, when, 1, 0.005, Math.max(0.02, length * 0.55), 0.09);
    this.osc('sawtooth', hz(m), when, end, f);
    this.osc('sine', hz(m - 12), when, end, chain(gainNode(ac, 0.5), g));
  },
  // A lead note on one side: two saws a hair apart, vibrato coming in on
  // the long ones; a bend starts a whole step low and is pushed up into
  // pitch; a dive drops off the end of the whammy bar.
  leadNote(when, m, length, { side = 0, level = 1, bend = false, dive = false } = {}) {
    const ac = this.ac;
    const g = ac.createGain();
    g.connect(this.bus.leads[side].input);
    const end = this.env(g, when, level, 0.012, Math.max(0.05, length * 0.8), dive ? 0.6 : 0.14);
    const oscs = [this.osc('sawtooth', hz(m), when, end, g, -7), this.osc('sawtooth', hz(m), when, end, g, 7)];
    for (const o of oscs) {
      if (bend) { o.frequency.setValueAtTime(hz(m - 2), when); o.frequency.setTargetAtTime(hz(m), when + 0.03, 0.05); }
      if (dive) { o.frequency.setValueAtTime(hz(m), when + 0.15); o.frequency.exponentialRampToValueAtTime(hz(m - 30), end - 0.05); }
    }
    if (length > S16 * 3 && !dive) {
      const vib = ac.createOscillator(); vib.frequency.value = 6.4;
      const depth = ac.createGain();
      depth.gain.setValueAtTime(0, when);
      depth.gain.linearRampToValueAtTime(26, when + 0.25);
      vib.connect(depth);
      for (const o of oscs) depth.connect(o.detune);
      vib.start(when); vib.stop(end);
    }
  },
  // Strings, slow, dark: the storm over the choruses.
  pad(when, notes, length, level = 1) {
    const ac = this.ac;
    const f = filter(ac, 'lowpass', 1000);
    const g = chain(gainNode(ac, 0.03 * level), this.bus.sum);
    f.connect(g);
    const end = this.env(g, when, 1, length * 0.3, length * 0.3, length * 0.5);
    for (const n of notes) for (const d of [-8, 8]) this.osc('sawtooth', hz(n), when, end, f, d);
  },

  drums(bar, i, t) {
    const D = DRUMS[bar.drums];
    if (bar.drums === 'swell') {
      // The intro: the chord left to ring, toms rolling in, a snare roll into the verse.
      if (bar.bar === 0 && i === 0) this.cymbal(t);
      if (bar.bar === 2 && i % 2 === 0) this.tom(t, i < 8 ? 82 : 110, 0.4 + 0.04 * i);
      if (bar.last) this.snare(t, 0.3 + 0.045 * i, true);
      return;
    }
    const lean = !!D.lean;
    if (bar.first && i === 0) { this.cymbal(t, 1.1); this.kick(t, 1, lean); }
    if (bar.build && i >= 8) {
      // Rolling up into the next section: sixteenths on the snare, louder and louder.
      this.snare(t, 0.45 + 0.07 * (i - 8), true);
      if (i % 4 === 0) this.kick(t, 1, true);
      return;
    }
    if (bar.fill && i >= 12) {
      // A fill down the toms.
      this.tom(t, [190, 150, 120, 95][i - 12], 0.9);
      if (i === 12) this.kick(t, 1, lean);
      return;
    }
    if (D.kick.includes(i)) this.kick(t, i % 4 === 0 ? 1 : 0.85, lean);
    if (D.snare.includes(i)) this.snare(t, 1, lean);
    if (D.hat?.includes(i)) this.hat(t, i % 4 === 0 ? 1 : 0.65);
    if (D.ride?.includes(i)) this.ride(t, i % 8 === 0 ? 1 : 0.7);
    if (bar.name === 'chorus' && i === 0 && bar.bar % 2 === 1) this.china(t);
  },

  // One sixteenth of the song.
  playStep(bar, i, t, next) {
    this.drums(bar, i, t);
    const root = rootAt(bar, i);
    // The bass: eighths on the root, the last one stepping into the next
    // chord; or following the gallop; or held.
    if (bar.bass === 'eighths' && i % 2 === 0) {
      const into = rootAt(next, 0);
      const step = i === 14 && into !== root ? (into > root ? into - 2 : into + 1) : root;
      this.bassNote(t, step, S16 * 1.6, i === 0 ? 1.08 : 0.9);
    } else if (bar.bass === 'gallop' && STRUMS.gallop[i]) {
      this.bassNote(t, root, S16 * 0.9, STRUMS.gallop[i] === 2 ? 1.05 : 0.85);
    } else if (bar.bass === 'hold' && (i === 0 || (i === 8 && bar.roots.length > 1))) {
      this.bassNote(t, root, S16 * (bar.roots.length > 1 ? 7.5 : 15), 1);
    }
    // The rhythm guitars.
    const hit = STRUMS[bar.strum][i];
    if (hit) {
      const ring = bar.strum === 'ring' ? 7.5 : bar.strum === 'open' ? 1.8 : 3.2;
      this.guitar(t, root, hit === 2 ? S16 * ring : S16 * 0.9, hit === 2, bar.name === 'chorus' ? 1 : 0.9);
    }
    // The pad over the chorus.
    if (bar.pad && i === 0) this.pad(t, [root + 24, third(root + 24), root + 31], S16 * 16, 1);
    // The leads, the second a third up on the other side.
    if (!this.band.lead && bar.name !== 'intro') return;
    for (const e of bar.lead) {
      if (Math.floor(e.at) !== i) continue;
      const at = t + (e.at - i) * S16, dur = e.len * S16 * 0.95;
      const o = { level: e.len < 2 ? 0.85 : 1, bend: e.bend, dive: e.dive };
      this.leadNote(at, e.m, dur, { ...o, side: 0 });
      if (bar.twin) this.leadNote(at + 0.006, third(e.m), dur, { ...o, side: 1, level: o.level * 0.8 });
    }
  },

  // ---- the frame ----------------------------------------------------------
  setMuted(m) {
    this.muted = m;
    store.set('nt4-muted', m ? '1' : '0');
    if (this.out) this.out.gain.setTargetAtTime(m ? 0 : LEVEL, this.ac.currentTime, 0.05);
  },

  suspend(p) { if (this.ac) (p ? this.ac.suspend() : this.ac.resume()); },

  ok() { return this.ac && !this.muted && this.ac.state === 'running'; },

  pan(p, node) {
    if (!p || !this.ac.createStereoPanner) return node;
    const s = this.ac.createStereoPanner(); s.pan.value = Math.max(-1, Math.min(1, p));
    s.connect(node);
    return s;
  },

  burst(dur, freq, gain, type = 'lowpass', q = 0.8, f1 = freq, pan = 0, at = 0) {
    if (!this.ok()) return;
    const ac = this.ac, t = ac.currentTime + at;
    const src = ac.createBufferSource(); src.buffer = this.noise;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.04, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.pan(pan, this.sfx));
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.02);
  },

  tone(f0, f1, dur, gain, type = 'sine', pan = 0, at = 0) {
    if (!this.ok()) return;
    const ac = this.ac, t = ac.currentTime + at;
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.pan(pan, this.sfx));
    o.start(t); o.stop(t + dur + 0.02);
  },

  // Every frame: the band plays on, the diesel works with your speed, the
  // blade scrapes with the snow on it.
  update(dt, speed, load, mode) {
    if (!this.ac || this.ac.state !== 'running') return;
    const t = this.ac.currentTime;
    const b = this.band;
    b.lead = mode === 'run';
    this.music.gain.setTargetAtTime(b.on ? (mode === 'run' ? 0.6 : 0.3) : 0, t, b.on ? 0.3 : 0.8);
    if (b.next < t) b.next = t + 0.02;
    while (b.on && b.next < t + AHEAD) {
      const nextBar = b.bar + 1 < SONG.length ? b.bar + 1 : LOOP_BAR;
      this.playStep(SONG[b.bar], b.step, b.next, SONG[nextBar]);
      b.next += S16;
      if (++b.step === 16) { b.step = 0; b.bar = nextBar; }
    }
    // Up through the gears: revs climb with speed and drop at each change.
    const E = this.engine;
    const gear = Math.min(5, Math.floor(speed / 6));
    const rev = speed > 0.5 ? (speed - gear * 6) / 6 : 0;
    const f = 28 + 6 * gear + 22 * rev;
    E.growl.frequency.setTargetAtTime(f, t, 0.08);
    E.thump.frequency.setTargetAtTime(f / 2, t, 0.08);
    E.fire.frequency.setTargetAtTime(f / 2, t, 0.08);
    E.eg.gain.setTargetAtTime(mode === 'over' ? 0.05 : 0.14 + 0.06 * rev, t, 0.2);
    E.fireG.gain.setTargetAtTime(mode === 'over' ? 0.004 : 0.012 + 0.012 * rev, t, 0.2);
    E.lp.frequency.setTargetAtTime(200 + 160 * rev + 4 * speed, t, 0.2);
    const k = Math.min(1, speed / 24);
    this.blade[0].g.gain.setTargetAtTime(mode === 'run' ? (0.01 + 0.03 * load) * k : 0, t, 0.15);
    this.blade[1].g.gain.setTargetAtTime(mode === 'run' ? (0.04 + 0.12 * load) * k : 0, t, 0.15);
    this.wind[2].g.gain.setTargetAtTime(0.008 + 0.0008 * speed, t, 0.3);
  },

  // Rolling out: the band counts in from the top.
  start() {
    if (!this.ac) return;
    const b = this.band, t = this.ac.currentTime + 0.05;
    b.on = true; b.bar = 0; b.step = 0; b.next = t;
    this.tone(60, 90, 0.8, 0.12, 'sawtooth');
  },
  // A big air horn: three reeds a little out of tune with each other.
  horn() {
    if (!this.ok()) return;
    const ac = this.ac, t = ac.currentTime;
    const f = filter(ac, 'lowpass', 2400, 0.9);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.05);
    g.gain.setValueAtTime(0.09, t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    chain(f, g, this.sfx);
    for (const fr of [233, 277.5, 349]) {
      const o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(fr * 0.97, t); o.frequency.exponentialRampToValueAtTime(fr, t + 0.08);
      o.connect(f); o.start(t); o.stop(t + 0.9);
    }
  },
  // Robots jumping to it: servos whining up.
  servos(n) {
    for (let i = 0; i < Math.min(n, 4); i++) {
      const at = 0.1 + i * 0.07 + Math.random() * 0.05;
      this.tone(320 + Math.random() * 80, 1100 + Math.random() * 300, 0.22, 0.025, 'sawtooth', Math.random() * 1.4 - 0.7, at);
      this.tone(1100, 700, 0.12, 0.015, 'square', 0, at + 0.25);
    }
  },
  plow(k) {
    this.burst(0.7, 1400, 0.35 + 0.3 * k, 'lowpass', 0.7, 120);
    this.tone(80, 38, 0.4, 0.25 * k);
  },
  scrape(k) { this.burst(0.5, 500, 0.15 + 0.15 * k, 'bandpass', 2, 300); },
  leap() {
    this.tone(260, 1400, 0.5, 0.03, 'sawtooth');
    this.burst(0.9, 2000, 0.18, 'lowpass', 0.7, 300, 0, 0.3);
  },
  // The wipers: a rubbery swish across and a thunk as they park.
  wipe() {
    this.burst(0.5, 900, 0.025, 'bandpass', 1.5, 1300, -0.2);
    this.burst(0.5, 1300, 0.02, 'bandpass', 1.5, 900, 0.2, 0.55);
    this.tone(140, 90, 0.07, 0.04, 'sine', 0, 1.08);
  },
  nearMiss(side, k) {
    this.burst(0.5, 2600, 0.14 + 0.24 * k, 'bandpass', 1.2, 300, side * 0.8);
  },
  crash(kind) {
    // The crunch, glass, and the band falls apart: one last chord left
    // ringing and the lead dives off the end of the whammy bar.
    this.burst(1.6, 3000, 0.9, 'lowpass', 0.7, 60);
    this.tone(95, 28, 0.9, 0.4);
    for (let i = 0; i < 7; i++) {
      const f = 2500 + Math.random() * 4000;
      this.tone(f, f * 0.95, 0.12 + Math.random() * 0.2, 0.012, 'sine', Math.random() * 2 - 1, 0.03 + Math.random() * 0.35);
    }
    if (kind === 'robot' || kind === 'crew' || kind === 'walker' || kind === 'leaper') this.tone(900, 120, 0.5, 0.05, 'square');
    if (!this.ac) return;
    const b = this.band, t = Math.max(this.ac.currentTime + 0.01, b.next);
    b.on = false;
    this.guitar(t, midi('E2'), 1.8, true, 1.1);
    this.cymbal(t, 1.2);
    this.china(t, 1.2);
    this.kick(t);
    this.leadNote(t, midi('E5'), 1.4, { dive: true });
  },
  chime() {
    if (!this.ok()) return;
    this.tone(1318.5, 1318.5, 1.4, 0.012, 'sine', -0.3);
    this.tone(1760, 1760, 1.8, 0.009, 'sine', 0.3, 0.12);
  },
};

export { store };
