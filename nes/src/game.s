; ---------------------------------------------------------------------------- the game
; Units: metres in 8.8 fixed point (1/256 m) across (x) and ahead of your eyes (z); speeds in 1/256 m a frame.

K_ROBOT = 1
K_CREW = 2
K_CAR = 3
K_DRIFT = 4
K_BURIED = 5
K_WALKER = 6
K_JACK = 7
K_SPIN = 8
K_TIRE = 9
K_LEAPER = 10

F_FLIP = $01
F_HAZ = $02
F_DARK = $04
F_SEEN = $08
F_PLOW = $10
F_DODGE = $20
F_RAN = $40
F_MISS = $80

X_MAX = 1152               ; 4.5 m
STEER_V = 34               ; 8 m/s
SPAWN_D = 96

; ---- helpers
; A = signed byte -> sign-extend into A (high) via X? Use: lda v / jsr sext -> A = $00 or $FF
sext:
  bpl :+
  lda #$FF
  rts
: lda #0
  rts

rnd_range:                 ; A = a random number below A (A > 0)
  sta rr
  jsr rand
  ldy rr
  jsr qmul
  rts                      ; A = high byte of rand * n

; ---- starting out
start_game:
  lda #1
  sta state
  lda #0
  sta paused
  sta pxl
  sta pxh
  sta vx
  sta vxf
  sta horncool
  sta shake
  sta flash
  sta deadt
  sta runf
  sta runs
  sta runs+1
  sta diff
  sta spawned
  sta meters
  sta meters+1
  sta mfrac
  sta ms_i
  sta wh_t
  ldx #NOBJ-1
: sta o_k,x
  dex
  bpl :-
  lda #60                  ; the first thing turns up 60 m on
  sta nxth
  lda #0
  sta nxtl
  lda spd
  cmp #43                  ; at least 10 m/s
  bcs :+
  lda #43
  sta spd
: lda #<LEXP0
  sta lexp
  lda #>LEXP0
  sta lexp+1
  lda #^LEXP0
  sta lexp+2
  lda #.hibyte(.hiword(LEXP0))
  sta lexp+3
  lda #R1_GAME
  sta r1val
  jsr restore_screen
  jsr hud_static
  jsr sound_start_run
  rts

LEXP0 = 48704840           ; log10(800) in 8.24

; ---- the road under you: distance, the bends, the paint and the storm going by
advance:                   ; A = how far this frame (1/256 m)
  sta t0
  clc
  adc s0
  sta s0
  bcc :+
  inc s1
  bne :+
  inc s2
: lda t0                   ; paint: 65536 per 12 m -> 21.33 per 1/256 m
  ldy #21
  jsr qmul
  sta t1
  lda qlo
  clc
  adc dpos
  sta dpos
  lda t1
  adc dpos+1
  sta dpos+1
  lda t0
  ldy #85                  ; + 1/3
  jsr qmul
  clc
  adc dpos
  sta dpos
  bcc :+
  inc dpos+1
: lda t0                   ; storm: 65536 per 51.2 m -> 5 per 1/256 m
  sta t1
  lda #0
  sta t2
  asl t1
  rol t2
  asl t1
  rol t2
  lda t1
  clc
  adc t0
  sta t1
  bcc :+
  inc t2
: lda t1
  clc
  adc spos
  sta spos
  lda t2
  adc spos+1
  sta spos+1
  ; the bends' phases: K * 40.74 * 256 per 1/256 m
  ldx #0
@ph:
  lda t0
  ldy PH_RATE,x
  jsr qmul
  sta t1
  txa
  sta t2
  asl a
  adc t2
  tay
  lda qlo
  clc
  adc ph0,y
  sta ph0,y
  lda t1
  adc ph0+1,y
  sta ph0+1,y
  bcc :+
  lda ph0+2,y
  adc #0
  sta ph0+2,y
: inx
  cpx #3
  bne @ph
  ; the bend: c = -(14 K0^2 sin + 6 K1^2 sin + 3 K9^2 sin), as curv = c * 80 * 128
  ; amplitudes (x 80 x 128): 5.16, 10.4, 13.5
  lda #0
  sta t3
  ldx #0
@cv:
  txa
  sta t2
  asl a
  adc t2
  tay
  lda ph0+2,y              ; the top byte: 256 a turn
  tay
  lda SIN,y                ; signed, 127 = 1
  php
  bpl :+
  eor #$FF
  clc
  adc #1
: ldy CV_AMP,x
  jsr qmul                 ; |sin| * amp(x 2) / 256
  plp
  bpl :+
  eor #$FF
  clc
  adc #1
: clc
  adc t3
  sta t3
  inx
  cpx #3
  bne @cv
  lda t3
  eor #$FF                 ; c is minus the sum
  clc
  adc #1
  sta curv
  ; the storm's frame and the road's banks
  lda spos+1
  lsr a
  lsr a
  lsr a
  lsr a                    ; 0..15
  sta t1
  asl a
  adc t1
  tax
  lda SKYB,x
  sta sky_bank
  rts

