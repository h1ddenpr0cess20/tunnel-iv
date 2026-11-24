# Neverending Tunnel IV: Whiteout on the Highway

Plow an endless highway through a whiteout, round the robots shovelling
it and the cars stuck on it, towards the next exit. The exit is always
just up ahead. You never reach it.

The tunnel is a storm now. You drive a cab-over snowplow down a road
between snowbanks, the blizzard streaming at your windscreen, and
overhead the storm swirls like ink combed out on water, streaming out of
the white far ahead. It's all in black and white, from the driver's
seat: the blade below you throwing snow off to the right, the wipers
sweeping the flakes off the glass, frost creeping in at its edges, and
the road behind you in the mirror. Like Neverending Tunnel II and III
it's drawn with WebGPU where the browser has it and WebGL 2 where it
doesn't, with the same shaders written for each (WGSL in `src/shaders`,
GLSL in `src/shaders/gl`).

![Title screen: the storm swirling over the road, seen through the windscreen](docs/screenshots/title.png)

| | |
|---|---|
| ![Robots shovelling the road ahead](docs/screenshots/robots.png) | ![A crew of robots across the road, with a gap](docs/screenshots/crew.png) |
| Robots shovelling | A crew holding the line |
| ![A car crawling along and a buried car](docs/screenshots/cars.png) | ![A semi jackknifed across the road](docs/screenshots/semi.png) |
| A car, a buried car, a loose tire | A jackknifed semi |

On a phone it's the cab-over's tall windscreen:

<img src="docs/screenshots/phone.png" alt="The view on a phone: the storm streaming out of the white over the blade" width="260">

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

The build is plain static files (relative paths), so any static host
can serve `dist/` as it is.

Needs WebGPU or WebGL 2 (any current browser). `?renderer=webgl` or
`?renderer=webgpu` pins one, and `?particles=40000` sets how much snow
there is (it otherwise starts at 70,000, or 30,000 on phones, and thins
itself out if frames run slow).

## Controls

- ← → / A D: steer across the road
- ↑ / W / Space: sound the horn
- Drag: steer, on a phone; tap or flick up: horn
- Space / tap: roll out, get back on the road
- P: pause, M: sound

## On the road

- Robots shovelling the road, bent over their shovels: honk and they hop out of the way
- Crews of robots right across the road, holding their line, with one gap
- Robots walking across with their shovels on their shoulders: honk and they run
- Robots leaping right across the road from the banks
- Cars crawling along with their hazards on, changing lanes
- Cars spinning out
- Cars buried in drifts, only their roofs showing
- A semi jackknifed across the road, with a gap at one end
- Loose tires bouncing towards you
- Drifts: plow straight through them

Tail lights, hazards and reflectors glow through the snow before what
they're on comes out of it. Passing close is a near miss: you'll hear it
go by.

## Sound

All made as it plays, with Web Audio, no samples. The band plays the
game's song, "Whiteout on the Highway": hard, driving metal in D minor at
185 beats a minute, the guitars in drop D, the verses going D, B flat, A,
the choruses D, B flat, C. The vocal hook is sung by two lead guitars in
harmony a third apart, up to a belted high B flat and a long high E that
slides down to D. It opens on one held, bent high D; there's a half-time
bridge that lifts back up, and a solo of long bends and runs. The sound is
after the [Madness Engine](https://github.com/h1ddenpr0cess20/madness-engine)'s
band (Metroll's): the rhythm guitars a wall of detuned-saw power chords,
one rig hard left and one hard right a hair late, the mids pushed into a
hard clipper, the lows put back, the middle scooped; palm-muted, they're
darkened before the amp so they thud. The bass drives eighths and steps
into each change. The drums are a metal kit (the beater's click on the
kick, a cracking snare, toms, a china), driving eighths on the kick in the
choruses, double bass under the solo, a fill into every change. A dark
string pad hangs over the choruses. The band is scheduled a second ahead
on its own timer, so a slow frame can't make it stumble. When you crash,
it hits one last chord and the lead dives off the end of the whammy bar.
Under it all: the diesel changing gear, the blade scraping the road, the
blizzard howling round the cab, the air horn and the wipers.

## Layout

- `src/shaders/tube.wgsl`: the highway (road, banks, the wall of blowing snow and the storm), its whole mesh made up from the vertex index
- `src/shaders/particles.wgsl`: the blizzard and the snow thrown off the blade, every flake made up from its index, and the lamps glowing through them
- `src/shaders/things.wgsl`: robots, cars, the semi, tires, posts, drifts and your blade: what each part is made of, and the light on them
- `src/shaders/sky.wgsl`: the light at the end
- `src/shaders/post.wgsl`: black and white, grain, the windscreen (snow, frost, wipers), the cab and its mirror, flash and fade
- `src/shaders/gl/`: the same five for WebGL 2
- `src/gpu.js`, `src/gl.js`: the WebGPU and WebGL 2 renderers; `src/renderer.js` picks one
- `src/frame.js`: packs each frame's uniforms once for either renderer
- `src/game.js`: driving, steering, the horn, the things on the road, plowing, collisions and near misses
- `src/meshes.js`: robots, shovels, cars, tires, the blade and its marker rods, the snow off it and drifts, swept along splines and lofted through sections
- `src/main.js`: the frame loop
- `src/input.js`, `src/hud.js`, `src/sound.js`: controls, HUD, the band and the truck
- `src/constants.js`, `src/math.js`: shared numbers and helpers

## Demastered (NES)

`nes/` is a port to the NES: the same highway, storm and band, in four
greys. `nes/tunnel-iv.nes` is a 288 KB MMC3 cartridge (iNES mapper 4,
32 KB PRG, 256 KB CHR) for any emulator or flash cart; `nes.html` plays it
in the browser (`npm run dev`, then `/nes.html`).

Controls: left/right (or A/D) to steer, up, Z or Space (A) and X (B) to
sound the horn, Enter (Start) to roll out and pause, Shift (Select) to turn
the sound off and on, M to mute the page.

How it fits on the machine:

- The storm is 16 looping frames of the original's ink swirl, rendered,
  dithered to the NES's four greys and swapped in by CHR bank each frame.
- The road is a 512-pixel-wide picture across both nametables. A scanline
  IRQ shears it row by row, a different scroll for every 8 lines, for
  steering and bends; its ruts and bare patches run by switching CHR banks.
- Robots, cars, the semi, tires and drifts are the remastered game's models,
  captured and cut into 8x16 sprites at eight distances. The far ones live in
  an always-loaded bank, the rest in three banks picked each frame, nearest
  first; past eight sprites on a line, or three banks, things take turns.
- The band is "Whiteout on the Highway" from `src/sound.js`, arranged by
  `nes/tools/music.py`: lead and twin/rhythm on the pulses, bass on the
  triangle, the kit on noise.

Building needs Python 3 with numpy and Pillow, and cc65 (`ca65`, `ld65`):

```sh
cd nes && ./build.sh   # -> nes/tunnel-iv.nes, copied to public/
```

`nes/tools/capture/` re-renders the model captures in `nes/models/` from the
remastered game (only needed if the models change).
