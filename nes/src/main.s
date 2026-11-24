; Neverending Tunnel IV: Demastered -- NES (MMC3, 32K PRG, 256K CHR, vertical mirroring)
;
; Plow an endless highway through a whiteout. The picture is the original's: the storm swirling
; overhead in black and white (16 frames that loop as you drive), the road between the banks (a
; 512 px wide picture whose paint and ruts go by in phases), your blade and the dash. Steering and
; the road's bends shear the road row by row: an MMC3 scanline IRQ rewrites the PPU's address and the
; tile bank in hblank at every road row. Everything on the road is sprites, from the remastered game's
; models.

.segment "HEADER"
  .byte "NES", $1A, 2, 32, $41, 0, 0, 0, 0, 0, 0, 0, 0, 0

PPUCTRL = $2000
PPUMASK = $2001
PPUSTAT = $2002
OAMADDR = $2003
PPUSCRL = $2005
PPUADDR = $2006
PPUDATA = $2007
OAMDMA  = $4014
JOY1    = $4016

BTN_A = $80
BTN_B = $40
BTN_SEL = $20
BTN_START = $10
BTN_UP = $08
BTN_DOWN = $04
BTN_LEFT = $02
BTN_RIGHT = $01

NEV = 15                   ; scroll list entries a frame

.segment "ZEROPAGE"
t0: .res 1
t1: .res 1
t2: .res 1
t3: .res 1
t4: .res 1
t5: .res 1
ptr: .res 2
ptr2: .res 2
nmi_cnt: .res 1
frame: .res 1
busy: .res 1
mask: .res 1
ctrl: .res 1
pad: .res 1
padn: .res 1
rnd: .res 2
state: .res 1              ; 0 title, 1 run, 2 dying, 3 over
paused: .res 1
ia: .res 1
ix: .res 1
iy: .res 1
iseq: .res 1
iend: .res 1
ifx: .res 1
efront: .res 1
epend: .res 1
q_wr: .res 1
q_rd: .res 1
r1val: .res 1
sprb: .res 3               ; R3-R5: the sprite banks loaded this frame (0 = none)
sprbn: .res 3              ; and next frame's
pal_dirty: .res 1
qa: .res 1                 ; multiply
qb: .res 1
qlo: .res 1
qt: .res 1
qy: .res 1
qx: .res 1
rr: .res 1
lastn: .res 1
lagn: .res 1
ystep: .res 1
dq: .res 1
dxa: .res 1
dxs: .res 1
ppmh: .res 1
dbk: .res 1
tbase: .res 1
ry: .res 1
fadel: .res 1
fi: .res 1
di: .res 1
sortn: .res 1
qbud: .res 1
qlen: .res 1
fspd: .res 1
grpb: .res 6
rx_: .res 2
jolt: .res 1
dn: .res 1

.include "gamevars.s"
.include "soundvars.s"

.segment "OAM"
oam: .res 256

.segment "BSS"
qbuf: .res 128
pal: .res 32
ev_hi: .res 32
ev_y: .res 32
ev_x: .res 32
ev_lo: .res 32
ev_bk: .res 32
ev_lat: .res 32

.segment "CODE"

; ------------------------------------------------------------------ reset
reset:
  sei
  cld
  ldx #$40
  stx $4017
  ldx #$FF
  txs
  inx
  stx PPUCTRL
  stx PPUMASK
  stx $4010
  bit PPUSTAT
: bit PPUSTAT
  bpl :-
  lda #0
  tax
: sta $00,x
  sta $0300,x
  sta $0400,x
  sta $0500,x
  sta $0600,x
  sta $0700,x
  lda #$F0
  sta oam,x
  lda #0
  inx
  bne :-
: bit PPUSTAT
  bpl :-
  lda #$C7
  sta rnd
  lda #$3A
  sta rnd+1
  lda #$0F
  sta $4015
  ldx #31
: lda INIT_PAL,x
  sta pal,x
  dex
  bpl :-
  inc pal_dirty
  lda #R1_TITLE
  sta r1val
  jsr set_fixed_banks
  jsr load_nametables
  jsr init_lists
  lda #$FF
  sta epend
  jsr sound_init
  lda #$18                ; background and sprites, both hidden in the left 8 px (the pillar)
  sta mask
  lda #$A0                ; NMI on, 8x16 sprites, background tiles from $0000
  sta ctrl
  lda #1
  sta busy
  lda PPUSTAT
  lda ctrl
  sta PPUCTRL
  cli
  jsr go_title