PH_RATE: .byte 63, 136, 219        ; K0, K1, K9 * 40.74 * 256 / 256
CV_AMP: .byte 10, 21, 27           ; 2 x 5.16, 10.4, 13.5 (curv = sum |sin| * amp / 256 * 127 / 63.5)

; ---- the run, a frame
game_update:
  ; time
  inc runf
  lda runf
  cmp #60
  bcc :+
  lda #0
  sta runf
  inc runs
  bne :+
  inc runs+1
: lda runs+1               ; diff = runs * 256 / 180, at most 255
  bne @dmax
  lda runs
  cmp #180
  bcs @dmax
  ldy #182
  jsr qmul
  asl qlo
  rol a
  sta diff
  jmp @ddone
@dmax:
  lda #255
  sta diff
@ddone:
  jsr timers
  ; speed: towards 15 + 11 (1 - exp(-t / 150)) m/s
  lda runs+1
  bne :+
  lda runs
  lsr a
  lsr a
  lsr a
  cmp #63
  bcc :++
: lda #63
: tax
  lda RIDE,x
  jsr ease_speed
  ; steering
  lda #0
  sta t0                   ; target speed across
  lda pad
  and #BTN_LEFT
  beq :+
  lda #<-STEER_V
  sta t0
: lda pad
  and #BTN_RIGHT
  beq :+
  lda #STEER_V
  sta t0
: jsr steer
  ; the horn
  lda padn
  and #BTN_UP|BTN_A|BTN_B
  beq :+
  jsr horn
: lda spd
  jsr advance
  lda spd
  jsr count_metres
  jsr move_things
  jsr hits
  jsr spawn_more
  jsr cull
  rts

timers:
  ldx #horncool
  jsr dec0
  ldx #honk
  jsr dec0
  ldx #scrape
  jsr dec0
  lda shake
  beq :+
  sec
  sbc #4
  bcs :+
  lda #0
: sta shake
  lda flash
  beq :+
  sec
  sbc #8
  bcs :+
  lda #0
: sta flash
  lda load
  cmp #90
  bcc :+
  sbc #1
  sta load
: rts
dec0:
  lda 0,x
  beq :+
  dec 0,x
: rts

ease_speed:                ; A = target speed; spd += (target - spd) / 64
  sta t0
  lda #0
  sta t1
  lda t0
  sec
  sbc spd
  sta t2                   ; signed difference (whole units)
  ; (target - spd) * 4 into the fraction
  ldx #0
  lda t2
  bpl :+
  dex
: stx t3
  asl a
  rol t3
  asl a
  rol t3
  clc
  adc spdf
  sta spdf
  lda t3
  adc spd
  sta spd
  rts

RIDE:                      ; 15 + 11 (1 - exp(-t/150)) m/s at t = 8i s, in 1/256 m a frame
  .byte 64,66,69,71,73,75,77,79,80,82,83,85,86,87,89,90
  .byte 91,92,93,94,95,96,96,97,98,99,99,100,100,101,101,102
  .byte 102,103,103,104,104,104,105,105,105,106,106,106,106,107,107,107
  .byte 107,107,108,108,108,108,108,108,109,109,109,109,109,109,109,109

steer:                     ; t0 = target speed across; vx += (t0 - vx) / 8; px += vx
  lda t0
  sec
  sbc vx
  sta t2
  ldx #0
  lda t2
  bpl :+
  dex
: stx t3
  ; / 8 as 8.8: shift left 5 into the fraction
  lda t2
  ldy #5
: asl a
  rol t3
  dey
  bne :-
  clc
  adc vxf
  sta vxf
  lda t3
  adc vx
  sta vx
  ; px += vx
  lda vx
  jsr sext
  sta t1
  lda vx
  clc
  adc pxl
  sta pxl
  lda t1
  adc pxh
  sta pxh
  ; into the bank: it shoves you back
  lda pxh
  bmi @neg
  lda pxl
  cmp #<X_MAX
  lda pxh
  sbc #>X_MAX
  bcc @ok
  lda #<X_MAX
  sta pxl
  lda #>X_MAX
  sta pxh
  lda vx
  bmi @ok
  jmp @bank
@neg:
  lda pxl
  cmp #<(-X_MAX)
  lda pxh
  sbc #>(-X_MAX)
  bcs @ok
  lda #<(-X_MAX)
  sta pxl
  lda #>(-X_MAX)
  sta pxh
  lda vx
  bpl @ok
@bank:
  lda vx
  beq @ok
  lda scrape
  bne :+
  jsr sfx_scrape
: lda #20
  sta scrape
  lda #0
  sta vx
  sta vxf
  lda #200
  sta load
  lda shake
  cmp #60
  bcs @ok
  lda #60
  sta shake
@ok:
  rts

count_metres:              ; A = how far; whole metres plowed for the HUD and the exit
  clc
  adc mfrac
  sta mfrac
  bcc @r
  inc meters
  bne :+
  inc meters+1
