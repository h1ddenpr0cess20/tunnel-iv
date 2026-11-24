; ---- game state (zero page)
s0: .res 1                 ; distance along the road: s0 (1/256 m), s1:s2 metres
s1: .res 1
s2: .res 1
spd: .res 1                ; speed, 1/256 m a frame (8.8 with spdf)
spdf: .res 1
pxl: .res 1                ; you, across the road: 1/256 m, signed 16-bit
pxh: .res 1
vx: .res 1                 ; and how fast: 1/256 m a frame, signed (8.8 with vxf)
vxf: .res 1
dpos: .res 2               ; where the paint is in its 12 m (0..65535)
spos: .res 2               ; where the storm is in its loop
curv: .res 1               ; the road's bend here: signed, see game.s
ph0: .res 3                ; phases of the bends (24-bit, 65536 a turn in the top two bytes)
ph1: .res 3
ph2: .res 3
runf: .res 1               ; frames into this second
runs: .res 2               ; seconds driving
diff: .res 1               ; how hard it is: 0..255
nxtl: .res 1               ; where the next pattern goes, metres ahead (8.8)
nxth: .res 1
spawned: .res 1
horncool: .res 1
honk: .res 1
shake: .res 1
flash: .res 1
load: .res 1
scrape: .res 1
deadt: .res 1
dkind: .res 1
meters: .res 2             ; distance plowed (whole metres)
mfrac: .res 1
startl: .res 1
starth: .res 1
lexp: .res 4               ; log10 of the metres to the next exit, 8.24
wh_t: .res 1               ; whisper timer
wh_up: .res 1
wh_q: .res 1
ms_i: .res 1
hinted: .res 2
oi: .res 1                 ; the obstacle being worked on
sx_: .res 2
sy_: .res 1
cx_: .res 1
title_t: .res 2
best: .res 2
lastk: .res 1

.segment "BSS"
NOBJ = 14
o_k: .res NOBJ             ; kind (0 = empty)
o_xl: .res NOBJ            ; across the road, 1/256 m signed
o_xh: .res NOBJ
o_zl: .res NOBJ            ; ahead of your eyes, 1/256 m signed
o_zh: .res NOBJ
o_vx: .res NOBJ            ; 1/256 m a frame, signed
o_vz: .res NOBJ
o_t: .res NOBJ             ; timer / progress
o_a: .res NOBJ             ; aux (target, slope, phase)
o_b: .res NOBJ             ; aux (dodge from)
o_f: .res NOBJ             ; flags
o_y: .res NOBJ             ; height off the road, 1/16 m
o_md: .res NOBJ            ; nearest it came, 1/16 m
o_w: .res NOBJ             ; half width, 1/16 m
hudbuf: .res 32
lexbuf: .res 16
digs: .res 6
whbuf: .res 32
fl_x: .res 16              ; snowflakes: screen position 8.8 and velocity
fl_xf: .res 16
fl_y: .res 16
fl_yf: .res 16
fl_vx: .res 16
fl_vy: .res 16
sky_bank: .res 1
oamn: .res 1
oamrot: .res 1
rowx: .res 11
rowxh: .res 11
sortbuf: .res 16
postz: .res 2
d_pl: .res 16              ; things on the road, ready to draw
d_ph: .res 16
d_y: .res 16
d_n: .res 16
d_at: .res 16
d_fl: .res 16
d_tb: .res 16
d_sxl: .res 16
d_sxh: .res 16
d_sy: .res 16