main:
  jsr wait_nmi
  lda nmi_cnt              ; vblanks since the last time round (2 when the last frame ran long)
  sec
  sbc lastn
  sta lagn
  lda nmi_cnt
  sta lastn
  inc frame
  jsr read_pad
  jsr rand
  lda state
  beq @title
  cmp #1
  beq @run
  cmp #2
  beq @dying
  jmp @over
@title:
  jsr title_update
  jmp @draw
@run:
  lda padn
  and #BTN_START
  beq :+
  jsr toggle_pause
: lda paused
  beq :+
  jmp main
:  lda lagn                 ; a frame was dropped: catch the game up a step, so it keeps its speed
  cmp #2
  bcc @step
  lda padn
  pha
  lda #0
  sta padn
  jsr game_update
  pla
  sta padn
  lda state
  cmp #1
  bne @draw
@step:
  jsr game_update
  jmp @draw
@dying:
  jsr dying_update
  jmp @draw
@over:
  jsr over_update
@draw:
  lda padn
  and #BTN_SEL
  beq :+
  jsr sound_toggle
: jsr build_scroll
  jsr build_oam
  jsr hud_update
  jmp main

wait_nmi:
  lda nmi_cnt
: cmp nmi_cnt
  beq :-
  rts

read_pad:
  lda pad
  pha
  lda #1
  sta JOY1
  lda #0
  sta JOY1
  sta pad
  ldx #8
: lda JOY1
  and #3
  cmp #1
  rol pad
  dex
  bne :-
  pla
  eor #$FF
  and pad
  sta padn
  rts

rand:                      ; 16-bit Galois LFSR; A = new low byte
  lda rnd+1
  lsr a
  ror rnd
  bcc :+
  eor #$B4
: sta rnd+1
  lda rnd
  eor rnd+1
  rts

; qmul: A * Y -> A = high byte, qlo = low byte (unsigned, quarter squares)
qmul:
  stx qx
  sta qa
  sty qy
  clc
  adc qy
  tax                      ; a + b (low)
  lda #0
  rol a
  sta qt                   ; carry: a + b >= 256
  lda qa
  sec
  sbc qy
  bcs :+
  eor #$FF
  adc #1                   ; |a - b|
: tay
  lda qt
  bne @hi
  lda QS_LO,x
  sec
  sbc QS_LO,y
  sta qlo
  lda QS_HI,x
  sbc QS_HI,y
  ldy qy
  ldx qx
  rts
@hi:
  lda QS_LO+256,x
  sec
  sbc QS_LO,y
  sta qlo
  lda QS_HI+256,x
  sbc QS_HI,y
  ldy qy
  ldx qx
  rts

; ------------------------------------------------------------------ PPU setup
set_fixed_banks:           ; R1 (text and fittings), R2-R3 (the sprites always there), R4-R5
  lda #1
  sta $8000
  lda r1val
  sta $8001
  lda #2
  sta $8000
  lda #SPR_COMMON
  sta $8001
  lda #3
  sta $8000
  lda sprb
  sta $8001
  lda #4
  sta $8000
  lda sprb+1
  sta $8001
  lda #5
  sta $8000
  lda sprb+2
  sta $8001
  lda #0
  sta $8000                ; R0 stays selected: the IRQ only ever writes $8001
  rts

load_nametables:           ; with rendering off
  lda PPUSTAT
  lda #$20
  sta PPUADDR
  lda #$00
  sta PPUADDR
  lda #<NT0
  sta ptr
  lda #>NT0
  sta ptr+1
  jsr copy_nt
  lda #$24
  sta PPUADDR
  lda #$00
  sta PPUADDR
  lda #<NT1
  sta ptr
  lda #>NT1
  sta ptr+1
copy_nt:                   ; 960 tiles from (ptr), then 64 attribute bytes of palette 0
  ldx #3
  ldy #0
: lda (ptr),y
  sta PPUDATA
  iny
  bne :-
  inc ptr+1
  dex
  bne :-
: lda (ptr),y
  sta PPUDATA
  iny
  cpy #192
  bne :-
  lda #0
  ldy #64
: sta PPUDATA
  dey
  bne :-
  rts

; Rendering off for a frame while the nametables are rewritten (title, game over).
screen_off:
  jsr wait_nmi
  lda #1
  sta busy
  lda #0
  sta PPUMASK
  sta $E000                ; no scanline IRQs
  rts