: lda lexp                 ; one metre nearer: log10 drops 0.00100343 (x 2^24 = 16835)
  sec
  sbc #<16835
  sta lexp
  lda lexp+1
  sbc #>16835
  sta lexp+1
  lda lexp+2
  sbc #0
  sta lexp+2
  lda lexp+3
  sbc #0
  sta lexp+3
  lda #1
  sta wh_up
  ; milestones
  ldx ms_i
  cpx #10
  bcs @r
  txa
  asl a
  tax
  lda meters+1
  cmp MS_AT+1,x
  bcc @r
  bne :+
  lda meters
  cmp MS_AT,x
  bcc @r
: lda MS_STR,x
  sta ptr
  lda MS_STR+1,x
  sta ptr+1
  jsr whisper
  inc ms_i
  jsr sfx_chime
@r:
  rts

; ---- the horn: robots in your way hop aside, walkers run (crews hold their line)
horn:
  lda horncool
  beq :+
  rts
: lda #96
  sta horncool
  lda #42
  sta honk
  jsr sfx_horn
  ldx #NOBJ-1
@l:
  lda o_k,x
  cmp #K_ROBOT
  beq @robot
  cmp #K_WALKER
  beq @walker
@next:
  dex
  bpl @l
  rts
@walker:
  lda o_f,x
  and #F_RAN
  bne @next
  jsr ahead_ok
  bcc @next
  lda o_f,x
  ora #F_RAN
  sta o_f,x
  lda o_vx,x               ; x 2.5
  asl a
  clc
  adc o_vx,x
  sta o_vx,x
  jmp @next
@robot:
  lda o_f,x
  and #F_DODGE
  bne @next
  jsr ahead_ok
  bcc @next
  ; within 3.4 m across of you?
  jsr dx_obj               ; t0:t1 = o_x - px (8.8)
  lda t1
  bpl :+
  lda t0
  eor #$FF
  clc
  adc #1
  sta t2
  lda t1
  eor #$FF
  adc #0
  sta t3
  jmp :++
: lda t0
  sta t2
  lda t1
  sta t3
: lda t3                   ; |dx| > 3.4 m?
  cmp #3
  bcc :+
  bne @next
  lda t2
  cmp #102
  bcs @next
