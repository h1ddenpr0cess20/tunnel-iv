// Synthesized sound, no samples. Audio starts on the first key press or tap.
//
// The band plays the game's song, "Whiteout on the Highway", as a chip
// tune: in D minor at 187 beats a minute, after the chiptune cut of the
// theme. A pad of chords opens it and a twelve-bar theme climbs over
// arpeggios; the verses sit on D minor, stepping down through C and B flat
// to A; the chorus goes B flat, F, C, D minor, the hook sung by a pulse
// lead with a second a third under it on the other side (up to a held high
// C, down to G, home on A), and a post-chorus that reaches for B flat and
// slides back down. After the second there's a break of stabs, a bridge on
// B flat, C and D minor, a lift on A, a breakdown of pulsing chords and a
// drop; the last chorus goes up a whole step, to E minor, and an outro
// brings it back round to the verse, for ever, like the road. The voices
// are an old sound chip's: two pulse waves of different widths for the
// leads, one more for the chords, a triangle for the bass and 1-bit noise
// for the drums. Under it there's the truck: the diesel, changing gear as
// you speed up, the blade scraping the road, the blizzard howling round the
// cab, and the wipers.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

const LEVEL = 0.7;
const BPM = 187;
const S16 = 60 / BPM / 4;  // a sixteenth, in seconds
// The band is scheduled this far ahead of the audio clock, on its own
// timer, so a slow frame (or a few) can't make it stumble.
const AHEAD = 1;