screen_on:
  lda #0
  sta q_rd
  sta q_wr
  jsr wait_nmi_raw
  lda #0
  sta busy
  rts

wait_nmi_raw:
  lda nmi_cnt
: cmp nmi_cnt
  beq :-
  rts

; ------------------------------------------------------------------ text
; Where screen row A, column X is in the nametables, with the road rows scrolled to the middle (X = 128).
; -> ptr2 = PPU address.
scr_addr:
  sta t0
  stx t1
  cmp #13
  bcc @fixed
  cmp #24
  bcs @fixed
  txa
  clc
  adc #16                  ; picture column
  cmp #32
  bcc @nt0
  and #31
  sta t1
  lda #$24
  bne @calc
@nt0:
  sta t1
@fixed:
  lda #$20
@calc:
  sta ptr2+1
  lda t0
  lsr a
  lsr a
  lsr a
  clc
  adc ptr2+1
  sta ptr2+1
  lda t0
  asl a
  asl a
  asl a
  asl a
  asl a
  ora t1
  sta ptr2
  rts

; Writes a string record (row, col, len, tiles...) at (ptr) straight to the PPU (rendering off).
put_str:
  ldy #0
  lda (ptr),y
  pha
  iny
  lda (ptr),y
  tax
  pla
  jsr scr_addr
  ldy #2
  lda (ptr),y
  sta t2
  iny
@l:
  lda ptr2+1
  sta PPUADDR
  lda ptr2
  sta PPUADDR
  lda (ptr),y
  sta PPUDATA
  iny
  ; next column: across from NT0 into NT1 on the road rows
  inc ptr2
  lda ptr2
  and #31
  bne :+
  lda ptr2
  sec
  sbc #32
  sta ptr2
  lda ptr2+1
  eor #$04
  sta ptr2+1
: dec t2
  bne @l
  rts

; Clears screen rows A..X-1, columns 1..30 to black (rendering off): the panel for the title and game over.
panel:
  sta t4
  stx t5
@row:
  lda t4
  ldx #1
  jsr scr_addr
  ldy #30
@c:
  lda ptr2+1
  sta PPUADDR
  lda ptr2
  sta PPUADDR
  lda #BLACK_T
  sta PPUDATA
  inc ptr2
  lda ptr2
  and #31
  bne :+
  lda ptr2
  sec
  sbc #32
  sta ptr2
  lda ptr2+1
  eor #$04
  sta ptr2+1
: dey
  bne @c
  inc t4
  lda t4
  cmp t5
  bne @row
  rts

; queue a run: A = len, ptr2 = PPU address; then call q_byte len times. Returns X = write index.
q_open:                    ; C clear: room (X = where); C set: no room this frame
  pha
  ldx q_rd                 ; drained: start again from the top (only here, never in the NMI, which
  cpx q_wr                 ; could land while an entry is being filled); q_wr first, so an NMI
  bne :+                   ; between the two sees q_rd ahead and leaves the queue alone
  ldx #0
  stx q_wr
  stx q_rd
: clc
  adc q_wr
  adc #3
  bcs @full
  cmp #128
  bcs @full
  pla
  ldx q_wr
  pha
  lda ptr2+1
  sta qbuf,x
  inx
  lda ptr2
  sta qbuf,x
  inx
  pla
  sta qbuf,x
  inx
  clc
  rts
@full:
  pla
  sec
  rts
q_close:
  stx q_wr
  rts

; ------------------------------------------------------------------ NMI
nmi:
  pha
  txa
  pha
  tya
  pha
  inc nmi_cnt
  lda busy
  beq :+
  jmp @snd
: bit PPUSTAT             ; (the IRQ leaves the address latch half-way)
  lda #0
  sta OAMADDR
  lda #>oam
  sta OAMDMA
  lda pal_dirty
  beq @nopal
  lda #0
  sta pal_dirty
  lda PPUSTAT
  lda #$3F
  sta PPUADDR
  lda #0
  sta PPUADDR
  ldx #0
: lda pal,x
  sta PPUDATA
  inx
  cpx #32
  bne :-
@nopal:
  ; the queue: runs of (addr hi, addr lo, length, tiles...); at most ~40 tiles a vblank
  lda #40
  sta qbud
@q:
  lda q_rd                 ; (only while behind: q_open resets q_wr before q_rd)
  cmp q_wr
  bcs @qempty
  lda qbud
  bmi @qdone
  tax
  ldx q_rd
  lda qbuf,x
  sta PPUADDR
  inx
  lda qbuf,x
  sta PPUADDR
  inx
  lda qbuf,x
  inx
  tay
  sta qlen