: ; hop 2.9 m away from you (the side it's on), staying on the road
  lda o_xh,x
  sta o_b,x                ; from (whole metres, signed)
  lda t1
  bmi @left
  lda o_xh,x
  clc
  adc #3
  cmp #8
  bmi :+
  lda #7
: jmp @set
@left:
  lda o_xh,x
  sec
  sbc #3
  cmp #<-7
  bpl :+
  lda #<-8
: 
@set:
  sta o_a,x                ; to
  lda #0
  sta o_t,x                ; progress
  lda o_f,x
  ora #F_DODGE
  sta o_f,x
  jsr sfx_servo
  jmp @next

ahead_ok:                  ; C set if 3 m < o_z < 45 m
  lda o_zh,x
  bmi :+
  cmp #3
  bcc :+
  cmp #45
  bcs :+
  sec
  rts
: clc
  rts

dx_obj:                    ; t0:t1 = o_x - px
  lda o_xl,x
  sec
  sbc pxl
  sta t0
  lda o_xh,x
  sbc pxh
  sta t1
  rts

; ---- everything on the road moves on
move_things:
  ldx #NOBJ-1
@l:
  lda o_k,x
  bne :+
  jmp @next
: stx oi
  ; z -= how far you went, + its own speed
  lda o_vz,x
  jsr sext
  sta t1
  lda o_vz,x
  sec
  sbc spd
  sta t0
  lda t1
  sbc #0
  sta t1
  lda o_zl,x
  clc
  adc t0
  sta o_zl,x
  lda o_zh,x
  adc t1
  sta o_zh,x
  lda o_vx,x
  jsr sext
  sta t1
  lda o_vx,x
  clc
  adc o_xl,x
  sta o_xl,x
  lda o_xh,x
  adc t1
  sta o_xh,x
  ; first sight: the hint
  lda o_f,x
  and #F_SEEN
  bne :+
  lda o_zh,x
  cmp #50
  bcs :+
  lda o_f,x
  ora #F_SEEN
  sta o_f,x
  jsr first_sight
: lda o_k,x
  tay
  lda MOVE_LO-1,y
  sta ptr
  lda MOVE_HI-1,y
  sta ptr+1
  stx oi
  jsr @call
  ldx oi
@next:
  dex
  bmi :+
  jmp @l
: rts
@call:
  jmp (ptr)

MOVE_LO: .byte <mv_robot, <mv_none, <mv_car, <mv_drift, <mv_none, <mv_walker, <mv_none, <mv_spin, <mv_tire, <mv_leaper
MOVE_HI: .byte >mv_robot, >mv_none, >mv_car, >mv_drift, >mv_none, >mv_walker, >mv_none, >mv_spin, >mv_tire, >mv_leaper

mv_none:
  inc o_t,x
  rts

mv_robot:                  ; digging; or hopping aside from the horn
  lda o_f,x
  and #F_DODGE
  bne :+
  inc o_t,x                ; the stroke
  rts
: lda o_t,x
  clc
  adc #8
  bcc :+
  lda #255
: sta o_t,x
  tay
  lda SMOOTH,y
  sta t0
  lda o_a,x                ; x = from + (to - from) * smooth(u)
  sec
  sbc o_b,x                ; whole metres, signed
  sta t3
  bpl :+
  eor #$FF
  clc
  adc #1
: ldy t0
  jsr qmul
  sta t1
  lda qlo
  sta t0
  lda t3
  bpl @pos
  lda #0
  sec
  sbc t0
  sta o_xl,x
  lda o_b,x
  sbc t1
  sta o_xh,x
  jmp @hop
@pos:
  lda t0
  sta o_xl,x
  lda o_b,x
  clc
  adc t1
  sta o_xh,x
@hop:
  ldy o_t,x
  lda HOP,y                ; 0.45 m * sin(pi u), 1/16 m
  sta o_y,x
  cpy #255
  bne :+
  lda o_f,x
  and #<~F_DODGE
  sta o_f,x
  lda #0
  sta o_y,x
: rts

mv_walker:
  inc o_t,x
  lda o_t,x
  and #15
  bne :+
  lda o_f,x                ; the stride: flip frames
  eor #$10
  sta o_f,x
: rts

mv_car:                    ; changing lanes when it's time; stopping short of what's stuck across the road
  inc o_t,x
  lda o_t,x
  cmp o_b,x                ; when to change lanes (0 = never)
  bne :+
  lda o_b,x
  beq :+
  jsr rand
  and #3
  tay
  lda LANES3,y
  sta o_a,x
: ; vx towards the target lane, at most 1.6 m/s (7)
  lda o_a,x
  sec
  sbc o_xh,x
  beq @hold
  bmi @l
  lda #7
  bne @v
@l:
  lda #<-7
@v:
  sta o_vx,x
  jmp @blink
@hold:
  lda #0
  sta o_vx,x
@blink:
  jsr stuck_ahead
  rts

LANES3: .byte <-4, 0, 3, 0             ; lanes at -3.6, 0, 3.6 (whole metres, rounded towards the middle)

stuck_ahead:               ; a car doesn't drive into a jackknifed semi or a buried car in its way
  ldy #NOBJ-1
@l:
  lda o_k,y
  cmp #K_JACK
  beq @j
  cmp #K_BURIED
  bne @n
  lda o_xh,y
  sec
  sbc o_xh,x
  bpl :+
  eor #$FF
  clc
  adc #1
: cmp #3
  bcs @n
  lda #6
  bne @gap
@j:
  lda #12
@gap:
  sta t0
  ; behind it within the gap: hold there
  lda o_zh,y
  sec
  sbc o_zh,x
  bmi @n
  cmp t0
  bcs @n
  lda o_zh,y
  sec
  sbc t0
  sta o_zh,x
  lda #0
  sta o_vz,x
@n:
  dey
  bpl @l
  rts

mv_spin:                   ; sliding across, turning
  lda o_t,x
  clc
  adc o_a,x                ; spin rate
  sta o_t,x
  ; off the road's edge: it stops sliding
  lda o_xh,x
  bpl :+
  cmp #<-6
  bpl @r
  lda #0
  sta o_vx,x
  rts
: cmp #6
  bmi @r
  lda #0
  sta o_vx,x
@r:
  rts

mv_tire:                   ; bouncing towards you
  inc o_t,x
  lda o_t,x
  clc
  adc o_a,x                ; its phase
  asl a
  tay
  lda BOUNCE,y             ; 0.37 + 0.7 |sin|, 1/16 m (to the bottom of it)
  sta o_y,x
  rts

mv_drift:                  ; plowed: slides off to the side and sinks
  lda o_f,x
  and #F_PLOW
  beq :+
  inc o_t,x
  lda o_t,x
  cmp #24
  bcc :+
  lda #0
  sta o_k,x
: rts

mv_leaper:                 ; on the bank till you're near, then right across the road
  lda o_t,x
  bne @go
  lda spd                  ; goes when it's within 1.35 s of you (at least 12 m/s): z < spd * 81 / 256 ... in m: spd*60*1.35/256
  ldy #81
  jsr qmul
  cmp #16
  bcs :+
  lda #16
: ldx oi
  cmp o_zh,x
  bcc @r
  lda #1
  sta o_t,x
  jsr sfx_leap
  ldx oi
@r:
  rts
@go:
  lda o_t,x
  cmp #255
  beq @r
  clc
  adc #3                   ; 1.3 s across
  bcc :+
  lda #255
: sta o_t,x
  tay
  lda SMOOTH,y
  sta t0
  ; x = x0 + (x1 - x0) * smooth(u): x0 = side * 8.2 m, 16.4 m across
  lda t0
  ldy #66                  ; 16.4 m in 1/4 m
  jsr qmul                 ; A = 1/4 m
  ldx oi
  sta t0
  lda #0
  sta t1
  asl t0
  rol t1
  asl t0
  rol t1
  asl t0
  rol t1
  asl t0
  rol t1
  asl t0
  rol t1
  asl t0
  rol t1                   ; t0:t1 in 1/256 m
  lda o_f,x
  and #F_FLIP
  beq @fromleft
  ; from the right: x = 8.2 - d
  lda #<(8*256+51)
  sec
  sbc t0
  sta o_xl,x
  lda #>(8*256+51)
  sbc t1
  sta o_xh,x
  jmp @arc
@fromleft:
  lda #<(-(8*256+51))
  clc
  adc t0
  sta o_xl,x
  lda #>(-(8*256+51))
  adc t1
  sta o_xh,x
@arc:
  ldy o_t,x
  lda LEAP,y               ; 3.4 m * 4u(1-u) + the bank, 1/16 m
  sta o_y,x
  rts

; ---- what's hit
; The truck: the blade 1.9 m either side of its middle at 2.3-2.7 m ahead of your eyes, the cab behind.
hits:
  ldx #NOBJ-1
@l:
  lda o_k,x
  bne :+
  jmp @next
: cmp #K_JACK
  bne :+
  jsr hit_jack
  jmp @next
: ; in reach along the road? -2.2 - hd < z < 2.7 + hd (hd = w: things are about as deep as wide, cars deeper)
  lda o_k,x
  tay
  lda KIND_HD-1,y          ; half depth, 1/16 m
  sta t4
  ; zq = o_z in 1/16 m (signed, clamped)
  jsr z16
  sta t5                   ; signed 1/16 m, clamped to +-127
  ; z - hd < 43 (2.7 m)?
  lda t5
  sec
  sbc t4
  bvs @next
  cmp #43
  bpl @next
  ; z + hd > -35 (-2.2 m)?
  lda t5
  clc
  adc t4
  bvs :+
  cmp #<-35
  bmi @past
: ; across: |dx| - w - 1.8 m (1/16 m)
  jsr gap_x                ; A = gap in 1/16 m, signed-clamped
  sta t0
  lda o_k,x
  cmp #K_DRIFT
  bne :+
  jsr drift_hit
  jmp @next
: cmp #K_LEAPER
  bne :+
  lda o_t,x                ; only while it's in the air and low enough to hit
  beq @next
  lda o_y,x
  cmp #46
  bcs @next
: lda t0
  bmi @hit
  cmp #2                   ; HIT_R 0.1 m
  bcc @hit
  cmp o_md,x
  bcs @next
  sta o_md,x
  jmp @next
@past:                     ; behind you now: was it a near miss?
  lda o_f,x
  bmi @next
  ora #F_MISS
  sta o_f,x
  lda o_k,x
  cmp #K_DRIFT
  beq @next
  lda o_md,x
  cmp #18                  ; 1.1 m
  bcs @next
  jsr sfx_whoosh
  lda shake
  cmp #40
  bcs @next
  lda #40
  sta shake
@next:
  dex
  bmi :+
  jmp @l
: rts
@hit:
  lda o_k,x
  jmp die

drift_hit:                 ; plowing through it
  lda o_f,x
  and #F_PLOW
  bne :+
  lda t0
  bpl :+
  lda o_f,x
  ora #F_PLOW
  sta o_f,x
  lda #0
  sta o_t,x
  lda #15
  sta o_vx,x
  lda #255
  sta load
  lda #110
  sta shake
  jsr sfx_plow
: rts

z16:                       ; A = o_z in 1/16 m, clamped to -128..127
  lda o_zh,x
  bmi @neg
  cmp #8
  bcs @max
  lda o_zl,x
  sta t2
  lda o_zh,x
  asl t2
  rol a
  asl t2
  rol a
  asl t2
  rol a
  asl t2
  rol a
  rts
@max:
  lda #127
  rts
@neg:
  cmp #<-8
  bcc @min
  lda o_zl,x
  sta t2
  lda o_zh,x
  asl t2
  rol a
  asl t2
  rol a
  asl t2
  rol a
  asl t2
  rol a
  rts
@min:
  lda #<-128
  rts

gap_x:                     ; A = |o_x - px| - w - 1.8 m, in 1/16 m, clamped to -128..127
  jsr dx_obj
  lda t1
  bpl :+
  lda t0
  eor #$FF
  clc
  adc #1
  sta t0
  lda t1
  eor #$FF
  adc #0
  sta t1
: lda t1
  cmp #8
  bcc :+
  lda #127
  rts
: lda t0
  asl a
  rol t1
  asl a
  rol t1
  asl a
  rol t1
  asl a
  rol t1                   ; t1 = |dx| in 1/16 m (0..127)
  lda t1
  sec
  sbc o_w,x
  sec
  sbc #29                  ; the blade, 1.8 m either side
  rts

; The jackknifed semi: its trailer from (x, z) (the end in the road) to the far side, slope o_a (dx/dz x 128, signed by side).
hit_jack:
  ; where across is the trailer at the blade (2.6 m ahead) and at your eyes?
  lda #42                  ; 2.6 m in 1/16 m
  jsr jack_at
  bcs @hit
  lda #0
  jsr jack_at
  bcs @hit
  rts
@hit:
  lda #K_JACK
  jmp die

jack_at:                   ; A = depth (1/16 m) -> C set if the trailer (1.35 m thick) is on the truck there
  sta t3
  jsr z16
  sta t5
  ; d = depth - z (how far along the trailer, 1/16 m)
  lda t3
  sec
  sbc t5
  bvs @no
  bmi @cap                 ; short of its end: only the end cap counts
  cmp #<174                ; past its far end (10.9 m)?
  bcs @no
  ; x = x0 + d * slope / 128 (1/16 m)
  ldy o_a,x
  jsr qmul                 ; d * slope / 256, A whole (1/16 m) x 2
  asl qlo
  rol a
  sta t4
  jmp @x
@cap:
  cmp #<-22
  bcc @no
  lda #0
  sta t4
@x:
  ; trailer x (1/16 m) = o_x * 16 +- t4 (towards its side)
  jsr dx_obj
  lda t0
  asl a
  rol t1
  asl a
  rol t1
  asl a
  rol t1
  asl a
  rol t1
  lda o_f,x
  and #F_FLIP
  bne @left
  lda t1
  clc
  adc t4
  jmp @abs
@left:
  lda t1
  sec
  sbc t4
@abs:
  bvs @no
  bpl :+
  eor #$FF
  clc
  adc #1
: cmp #51                  ; 1.35 + 1.8 m
  bcs @no
  sec
  rts
@no:
  clc
  rts

; ---- crashing
die:                       ; A = kind
  sta dkind
  lda #2
  sta state
  lda #0
  sta deadt
  sta vx
  lda #255
  sta shake
  sta flash
  jsr sfx_crash
  rts

dying_update:
  inc deadt
  jsr timers
  lda spd                  ; it stops dead, bounces back a little
  lsr a
  sta spd
  lda deadt
  cmp #78                  ; 1.3 s
  bcc :+
  jmp go_over
: rts

; ---- things turning up
spawn_more:
  ; the next pattern is nxt m ahead (and comes nearer)
  lda nxtl
  sec
  sbc spd
  sta nxtl
  lda nxth
  sbc #0
  sta nxth
  cmp #SPAWN_D
  bcs :+
  jsr spawn
: rts

cull:                      ; gone behind you, or far off the road
  ldx #NOBJ-1
@l:
  lda o_k,x
  beq @n
  lda o_zh,x
  bpl :+
  cmp #<-8
  bcs :+
  lda #0
  sta o_k,x
: lda o_xh,x
  bpl :+
  eor #$FF
: cmp #20
  bcc @n
  lda #0
  sta o_k,x
@n:
  dex
  bpl @l
  rts

first_sight:               ; the first time a kind turns up: a word about it
  lda o_k,x
  sec
  sbc #1
  tay
  cpy #8
  bcc :+
  lda hinted+1
  and BIT8-8,y
  bne @r
  lda hinted+1
  ora BIT8-8,y
  sta hinted+1
  jmp @say
: lda hinted
  and BIT8,y
  bne @r
  lda hinted
  ora BIT8,y
  sta hinted
@say:
  tya
  asl a
  tay
  lda HINT_STR,y
  sta ptr
  lda HINT_STR+1,y
  sta ptr+1
  jsr whisper
@r:
  ldx oi
  rts
BIT8: .byte 1, 2, 4, 8, 16, 32, 64, 128

free_slot:                 ; -> X = an empty slot, C set if there is one
  ldx #NOBJ-1
: lda o_k,x
  beq :+
  dex
  bpl :-
  clc
  rts
: sec
  rts

; new thing: A = kind, t0:t1 = z (8.8, m), t2:t3 = x (8.8, signed m). -> X = its slot (C clear if no room)
new_thing:
  pha
  jsr free_slot
  pla
  bcc @r
  sta o_k,x
  lda t0
  sta o_zl,x
  lda t1
  sta o_zh,x
  lda t2
  sta o_xl,x
  lda t3
  sta o_xh,x
  lda #0
  sta o_vx,x
  sta o_vz,x
  sta o_t,x
  sta o_a,x
  sta o_b,x
  sta o_f,x
  sta o_y,x
  lda #$7F
  sta o_md,x
  ldy o_k,x
  lda KIND_W-1,y
  sta o_w,x
  sec
@r:
  rts

KIND_W:  .byte 8, 8, 15, 22, 16, 7, 22, 22, 6, 7     ; half width, 1/16 m
KIND_HD: .byte 10, 10, 35, 18, 34, 6, 0, 22, 6, 6    ; half depth, 1/16 m

; x across a lane near A (whole metres, signed): +- 0.8 m, kept within 4.5 m -> t2:t3
in_lane:                   ; A = a lane's whole metres -> t2:t3 = somewhere within a metre of it, on the road
  sta t3
  jsr rand
  sec
  sbc #128
  php
  asl a
  sta t2
  plp
  bpl :+
  dec t3
: lda t3
  bmi :+
  cmp #4
  bcc @r
  lda #4
  sta t3
  lda #0
  sta t2
  rts
: cmp #<-4
  bcs @r
  lda #<-5
  sta t3
  lda #$80
  sta t2
@r:
  rts

lane_of_you:               ; A = your lane's whole metres
  lda pxh
  rts

rand_lane:                 ; A = -4, 0 or 3 (lane middles -3.6, 0, 3.6)
  jsr rand
  and #3
  cmp #3
  bne :+
  lda #1
: tay
  lda LANES3,y
  rts

spawn:
  ; where: nxt m ahead
  lda nxtl
  sta t0
  lda nxth
  sta t1
  ; which: the first few in order, then at random
  ldx spawned
  cpx #10
  bcs :+
  lda FIRST,x
  jmp @go
: jsr rand
  ldx #0
: cmp ANY_P,x
  bcc :+
  inx
  bne :-
: lda ANY_K,x
@go:
  sta lastk
  inc spawned
  tay
  lda PAT_LO-1,y
  sta ptr
  lda PAT_HI-1,y
  sta ptr+1
  lda #12
  sta t4                   ; how deep it is (m), set by the pattern
  jsr @call
  ; the gap to the next: depth + max(22, v (1.4 - 0.5 d) + rand v (1.1 - 0.4 d))  (v at least 15 m/s)
  lda spd
  cmp #64
  bcs :+
  lda #64
: ldy #60
  jsr qmul
  sta t5                   ; v, m/s
  lda diff
  lsr a
  lsr a
  lsr a
  sta t0
  lda #90                  ; (1.4 - 0.5 d) x 64
  sec
  sbc t0
  ldy t5
  jsr qmul
  asl qlo
  rol a
  asl qlo
  rol a
  sta t1
  jsr rand
  ldy t5
  jsr qmul
  sta t2                   ; rand v
  lda #70                  ; (1.1 - 0.4 d) x 64
  sec
  sbc t0
  ldy t2
  jsr qmul
  asl qlo
  rol a
  asl qlo
  rol a
  clc
  adc t1
  cmp #22
  bcs :+
  lda #22
: clc
  adc t4
  clc
  adc nxth
  sta nxth
  rts
@call:
  jmp (ptr)

FIRST: .byte K_DRIFT, K_ROBOT, K_CAR, K_CREW, K_BURIED, K_WALKER, K_JACK, K_SPIN, K_TIRE, K_LEAPER
ANY_P: .byte 44, 69, 110, 136, 161, 179, 197, 218, 236, 255
ANY_K: .byte K_ROBOT, K_CREW, K_CAR, K_BURIED, K_WALKER, K_JACK, K_SPIN, K_TIRE, K_LEAPER, K_DRIFT
PAT_LO: .byte <p_robot, <p_crew, <p_car, <p_drift, <p_buried, <p_walker, <p_jack, <p_spin, <p_tire, <p_leaper
PAT_HI: .byte >p_robot, >p_crew, >p_car, >p_drift, >p_buried, >p_walker, >p_jack, >p_spin, >p_tire, >p_leaper

robot_at:                  ; t0:t1 z, t2:t3 x -> a robot digging, side-on or facing you ($40)
  lda #K_ROBOT
  jsr new_thing
  bcc :+
  jsr rand
  and #F_FLIP|$40
  sta o_f,x
  jsr rand
  sta o_t,x                ; where in its stroke
: rts

p_robot:
  jsr lane_of_you
  jsr in_lane
  jsr robot_at
  lda diff
  cmp #77
  bcc @r
  jsr rand
  cmp #154
  bcs @r
  ; another one on, 5-9 m
  lda #4
  jsr rnd_range
  clc
  adc #5
  adc t1
  sta t1
  jsr rand_lane
  jsr in_lane
  jsr robot_at
  lda #9
  sta t4
@r:
  rts

p_crew:                    ; a line right across the road, one gap; facing you, holding still
  lda #8
  jsr rnd_range            ; the gap: -4..3 m
  sec
  sbc #4
  sta t5
  lda #<-7                 ; from -6.6 m
  sta t3
  lda #120
  sta t2
@l:
  ; skip within 3.7 - 0.4 d of the gap (whole metres: 3 or 4 -> 3)
  lda t3
  sec
  sbc t5
  bpl :+
  eor #$FF
  clc
  adc #1
: cmp #3
  bcc @skip
  lda #K_CREW
  jsr new_thing
  bcc @skip
  lda #$40
  sta o_f,x                ; facing you
@skip:
  ; on 1.5-1.9 m
  lda #102
  jsr rnd_range
  clc
  adc #128
  adc t2
  sta t2
  lda t3
  adc #1
  sta t3
  cmp #7
  bmi @l
  lda #3
  sta t4
  rts

car_at:
  lda #K_CAR
  jsr new_thing
  bcc @r
  lda #24
  jsr rnd_range
  clc
  adc #21                  ; 5-10 m/s
  sta o_vz,x
  lda o_xh,x
  sta o_a,x                ; its lane
  jsr rand
  cmp #179
  bcs :+
  lda o_f,x
  ora #F_HAZ
  sta o_f,x
: jsr rand
  and #F_DARK
  ora o_f,x
  sta o_f,x
  jsr rand                 ; half of them change lanes, 1-7 s on
  bmi @r
  and #$7F
  ora #$40
  sta o_b,x
@r:
  rts

p_car:
  jsr rand_lane
  sta t3
  lda #0
  sta t2
  jsr car_at
  lda diff
  cmp #102
  bcc @r
  jsr rand
  cmp #154
  bcs @r
  lda #6
  jsr rnd_range
  clc
  adc #8
  adc t1
  sta t1
  jsr rand_lane
  sta t3
  jsr car_at
  lda #14
  sta t4
@r:
  rts

p_buried:                  ; one, or two side by side leaving an outside lane clear
  jsr rand_lane
  sta t5                   ; the clear lane
  ldy #0
@l:
  lda LANES3,y
  cmp t5
  beq @n
  sta t3
  lda t5                   ; lie a little away from the clear lane
  cmp t3
  bmi :+
  dec t3
  jmp :++
: inc t3
: lda #0
  sta t2
  sty t4
  lda #K_BURIED
  jsr new_thing
  ldy t4
  lda t1
  clc
  adc #6
  sta t1
@n:
  iny
  cpy #3
  bne @l
  lda #12
  sta t4
  rts

p_walker:
  jsr rand
  sta t5
  lda #K_WALKER
  jsr new_thing
  bcc @r
  ; from a bank across: dir and start
  lda t5
  bmi @fromright
  lda #<-8
  sta o_xh,x
  lda #6
  sta o_vx,x
  lda o_f,x
  ora #F_FLIP
  sta o_f,x
  jmp @r
@fromright:
  lda #7
  sta o_xh,x
  lda #<-6
  sta o_vx,x
@r:
  lda #8
  sta t4
  rts

p_jack:                    ; across the road from beyond one bank to within a gap of the other
  lda #K_JACK
  jsr new_thing
  bcc @r
  jsr rand
  and #F_FLIP
  sta o_f,x
  ; the end in the road: 0.2 m from the middle on the blocked side; the slope ~0.85
  lda #0
  sta o_xl,x
  sta o_xh,x
  lda #109                 ; dx/dz x 128
  sta o_a,x
  lda #22
  sta o_w,x
@r:
  lda #14
  sta t4
  rts

p_spin:
  lda #K_SPIN
  jsr new_thing
  bcc @r
  jsr rand_lane
  sta o_xh,x
  lda #12
  jsr rnd_range
  clc
  adc #13                  ; 3-6 m/s
  sta o_vz,x
  lda o_xh,x               ; sliding towards the middle
  bmi :+
  lda #<-4
  bne :++
: lda #4
: sta o_vx,x
  jsr rand
  and #3
  clc
  adc #3
  sta o_a,x                ; spin rate
  jsr rand
  sta o_t,x
@r:
  rts

p_tire:
  jsr lane_of_you
  jsr in_lane
  lda #K_TIRE
  jsr new_thing
  bcc @r
  lda #16
  jsr rnd_range
  eor #$FF
  sec
  sbc #16                  ; -4..-8 m/s
  sta o_vz,x
  jsr rand
  sta o_a,x
@r:
  lda #10
  sta t4
  rts

p_leaper:
  lda #K_LEAPER
  jsr new_thing
  bcc @r
  jsr rand
  and #F_FLIP
  sta o_f,x
  bne :+
  lda #<-9
  sta o_xh,x
  jmp @y
: lda #8
  sta o_xh,x
@y:
  lda #32                  ; on the bank, 2 m up
  sta o_y,x
@r:
  rts

p_drift:                   ; two to four drifts: plow straight through them
  lda #3
  jsr rnd_range
  clc
  adc #2
  sta t5
@l:
  lda #11
  jsr rnd_range
  sec
  sbc #5
  sta t3
  jsr rand
  sta t2
  lda #K_DRIFT
  jsr new_thing
  bcc :+
  jsr rand
  and #F_FLIP
  sta o_f,x
: lda #4
  jsr rnd_range
  clc
  adc t1
  sta t1
  dec t5
  bne @l
  lda #12
  sta t4
  rts

; ---- the title: the truck wanders round the middle lane, slowing to 9 m/s
title_update:
  inc title_t
  bne :+
  inc title_t+1
: lda #38
  jsr ease_speed
  lda spd
  jsr advance
  lda padn
  and #BTN_START
  beq :+
  jsr start_game
: rts

over_update:
  inc deadt
  lda #0
  jsr ease_speed
  lda spd
  jsr advance
  lda deadt
  cmp #30
  bcc :+
  lda padn
  and #BTN_START
  beq :+
  jsr start_game
: rts

toggle_pause:
  lda paused
  eor #1
  sta paused
  jsr show_pause
  rts