// ---- the song ---------------------------------------------------------------
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = n => {
  const m = /^([A-G])(#|b)?(\d)$/.exec(n);
  return 12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
};
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

// A chord by name ('Dm', 'Bb', 'A'), moved up `key` semitones: its root,
// low for the bass (D2 to C#3), and its triad.
function chord(name, key) {
  const m = /^([A-G])(#|b)?(m)?$/.exec(name);
  const pc = (SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + key + 12) % 12;
  return { bass: pc < 2 ? 48 + pc : 36 + pc, pc, triad: [0, m[3] ? 3 : 4, 7] };
}

// D minor, for harmonising the lead a third below.
const SCALE = [2, 4, 5, 7, 9, 10, 0];
const thirdBelow = m => {
  const i = SCALE.indexOf(((m % 12) + 12) % 12);
  if (i < 0) return m - 4;
  const down = SCALE[(i + 5) % 7];
  return m - ((((m % 12) - down) + 12) % 12);
};

// Drums on sixteen steps to the bar. `kick` and `snare` are the steps
// they hit; `hat` the noise ticking time, every eighth.
const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14];
const DRUMS = {
  // A rock beat: the kick on one and three and pushed, the snare on two and four.
  rock: { kick: [0, 6, 8, 10], snare: [4, 12], hat: EIGHTHS },
  // Driving: the kick on every eighth under the backbeat.
  drive: { kick: EIGHTHS, snare: [4, 12], hat: EIGHTHS },
  // Half time: the kick dropping like an anvil, the snare on three.
  half: { kick: [0, 3, 10], snare: [8], hat: [0, 4, 8, 12] },
  // Only the hats, for the breakdown.
  quiet: { kick: [0], snare: [], hat: EIGHTHS },
};

// Each bar names its chord (two names split the bar). `keys` is what the
// chord voice plays: 'pad' holds it, 'stab' pulses it on the eighths,
// 'arp' runs up and down it in sixteenths; `pad` holds it under the
// others too, and `soft` plays it all at half level. `bass` is 'eighths'
// on the root, 'octave' jumping an octave on the off-beats, or 'hold'.
// Lead lines are eighths, or sixteenths if a bar has sixteen of them: a
// note picks once; ^ bends up into it from a whole step below; _ slides
// into it from the note before; - holds the note before; . is a rest.
// `twin` doubles the lead a third below, on the other side. A section
// named with +2 is played a whole step up.
const SECTIONS = {
  intro: {
    drums: 'swell', keys: 'pad', bass: 'hold',
    chords: ['Dm', 'Bb', 'A', 'Bb/C'],
    lead: ['A5 - - - - - - -', 'A#5 - - - - - - -', 'A5 - - - - - - -', 'A#5 - - - C6 - . .'],
  },
  theme: {
    drums: 'rock', keys: 'arp', bass: 'eighths', pad: true,
    chords: ['Dm', 'Am', 'Bb/Gm', 'C', 'Dm', 'Bb', 'A', 'Bb/Gm', 'Dm', 'Am', 'Bb/Gm', 'C'],
    lead: [
      'A5 - - - - - D6 -', 'C6 - - - B5 - - -', 'D6 - A#5 - - - A5 -', 'C6 - - - - - - -',
      'D6 - - - - - - -', 'D6 - - - C6 - - -', 'C#6 - - - - - - -', 'D6 - - - C6 - - -',
      'A5 - - - - - D6 -', 'C6 - - - B5 - - -', 'D6 - A#5 - - - A5 -', 'C6 - - - - - . .',
    ],
  },
  verse: {
    drums: 'rock', keys: 'pad', bass: 'eighths',
    chords: ['Dm', 'Dm', 'Dm', 'Dm', 'C', 'C', 'Bb', 'Dm', 'Dm', 'Dm', 'Dm', 'Dm', 'C', 'C', 'Bb', 'A', 'A', 'Dm'],
    lead: [
      '. . . D5^ - - - -', 'D5 . F5 - - G5 - G5', '. . . . . D5^ - -', 'D5 - E5 F5 G5 - G5 A5',
      'A5 - G5 - E5 - - -', 'E5 - - - - - F5 G5', 'F5 - E5 - F5 - E5 -', 'E5 - D5 - - - . .',
      'A5 - - - - - - -', '- - . . D5^ - - -', '- - D5 . D5 . D5 -', 'D5 - F5 E5 D5 - - -',
      'G5 - - - - - - -', 'G5 - - - A5 - - -', 'A#5 - - - - - - -', 'E5 - - - - - - -',
      'E5 - D5_ - - - . .', 'D5 - - - . . . .',
    ],
  },
  chorus: {
    drums: 'drive', keys: 'stab', bass: 'octave', twin: true, pad: true,
    chords: ['Bb', 'F', 'C', 'Dm', 'Bb', 'F', 'C', 'Gm'],
    lead: [
      'A5 C6 - - - - - -', 'C6 - - - F5 - A5 G5', 'G5 - - - - - E5 -', 'A5 - - - - - - -',
      'A5 C6 - - - - - -', 'C6 - - - F5 - A5 G5', 'G5 - - - - - - -', 'A5 A#5 - - A5 - - -',
    ],
  },
  post: {
    drums: 'drive', keys: 'stab', bass: 'octave', twin: true, pad: true,
    chords: ['Dm', 'Bb', 'Bb/C', 'Dm', 'C', 'Bb', 'Bb', 'C', 'C'],
    lead: [
      'G5 - F5_ - - - . A5', 'A5 A#5 - - - - - -', 'A#5 - . . G5 - G5 -', '. A5 - - - - . F5',
      'F5 E5 - - - - C6 -', 'F5 - - - - - - -', 'G5 - - F5_ - - - -', '. F5 . E5 - - - -',
      'E5 - - - - - . .',
    ],
  },
  interlude: {
    drums: 'rock', keys: 'arp', bass: 'eighths', pad: true,
    chords: ['Dm', 'Bb', 'A', 'A'],
    lead: ['D6 - - - - - - -', 'D6 - - - C6 - - -', 'C#6 - - - - - - -', 'E6 - - - C#6 - . .'],
  },
  break: {
    drums: 'half', keys: 'stab', bass: 'hold',
    chords: ['Dm', 'Dm', 'Dm', 'Dm'],
    lead: ['D5 - - - - - - -', 'F5^ - - - - - . .', '. . . . . . . .', 'F5 G5_ - - D5 - . .'],
  },
  bridge: {
    drums: 'rock', keys: 'pad', bass: 'eighths', twin: true,
    chords: ['Bb', 'C', 'Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm'],
    lead: [
      'F5 - - - D5 - - -', 'E5 - - - - - F5 -', 'C6 - D6 - - - - -', 'D6 - - - - - - -',
      'F5 - - - - D6 - -', '- . G5 - C6 - - -', 'D6 - - - A5 - - F5', 'E5 D5 - - - - E5 F5',
      'F5 - - - D5 - - -', 'E5 - - - - - F5 -', 'C6 - D6 - - - - -', 'D6 - - - - - - -',
      'F5 - - - - D6 - -', '- . G5 - C6 - - -', 'D6 - - - A5 - - -', 'D5 - - - - - . .',
    ],
  },
  lift: {
    drums: 'rock', keys: 'arp', bass: 'eighths', twin: true, build: true,
    chords: ['Bb', 'C', 'A', 'A', 'A', 'A', 'Dm'],
    lead: ['F5 - - - G5 - - -', 'G5 - - - A5 - - -', 'A5^ - - - - - - -', 'C#6 - - - - - - -',
      'E6 - - - - - - -', 'E6 - - - C#6 - - -', 'D6 - - - - - . .'],
  },
  breakdown: {
    drums: 'quiet', keys: 'stab', bass: 'hold', pad: true, soft: true,
    chords: ['Gm', 'Am', 'C', 'Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'F', 'C', 'Dm'],
    lead: Array(12).fill('. . . . . . . .'),
  },
  drop: {
    drums: 'drive', keys: 'arp', bass: 'octave', pad: true, build: true,
    chords: ['Bb', 'F', 'C', 'Dm', 'Gm', 'F', 'C', 'D', 'Bb', 'F', 'C', 'Dm'],
    lead: Array(12).fill('. . . . . . . .'),
  },
  // Up a whole step: the bar before the last chorus.
  lift2: {
    drums: 'rock', keys: 'stab', bass: 'eighths', build: true,
    chords: ['Em'],
    lead: ['. . . . . . . .'],
  },
  outro: {
    drums: 'drive', keys: 'stab', bass: 'octave', pad: true,
    chords: ['Em', 'C', 'B', 'C/Am', 'Em', 'B', 'C/Am', 'D'],
    lead: ['G5 - - - - - - -', 'G5 - - - E5 - - -', 'F#5 - - - D#5 - - -', 'E5 - - - - - - -',
      'B5 - - - - - - -', 'A5^ - - - F#5 - - -', 'G5 - - - A5 - - -', 'A5 - - - - - . .'],
  },
};
// Round and round: after the outro it goes back to the first verse.
const ORDER = ['intro', 'theme', 'verse', 'chorus', 'post', 'interlude', 'verse', 'chorus', 'post',
  'break', 'bridge', 'lift', 'breakdown', 'drop', 'chorus', 'post', 'lift2', 'chorus+2', 'post+2', 'outro'];
const LOOP_TO = 2;

// A line as notes at (and lasting) so many sixteenths.
function parseLine(line, key) {
  const out = [];
  const toks = line.split(' ');
  const step = 16 / toks.length;
  toks.forEach((tok, i) => {
    const last = out[out.length - 1];
    if (tok === '-') { if (last && last.end === i) { last.len += step; last.end++; } return; }
    if (tok === '.') return;
    const mark = /[\^!_]$/.exec(tok)?.[0];
    const m = midi(mark ? tok.slice(0, -1) : tok);
    out.push({ at: i * step, len: step, end: i + 1, m: m + key, low: thirdBelow(m) + key, bend: mark === '^', dive: mark === '!', slide: mark === '_' });
  });
  return out;
}

const SONG = ORDER.flatMap((entry, k) => {
  const [name, up] = entry.split('+');
  const key = Number(up || 0);
  const sec = SECTIONS[name];
  return sec.chords.map((c, i) => ({
    ...sec, name, chords: c.split('/').map(n => chord(n, key)), lead: parseLine(sec.lead[i], key),
    first: i === 0, last: i === sec.chords.length - 1, bar: i,
    fill: (i % 8 === 7 || i === sec.chords.length - 1) && sec.drums !== 'swell' && sec.drums !== 'quiet' && !(sec.build && i === sec.chords.length - 1),
    build: !!sec.build && i === sec.chords.length - 1, start: k === LOOP_TO && i === 0,
  }));
});
const LOOP_BAR = SONG.findIndex(b => b.start);
// The chord at sixteenth `step` of a bar.
const chordAt = (bar, step) => bar.chords[bar.chords.length > 1 && step >= 8 ? 1 : 0];

// A pulse wave `duty` of the way high, the sound chip's square.
function pulseWave(ac, duty) {
  const n = 64, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    re[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI);
    im[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI);
  }
  return ac.createPeriodicWave(re, im);
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
    setInterval(() => this.schedule(), 100);
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
    // loud chorus can't clip, the chip's fizz taken off the very top, a
    // little room.
    this.music = gainNode(ac, 0.4);
    const sum = gainNode(ac, 0.85);
    const glue = ac.createDynamicsCompressor();
    glue.threshold.value = -16; glue.knee.value = 12; glue.ratio.value = 4; glue.attack.value = 0.006; glue.release.value = 0.18;
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -4; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
    chain(sum, filter(ac, 'highpass', 40, 0.7), filter(ac, 'lowpass', 9000, 0.5), glue, limiter, this.music, dest);
    const room = ac.createConvolver(); room.buffer = impulse(ac, 0.7, 3);
    chain(sum, room, gainNode(ac, 0.12), glue);

    // The chip's voices: pulse waves an eighth, a quarter and a half high,
    // and its noise, 1-bit, each value held a few samples so it's grainy.
    this.waves = { 12: pulseWave(ac, 0.125), 25: pulseWave(ac, 0.25), 50: pulseWave(ac, 0.5) };
    const chip = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const cd = chip.getChannelData(0);
    for (let i = 0, v = 1; i < cd.length; i++) { if (i % 3 === 0) v = Math.random() < 0.5 ? -1 : 1; cd[i] = v; }
    this.chipNoise = chip;

    // The leads, one each side of the middle, with an echo a dotted eighth
    // behind on the other side.
    const leadRig = pan => {
      const input = gainNode(ac, 1);
      const out = chain(input, filter(ac, 'lowpass', 7000), panner(ac, pan), gainNode(ac, 0.45));
      out.connect(sum);
      const echo = ac.createDelay(1); echo.delayTime.value = S16 * 3;
      const fb = gainNode(ac, 0.3);
      input.connect(gainNode(ac, 0.3)).connect(echo);
      echo.connect(fb).connect(echo);
      echo.connect(filter(ac, 'lowpass', 3000)).connect(panner(ac, -pan)).connect(gainNode(ac, 0.1)).connect(sum);
      return { input };
    };
    // The chords a little to the left, the arpeggios a little to the right.
    const keys = gainNode(ac, 1);
    chain(keys, filter(ac, 'lowpass', 5000), panner(ac, -0.2), gainNode(ac, 0.5), sum);
    const arp = gainNode(ac, 1);
    chain(arp, panner(ac, 0.35), gainNode(ac, 0.6), sum);
    const drums = gainNode(ac, 0.4);
    drums.connect(sum);
    this.bus = { sum, drums, keys, arp, leads: [leadRig(-0.15), leadRig(0.3)], filters: new Map() };
    // `live` holds every note scheduled and not yet over, so a crash can cut the ones still to come.
    this.band = { on: true, bar: 0, step: 0, next: ac.currentTime + 0.1, lead: false, live: new Set() };
  },

  // An envelope on gain g: up to peak, held, and away.
  env(g, when, peak, attack, hold, release) {
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.setValueAtTime(peak, when + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + hold + release);
    return when + attack + hold + release + 0.04;
  },
  // An oscillator: a wave by name, or one of the chip's pulses.
  osc(type, f, when, end, dest, detune = 0) {
    const o = this.ac.createOscillator();
    if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    o.frequency.setValueAtTime(f, when); o.detune.value = detune;
    o.connect(dest); o.start(when); o.stop(end);
    this.track(o, when);
    return o;
  },
  // A burst of the chip's noise through one of the kit's filters, made once and shared.
  noiseHit(when, { freq = 1000, type = 'bandpass', q = 1, level = 0.3, length = 0.1 }) {
    const ac = this.ac, key = `${type} ${freq} ${q}`;
    if (!this.bus.filters.has(key)) this.bus.filters.set(key, chain(filter(ac, type, freq, q), this.bus.drums));
    const s = ac.createBufferSource(); s.buffer = this.chipNoise;
    const g = ac.createGain();
    g.gain.setValueAtTime(level, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + length);
    s.connect(g); g.connect(this.bus.filters.get(key));
    s.start(when, Math.random() * 0.8); s.stop(when + length + 0.05);
    this.track(s, when);
  },

  // ---- the kit --------------------------------------------------------------
  // The chip's kit: a triangle dropping fast for the kick, a burst of noise
  // for the snare, a tick of it for the hats.
  kick(when, level = 1) {
    const g = gainNode(this.ac, 1); g.connect(this.bus.drums);
    const end = this.env(g, when, 0.9 * level, 0.001, 0.03, 0.12);
    this.osc('triangle', 170, when, end, g).frequency.exponentialRampToValueAtTime(45, when + 0.07);
    this.noiseHit(when, { freq: 2500, type: 'highpass', q: 0.7, level: 0.12 * level, length: 0.012 });
  },
  snare(when, level = 1) {
    this.noiseHit(when, { freq: 2600, q: 0.7, level: 0.6 * level, length: 0.14 });
    const g = gainNode(this.ac, 1); g.connect(this.bus.drums);
    const end = this.env(g, when, 0.4 * level, 0.001, 0.01, 0.07);
    this.osc('triangle', 260, when, end, g).frequency.exponentialRampToValueAtTime(150, when + 0.06);
  },
  hat(when, level = 1) { this.noiseHit(when, { freq: 8000, type: 'highpass', q: 0.7, level: 0.32 * level, length: 0.035 }); },
  tom(when, pitch, level = 1) {
    const g = gainNode(this.ac, 1); g.connect(this.bus.drums);
    const end = this.env(g, when, 0.6 * level, 0.002, 0.03, 0.16);
    this.osc('triangle', pitch * 1.8, when, end, g).frequency.exponentialRampToValueAtTime(pitch, when + 0.1);
  },
  cymbal(when, level = 1) {
    this.noiseHit(when, { freq: 5000, type: 'highpass', q: 0.5, level: 0.3 * level, length: 1.1 });
  },
  // A china: trashy, short, for the accents.
  china(when, level = 1) {
    this.noiseHit(when, { freq: 3500, q: 2, level: 0.2 * level, length: 0.4 });
  },

  // ---- the band's parts -------------------------------------------------------
  // A chord on the half-high pulse: held, it swells in and wavers; stabbed,
  // it's short, a blip on the eighth.
  chord(when, c, length, held, level = 1) {
    const g = this.ac.createGain();
    g.connect(this.bus.keys);
    const end = held
      ? this.env(g, when, 0.12 * level, 0.04, Math.max(0.05, length - 0.12), 0.12)
      : this.env(g, when, 0.16 * level, 0.002, 0.04, 0.05);
    const root = 60 + c.pc > 66 ? 48 + c.pc : 60 + c.pc;
    for (const n of [...c.triad, 12]) {
      const o = this.osc(this.waves[50], hz(root + n), when, end, g, n === 12 ? 5 : 0);
      if (held) this.vibrato(o, when, end, 14, 0.3);
    }
  },
  // A run up and down the chord on the quarter pulse, an octave above it.
  arpNote(when, c, step, level = 1) {
    const root = 72 + c.pc > 78 ? 60 + c.pc : 72 + c.pc;
    const notes = [0, c.triad[1], 7, 12, 7, c.triad[1]];
    const g = gainNode(this.ac, 1); g.connect(this.bus.arp);
    const end = this.env(g, when, 0.35 * level, 0.002, S16 * 0.4, 0.05);
    this.osc(this.waves[25], hz(root + notes[step % notes.length]), when, end, g);
  },
  // The bass: the chip's triangle, plain, a step under each note.
  bassNote(when, m, length, level = 1) {
    const g = gainNode(this.ac, 1); g.connect(this.bus.sum);
    const end = this.env(g, when, 0.25 * level, 0.003, Math.max(0.02, length * 0.7), 0.04);
    this.osc('triangle', hz(m), when, end, g);
  },
  // Vibrato on an oscillator, coming in after `delay`, `cents` deep.
  vibrato(o, when, end, cents, delay) {
    const vib = this.ac.createOscillator(); vib.frequency.value = 5.8;
    const depth = this.ac.createGain();
    depth.gain.setValueAtTime(0, when);
    depth.gain.linearRampToValueAtTime(0, when + delay);
    depth.gain.linearRampToValueAtTime(cents, when + delay + 0.2);
    vib.connect(depth).connect(o.detune);
    vib.start(when); vib.stop(end);
  },
  // A lead note on one side, the quarter pulse for the tune, the eighth
  // for the harmony under it; vibrato comes in on the long ones. A bend
  // starts a whole step low and is pushed up into pitch; a dive drops off
  // the end.
  leadNote(when, m, length, { side = 0, level = 1, bend = false, dive = false, from = null } = {}) {
    const g = this.ac.createGain();
    g.connect(this.bus.leads[side].input);
    const end = this.env(g, when, level, 0.004, Math.max(0.05, length * 0.85), dive ? 0.6 : 0.08);
    const o = this.osc(this.waves[side ? 12 : 25], hz(m), when, end, g);
    if (bend) { o.frequency.setValueAtTime(hz(m - 2), when); o.frequency.setTargetAtTime(hz(m), when + 0.02, 0.04); }
    if (dive) { o.frequency.setValueAtTime(hz(m), when + 0.15); o.frequency.exponentialRampToValueAtTime(hz(m - 30), end - 0.05); }
    if (from != null) { o.frequency.setValueAtTime(hz(from), when); o.frequency.exponentialRampToValueAtTime(hz(m), when + Math.min(0.12, length * 0.5)); }
    if (length > S16 * 3 && !dive) this.vibrato(o, when, end, 30, 0.18);
  },

  drums(bar, i, t) {
    const D = DRUMS[bar.drums];
    if (bar.drums === 'swell') {
      // The intro: the chords left to ring, toms rolling in, a snare roll into the theme.
      if (bar.bar === 0 && i === 0) this.cymbal(t);
      if (bar.bar === 2 && i % 2 === 0) this.tom(t, i < 8 ? 82 : 110, 0.4 + 0.04 * i);
      if (bar.last) this.snare(t, 0.3 + 0.045 * i);
      return;
    }
    if (bar.first && i === 0) { this.cymbal(t, 1.1); this.kick(t); }
    if (bar.build && i >= 8) {
      // Rolling up into the next section: sixteenths on the snare, louder and louder.
      this.snare(t, 0.45 + 0.07 * (i - 8));
      if (i % 4 === 0) this.kick(t);
      return;
    }
    if (bar.fill && i >= 12) {
      // A fill down the toms.
      this.tom(t, [190, 150, 120, 95][i - 12], 0.9);
      if (i === 12) this.kick(t);
      return;
    }
    if (D.kick.includes(i)) this.kick(t, i % 4 === 0 ? 1 : 0.85);
    if (D.snare.includes(i)) this.snare(t);
    if (D.hat.includes(i)) this.hat(t, i % 4 === 0 ? 1 : 0.7);
    if (bar.name === 'chorus' && i === 0 && bar.bar % 2 === 1) this.china(t);
  },

  // One sixteenth of the song.
  playStep(bar, i, t, next) {
    this.drums(bar, i, t);
    const c = chordAt(bar, i), root = c.bass;
    const split = bar.chords.length > 1, lv = bar.soft ? 0.5 : 1;
    // The bass: eighths on the root, the last one stepping into the next
    // chord; or jumping the octave; or held.
    if ((bar.bass === 'eighths' || bar.bass === 'octave') && i % 2 === 0) {
      const into = chordAt(next, 0).bass;
      const step = i === 14 && into !== root ? (into > root ? into - 2 : into + 1) : root;
      this.bassNote(t, step + (bar.bass === 'octave' && i % 4 === 2 && i !== 14 ? 12 : 0), S16 * 1.6, i === 0 ? 1.08 : 0.9);
    } else if (bar.bass === 'hold' && (i === 0 || (i === 8 && split))) {
      this.bassNote(t, root, S16 * (split ? 7.5 : 15), lv);
    }
    // The chords: held, pulsed or run up and down, and a pad under the pulses.
    const whole = i === 0 || (i === 8 && split);
    if (bar.keys === 'pad' && whole) this.chord(t, c, S16 * (split ? 8 : 16), true, lv);
    if (bar.keys === 'stab' && i % 2 === 0) this.chord(t, c, S16, false, lv * (i % 4 === 0 ? 1 : 0.75));
    if (bar.keys === 'arp') this.arpNote(t, c, i, lv * (i % 4 === 0 ? 1 : 0.8));
    if (bar.pad && bar.keys !== 'pad' && whole) this.chord(t, c, S16 * (split ? 8 : 16), true, 0.6 * lv);
    // The leads, the second a third below on the other side.
    if (!this.band.lead && bar.name !== 'intro') return;
    for (const e of bar.lead) {
      if (Math.floor(e.at) !== i) continue;
      const at = t + (e.at - i) * S16, dur = e.len * S16 * 0.95;
      const from = e.slide ? this.band.lastLead : null;
      const o = { level: e.len < 2 ? 0.85 : 1, bend: e.bend, dive: e.dive };
      this.leadNote(at, e.m, dur, { ...o, side: 0, from: from && from.m });
      if (bar.twin) this.leadNote(at + 0.006, e.low, dur, { ...o, side: 1, level: o.level * 0.6, from: from && from.low });
      this.band.lastLead = e;
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

  // A note's source, kept until it ends.
  track(node, when) {
    node.at = when;
    this.band.live.add(node);
    node.onended = () => this.band.live.delete(node);
  },
  // Every note that hasn't started yet, cut before it does.
  cut(t) {
    for (const n of this.band.live) {
      if (n.at < t) continue;
      try { n.stop(t); } catch { /* already stopped */ }
      this.band.live.delete(n);
    }
  },

  // The band, a second ahead. If it ever falls behind (the tab was away),
  // it skips whole sixteenths, so it comes back in time, never late.
  schedule() {
    if (!this.ac || this.ac.state !== 'running') return;
    const b = this.band, t = this.ac.currentTime;
    if (!b.on) return;
    while (b.next < t + 0.02) this.advance();
    while (b.next < t + AHEAD) {
      this.playStep(SONG[b.bar], b.step, b.next, SONG[this.nextBar()]);
      this.advance();
    }
  },
  nextBar() { return this.band.bar + 1 < SONG.length ? this.band.bar + 1 : LOOP_BAR; },
  advance() {
    const b = this.band;
    b.next += S16;
    if (++b.step === 16) { b.step = 0; b.bar = this.nextBar(); }
  },

  // Every frame: the diesel works with your speed, the blade scrapes with
  // the snow on it, and the band comes up while you drive.
  update(dt, speed, load, mode) {
    if (!this.ac || this.ac.state !== 'running') return;
    const t = this.ac.currentTime;
    const b = this.band;
    b.lead = mode === 'run';
    this.music.gain.setTargetAtTime(b.on ? (mode === 'run' ? 0.6 : 0.3) : 0, t, b.on ? 0.3 : 0.8);
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
    this.cut(t);
    b.on = true; b.bar = 0; b.step = 0; b.next = t;
    this.schedule();
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
    // ringing and the lead dives off the end.
    this.burst(1.6, 3000, 0.9, 'lowpass', 0.7, 60);
    this.tone(95, 28, 0.9, 0.4);
    for (let i = 0; i < 7; i++) {
      const f = 2500 + Math.random() * 4000;
      this.tone(f, f * 0.95, 0.12 + Math.random() * 0.2, 0.012, 'sine', Math.random() * 2 - 1, 0.03 + Math.random() * 0.35);
    }
    if (kind === 'robot' || kind === 'crew' || kind === 'walker' || kind === 'leaper') this.tone(900, 120, 0.5, 0.05, 'square');
    if (!this.ac) return;
    const t = this.ac.currentTime + 0.01;
    this.band.on = false;
    this.cut(t);
    const e = chord('E', 0);
    this.chord(t, e, 1.8, true, 1.6);
    this.bassNote(t, e.bass, 1.4, 1.1);
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