: lda qbuf,x
  sta PPUDATA
  inx
  dey
  bne :-
  stx q_rd
  lda qbud
  sec
  sbc qlen
  sta qbud
  jmp @q
@qempty:
@qdone:
  lda PPUSTAT
  lda #0
  sta PPUSCRL
  sta PPUSCRL
  lda ctrl
  sta PPUCTRL
  lda mask
  sta PPUMASK
  ; banks: the sprite pair picked for this frame, the fixed bank, the storm's first band
  lda sprbn
  sta sprb
  lda sprbn+1
  sta sprb+1
  lda sprbn+2
  sta sprb+2
  jsr set_fixed_banks
  lda epend                ; this frame's scroll list, if the main loop finished one
  bmi :+
  sta efront
  lda #$FF
  sta epend
: ldx efront
  stx iseq
  txa
  clc
  adc #NEV
  sta iend
  lda sky_bank
  sta $8001                ; band 0 (R0 is selected)
  lda #0
  sta ifx
  sta $E000
  lda #31                  ; the first entry is at line 32
  sta $C000
  sta $C001
  sta $E001
@snd:
  jsr sound_update
  pla
  tay
  pla
  tax
  pla
  rti

; ------------------------------------------------------------------ the scroll IRQ
BANK_DELAY = 5             ; busy-waits so the address, bank and fine X writes land in hblank

irq:                       ; The IRQ lands late on the line before the entry's line. t (the PPU's next
  sta ia                   ; address) and coarse X with the old fine X first; then in hblank: the address
  stx ix                   ; itself, the tile bank and the new fine X. So no line is drawn half old, half new.
  sty iy
  ldx iseq
  inc iseq
  bit PPUSTAT
  lda ev_hi,x
  sta PPUADDR
  lda ev_y,x
  sta PPUSCRL
  lda ev_x,x
  and #$F8
  ora ifx
  sta PPUSCRL
  sta $E000
  sta $E001
  lda ev_lat,x
  sta $C000
  sta $C001
  ldy #BANK_DELAY
: dey
  bne :-
  ldy ev_x,x
  lda ev_lo,x
  sta PPUADDR              ; hblank: v = t ...
  lda ev_bk,x
  sta $8001                ; ... the bank ...
  sty PPUSCRL              ; ... and the new fine X
  tya
  and #7
  sta ifx
  lda iseq
  cmp iend
  bne :+
  sta $E000                ; the last entry: no more IRQs this frame
: ldy iy
  ldx ix
  lda ia
  rti

; The parts of the scroll lists that never change: each entry's line, and lines to the next.
EV_LINE: .byte 32, 64, 96, 104, 112, 120, 128, 136, 144, 152, 160, 168, 176, 184, 192
EV_LATV: .byte 31, 31, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 0

init_lists:                ; both buffers (entries at 0 and at 16)
  ldy #0
@l:
  tya
  tax
  jsr @one
  tya
  clc
  adc #16
  tax
  jsr @one
  iny
  cpy #NEV
  bne @l
  lda #0
  sta efront
  rts
@one:
  lda EV_LINE,y
  sta ev_y,x
  and #$38
  asl a
  asl a
  sta ev_lo,x
  lda EV_LATV,y
  sta ev_lat,x
  lda #0
  sta ev_hi,x
  sta ev_x,x
  lda #CAB_BANK
  sta ev_bk,x
  rts

INIT_PAL:
  .byte $0F,$00,$10,$30, $0F,$00,$10,$30, $0F,$00,$10,$30, $0F,$00,$10,$30
  .byte $0F,$0F,$00,$30, $0F,$00,$10,$30, $0F,$10,$10,$30, $0F,$10,$30,$30

.include "game.s"
.include "draw.s"
.include "screens.s"
.include "sound.s"
.include "tables.s"
.include "data.inc"
.include "music.inc"

.segment "STUB"
stub:                      ; in the fixed last bank: set up the MMC3 before anything else
  sei
  cld
  ldx #$FF
  txs
  lda #6
  sta $8000
  lda #0
  sta $8001
  lda #7
  sta $8000
  lda #1
  sta $8001
  lda #0
  sta $A000                ; vertical mirroring (two nametables side by side)
  sta $E000
  jmp reset

.segment "VECTORS"
  .word nmi, stub, irq

.segment "CHARS"
  .incbin "chr.bin"
