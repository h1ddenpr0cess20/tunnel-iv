; ---------------------------------------------------------------------------- drawing
EV_LOY: .byte $80, $00, $80, $A0, $C0, $E0, $00, $20, $40, $60, $80, $A0, $C0, $E0, $00
EV_ROWBANK: .byte 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 5     ; which road group each entry starts (5: the cab)

; This frame's scroll list: the storm's bands, then each road row's X (your place across the road and the
; road's bend shear it), the paint's phase per group of rows, the cab.
build_scroll:
  ; the banks for the road groups
  ldx #0
: lda dpos+1
  ldy GRP_SHIFT,x
  beq :++
: lsr a
  dey
  bne :-
: asl a
  clc
  adc GRP_BASE,x
  sta grpb,x               ; each group's bank
  inx
  cpx #NGROUPS
  bne :---
  ; px in 1/16 m, signed
  lda pxl
  sta t5
  lda pxh
  asl t5
  rol a
  asl t5
  rol a
  asl t5
  rol a
  asl t5
  rol a
  sta sx_                  ; px / 16 (signed, |..| <= 72)
  ldx state                ; no shear under the title and game over panels
  beq @flat
  cpx #3
  beq @flat
  lda paused
  beq :+
@flat:
  lda #0
  sta sx_
  sta cx_
  jmp :++
: lda curv
  sta cx_
: ; the buffer the IRQ isn't reading
  lda efront
  eor #16
  sta ptr2
  ; the storm's lower bands
  ldx ptr2
  lda sky_bank
  clc
  adc #2
  sta ev_bk,x
  adc #2
  sta ev_bk+1,x
  lda grpb
  sta ev_bk+2,x
  lda #CAB_BANK
  sta ev_bk+14,x
  sta grpb+5
  ldy #0
: lda #0
  sta ev_hi,x
  lda EV_LOY,y
  sta ev_lo,x
  lda #0
  sta ev_x,x
  inx
  iny
  cpy #3
  bne :-
  ldx ptr2
  lda #0
  sta ev_hi+14,x
  sta ev_x+14,x
  lda EV_LOY+14
  sta ev_lo+14,x
  ; a jolt when something shakes the cab
  lda shake
  lsr a
  lsr a
  lsr a
  lsr a
  lsr a
  beq :+
  sta t4
  jsr rand
  and t4
: sta jolt
  ; the steering shear, row by row: |px16| * K / 64, K growing by 12.55 a row (exactly: ROWK)
  lda sx_
  bpl :+
  eor #$FF
  clc
  adc #1
: sta t5                   ; |px16|
  ldy ROWK
  jsr qmul
  sta ptr+1
  lda qlo
  sta ptr                  ; |px16| * K13 (8.8 of the / 256 that follows)
  lda t5
  ldy #201                 ; 12.55 x 16
  jsr qmul
  sta sy_
  lda qlo
  sta qt                   ; |px16| * 12.55 * 16: per row (/16 below)
  ; the bend's shear: a few rows a frame (it changes slowly)
  lda frame
  and #3
  tay                      ; rows y, y+4, y+8
@cv:
  lda cx_
  bpl :+
  eor #$FF
  clc
  adc #1
: ldx ROWZ,y
  stx qb
  sty t4
  ldy qb
  jsr qmul
  asl qlo
  rol a                    ; |curv| * Z / 128
  ldy t4
  ldx cx_
  bpl :+
  eor #$FF
  clc
  adc #1
: sta rowx,y               ; (signed: + moves the picture left)
  tya
  clc
  adc #4
  tay
  cpy #11
  bcc @cv
  ; rows: s1 = (base + row * step / 16) / 64, the step added up as it goes
  lda #0
  sta t2
  sta t3
  ldy #0
@row:
  sty t5
  lda t2                   ; t0:t1 = (step sum) / 16
  sta t0
  lda t3
  lsr a
  ror t0
  lsr a
  ror t0
  lsr a
  ror t0
  lsr a
  ror t0
  sta t1
  lda t2                   ; next row's sum
  clc
  adc qt
  sta t2
  lda t3
  adc sy_
  sta t3
  lda t0
  clc
  adc ptr
  sta t0
  lda t1
  adc ptr+1
  sta t1
  ; / 64 -> whole pixels in t0 (t1 the 9th bit)
  lda t0
  asl a
  rol t1
  asl a
  rol t1
  lda t1
  sta t0
  lda #0
  rol a
  sta t1
  ; X = 128 +- s1 (px > 0 moves the picture left) + the bend
  lda sx_
  bmi @pneg
  lda #128
  clc
  adc t0
  sta rx_
  lda #0
  adc t1
  sta rx_+1
  jmp @curve
@pneg:
  lda #128
  sec
  sbc t0
  sta rx_
  lda #0
  sbc t1
  sta rx_+1
@curve:
  ldy t5
  lda rowx,y
  bmi :+
  lda rx_
  sec
  sbc rowx,y
  sta rx_
  lda rx_+1
  sbc #0
  sta rx_+1
  jmp @shake
: lda rx_
  sec
  sbc rowx,y
  sta rx_
  lda rx_+1
  sbc #$FF
  sta rx_+1
@shake:
  lda jolt
  beq @store
  clc
  adc rx_
  sta rx_
  bcc @store
  inc rx_+1
@store:
  ldy t5
  tya
  clc
  adc #3
  adc ptr2
  tax                      ; the entry
  lda rx_
  sta ev_x,x
  lsr a
  lsr a
  lsr a
  ora EV_LOY+3,y
  sta ev_lo,x
  lda rx_+1
  and #1
  asl a
  asl a
  sta ev_hi,x
  ; its bank
  lda EV_ROWBANK+3,y
  tay
  lda grpb,y
  sta ev_bk,x
  ldy t5
  iny
  cpy #11
  beq :+
  jmp @row
: lda ptr2
  sta epend
  rts

qmul_ay:                   ; A * Y (unsigned) with X kept
  jmp qmul

; ---------------------------------------------------------------------------- sprites
; OAM: the pillar on the right and the marker rod first (they're on the truck), then everything on the
; road from the nearest out (the order turns round each frame, so where too many share a line they take
; turns), the reflector posts, then the snow.
build_oam:
  ldx #0
  lda state                ; under the title and game over panels: only the snow round them
  beq @panel
  cmp #3
  bne @pil0
@panel:
  lda #$F0                 ; everything off first (no snow drawn would leave oamn at 0: 'full')
: sta oam,x
  inx
  inx
  inx
  inx
  bne :-
  stx oamn
  stx sprbn
  stx sprbn+1
  stx sprbn+2
  jsr draw_snow
  jmp @rest
@pil0:
  ; the marker rod on the blade's left end
  lda #91
  sta oam,x
  lda #SPT_ROD_TOP
  sta oam+1,x
  lda #0
  sta oam+2,x
  lda #50
  sta oam+3,x
  inx
  inx
  inx
  inx
  lda #107
@rod:
  sta oam,x
  pha
  lda #SPT_ROD
  sta oam+1,x
  lda #0
  sta oam+2,x
  lda #50
  sta oam+3,x
  inx
  inx
  inx
  inx
  pla
  clc
  adc #16
  cmp #185
  bcc @rod
  stx oamn
  lda #0
  sta sprbn
  sta sprbn+1
  sta sprbn+2
  jsr draw_things
  jsr draw_posts
  jsr draw_snow
@rest:                     ; the rest off screen
  ldx oamn
  beq @r
  lda #$F0
: sta oam,x
  inx
  inx
  inx
  inx
  bne :-
@r:
  rts

; ---- things on the road
SORTN = sortn
draw_things:
  ; the ones in sight, nearest first
  ldy #0
  ldx #0
@col:
  lda o_k,x
  beq @n
  lda o_zh,x
  bmi @n
  cmp #4                   ; nearer than 4 m: under the blade
  bcc @n
  cmp #76                  ; past that, lost in the white
  bcs @n
  txa
  sta sortbuf,y
  iny
@n:
  inx
  cpx #NOBJ
  bne @col
  sty SORTN
  ; insertion sort by depth
  ldy #1
@s:
  cpy SORTN
  bcs @sorted
  lda sortbuf,y
  sta t5
  tax
  lda o_zh,x
  sta t3
  sty t2
@ins:
  ldx t2
  beq @put
  lda sortbuf-1,x
  tax
  lda o_zh,x
  cmp t3
  bcc @put
  beq @put
  ldx t2
  lda sortbuf-1,x
  sta sortbuf,x
  dec t2
  jmp @ins
@put:
  ldx t2
  lda t5
  sta sortbuf,x
  iny
  jmp @s
@sorted:
  ; the nearest picks its sprite bank first; the rest take turns at the other slots (one left out this
  ; frame flickers, rather than showing up the wrong size)
  lda #0
  sta di
  sta dn
  sta rr
  ldx SORTN
  cpx #3
  bcc @d
  dex
  stx t5
  lda frame
: cmp t5
  bcc :+
  sbc t5
  jmp :-
: sta rr                   ; rotation of entries 1..n-1
@d:
  lda di
  cmp SORTN
  bcs @emit
  beq @d0
  tax
  beq @d0
  dex                      ; 1 + (i - 1 + rr) mod (n - 1)
  txa
  clc
  adc rr
  ldx SORTN
  dex
  stx t5
  cmp t5
  bcc :+
  sbc t5
: tax
  inx
  txa
@d0:
  tax
  lda sortbuf,x
  tax
  stx oi
  jsr draw_one
  inc di
  jmp @d
@emit:
  ; ... and they're drawn starting from a different one each frame, so where more than eight share a
  ; line they take turns
  lda dn
  beq @done
  lda frame
: cmp dn
  bcc :+
  sbc dn
  jmp :-
: sta di
  lda dn
  sta t5
@e:
  ldx di
  jsr emit_parts
  inc di
  lda di
  cmp dn
  bcc :+
  lda #0
  sta di
: dec t5
  bne @e
@done:
  rts

; zq for o_z: 1/4 m steps to 32 m, then 1/2 m -> A (C set if too far)
zq_of:
  lda o_zh,x
  cmp #32
  bcs :+
  asl a
  asl a
  sta t3
  lda o_zl,x
  rol a
  rol a
  rol a
  and #3
  ora t3
  clc
  rts
: cmp #96
  bcs :+
  sec
  sbc #32
  asl a
  sta t3
  lda o_zl,x
  asl a
  lda t3
  adc #128
  clc
  rts
: sec
  rts

; Kind -> which picture: robots side-on or facing you, cars by paint, the spinner by its turn
draw_one:
  stx oi
  jsr zq_of
  bcc :+
  rts
: sta dq
  ; where across: dx = o_x - px + 0.55 m (your eyes are left of the middle)
  lda o_xl,x
  sec
  sbc pxl
  sta t0
  lda o_xh,x
  sbc pxh
  sta t1
  lda t0
  clc
  adc #141
  sta t0
  bcc :+
  inc t1
:
  ; the semi: its middle is 4.6 m towards its side and 5.4 m on from its end
  lda o_k,x
  cmp #K_JACK
  bne @dx
  lda o_f,x
  and #F_FLIP
  beq @jr
  lda t1
  sec
  sbc #5
  sta t1
  jmp @jz
@jr:
  lda t1
  clc
  adc #5
  sta t1
@jz:
  lda o_zh,x
  clc
  adc #5
  cmp #96
  bcc :+
  rts
: cmp #32
  bcs :+
  asl a
  asl a
  sta dq
  jmp @dx
: sec
  sbc #32
  asl a
  clc
  adc #128
  sta dq
@dx:
 ; dx in 1/8 m, clamped
  lda t1
  bpl @dpos
  cmp #<-16
  bcs :+
  rts
: lda t0
  asl a
  rol t1
  asl a
  rol t1
  asl a
  rol t1
  lda t1
  eor #$FF
  clc
  adc #1
  sta dxa                  ; |dx| in 1/8 m
  lda #$FF
  sta dxs
  jmp @proj
@dpos:
  cmp #16
  bcc :+
  rts
: lda t0
  asl a
  rol t1
  asl a
  rol t1
  asl a
  rol t1
  lda t1
  sta dxa
  lda #0
  sta dxs
@proj:
  ; |dx| * ppm / 2048: (dxa * ppmh) / 8 + (dxa * ppml) / 2048
  ldy dq
  lda ZPPMH,y
  sta ppmh
  lda ZPPML,y
  sta t5
  lda dxa
  ldy ppmh
  jsr qmul
  sta t1
  lda qlo
  lsr t1
  ror a
  lsr t1
  ror a
  lsr t1
  ror a
  sta t0                   ; t0:t1 = dxa * ppmh / 8
  lda dxa
  ldy t5
  jsr qmul
  lsr a
  lsr a
  lsr a
  clc
  adc t0
  sta t0
  bcc :+
  inc t1
: ; sx = 128 +- that + the bend (curv * z / 128)
  lda dxs
  beq :+
  lda #128
  sec
  sbc t0
  sta sx_
  lda #0
  sbc t1
  sta sx_+1
  jmp :++
: lda #128
  clc
  adc t0
  sta sx_
  lda #0
  adc t1
  sta sx_+1
: ldx oi
  lda curv
  bpl :+
  eor #$FF
  clc
  adc #1
: ldy o_zh,x
  jsr qmul
  asl qlo
  rol a
  sta t0
  lda curv
  bmi :+
  lda sx_
  clc
  adc t0
  sta sx_
  bcc :++
  inc sx_+1
  jmp :++
: lda sx_
  sec
  sbc t0
  sta sx_
  bcs :+
  dec sx_+1
: ; off the screen?
  lda sx_+1
  beq :++
  cmp #$FF
  beq :+
  rts
: lda sx_
  cmp #192
  bcs :+
  rts
: ; sy = the road at that depth, less its height off it (o_y in 1/16 m), less a bank under walkers
  ldy dq
  lda ZGY,y
  sta sy_
  jsr height_of
  beq :+
  ldy ppmh
  jsr qmul
  lsr a
  ror qlo
  lsr a
  ror qlo
  lsr a
  ror qlo
  lsr a
  ror qlo
  lda sy_
  sec
  sbc qlo
  sta sy_
  bcs :+
  rts
: ; the picture
  ldx oi
  jsr pick_view            ; -> A = view, t3 = flip ($40 or 0), t4 = frame
  sta t5
  ldy dq
  lda ZBUCK,y
  sta dbk
@findb:                    ; the nearest size there's a picture for
  lda t5
  asl a
  asl a
  asl a
  ora dbk
  tay
  lda MSPTRH,y
  bne :+
  inc dbk
  lda dbk
  cmp #8
  bcc @findb
  rts
: sta ptr+1
  lda MSPTRL,y
  sta ptr
  ; its bank: always there, or one of the three this frame can load
  ldy #0
  lda (ptr),y
  beq @common
  ldx #0
: cmp sprbn,x
  beq @slot
  inx
  cpx #3
  bne :-
  ldx #0
: ldy sprbn,x
  beq @take
  inx
  cpx #3
  bne :-
  ; no room for its bank: far off, the next size down that is loaded (or always there); nearer, it
  ; sits this frame out
  lda dbk
  cmp #4
  bcc :+
  inc dbk
  lda dbk
  cmp #8
  bcs :+
  jmp @findb
: rts
@take:
  sta sprbn,x
@slot:
  lda SLOT_BASE,x
  bne @tb
@common:
  lda #0
@tb:
  sta tbase
  ; the frame
  ldy #1
  lda (ptr),y
  sta t2                   ; frames
  iny
  lda t4
  cmp t2
  bcc :+
  lda #0
: sta t4
@skipf:
  lda t4
  beq @parts
  lda (ptr),y              ; count
  sta t0
  asl a
  adc t0
  sec
  adc #0                   ; 3n + 1
  sta t0
  tya
  clc
  adc t0
  tay
  dec t4
  jmp @skipf
@parts:
  lda (ptr),y
  sta t2                   ; how many
  iny
  sty ry
  ; palette: fog by depth (snow heaps a step lighter)
  ldx oi
  lda o_zh,x
  ldy #0
  cmp #20
  bcc :+
  iny
  cmp #34
  bcc :+
  iny
  cmp #56
  bcc :+
  iny
: lda o_k,x
  cmp #K_DRIFT
  beq @lt
  cmp #K_BURIED
  bne @pal
@lt:
  cpy #3
  bcs @pal
  iny
@pal:
  tya
  ora t3
  ; keep it all for drawing (in an order that turns round each frame)
  ldx dn
  sta d_at,x
  lda ptr
  sta d_pl,x
  lda ptr+1
  sta d_ph,x
  lda ry
  sta d_y,x
  lda t2
  sta d_n,x
  lda t3
  sta d_fl,x
  lda tbase
  sta d_tb,x
  lda sx_
  sta d_sxl,x
  lda sx_+1
  sta d_sxh,x
  lda sy_
  sta d_sy,x
  inc dn
  rts

emit_parts:                ; X = which prepared thing: its sprites into OAM
  lda d_pl,x
  sta ptr
  lda d_ph,x
  sta ptr+1
  lda d_n,x
  sta t2
  lda d_at,x
  sta t1
  lda d_fl,x
  sta t3
  lda d_tb,x
  sta tbase
  lda d_sxl,x
  sta sx_
  lda d_sxh,x
  sta sx_+1
  lda d_sy,x
  sta sy_
  ldy d_y,x
@p:
  ldx oamn
  lda t3
  bne @pf
@pn:                       ; not flipped: x = sx + dx
  lda t2
  beq @pd
  dec t2
  cpx #0
  beq @pd                  ; the sprites are all used
  lda (ptr),y              ; dx
  iny
  sta t4
  clc
  adc sx_
  sta t0
  lda t4                   ; (carry kept)
  bmi @nneg
  lda sx_+1
  adc #0
  jmp @nx
@nneg:
  lda sx_+1
  adc #$FF
@nx:
  bne @ns1
  lda (ptr),y
  iny
  clc
  adc sy_
  bcc @ns2
  cmp #181
  bcs @ns2
  cmp #9
  bcc @ns2
  sbc #1
  sta oam,x
  lda t0
  sta oam+3,x
  lda (ptr),y
  iny
  clc
  adc tbase
  sta oam+1,x
  lda t1
  sta oam+2,x
  inx
  inx
  inx
  inx
  jmp @pn
@ns1:
  iny
@ns2:
  iny
  jmp @pn
@pd:
  stx oamn
  rts
@pf:                       ; flipped: x = sx - dx - 8
  lda t2
  beq @pd
  dec t2
  cpx #0
  beq @pd
  lda (ptr),y
  iny
  eor #$FF
  sec
  sbc #7                   ; -dx - 8
  php
  clc
  adc sx_
  sta t0
  plp
  bmi @fneg
  lda sx_+1
  adc #0
  jmp @fx
@fneg:
  lda sx_+1
  adc #$FF
@fx:
  bne @fs1
  lda (ptr),y
  iny
  clc
  adc sy_
  bcc @fs2
  cmp #181
  bcs @fs2
  cmp #9
  bcc @fs2
  sbc #1
  sta oam,x
  lda t0
  sta oam+3,x
  lda (ptr),y
  iny
  clc
  adc tbase
  sta oam+1,x
  lda t1
  sta oam+2,x
  inx
  inx
  inx
  inx
  jmp @pf
@fs1:
  iny
@fs2:
  iny
  jmp @pf

; height off the road (1/16 m) -> A, Z set if none
height_of:
  ldx oi
  lda o_k,x
  cmp #K_WALKER
  bne :+
  ; on the bank where it's off the road
  lda o_xh,x
  bpl :++
  eor #$FF
: 
: cmp #10
  bcc :+
  lda #9
: tay
  lda o_k,x
  cmp #K_WALKER
  bne :+
  lda BANKY,y
  rts
: lda o_y,x
  rts
BANKY: .byte 0, 0, 0, 0, 0, 0, 2, 10, 22, 32

pick_view:                 ; -> A = view, t3 = $40 if flipped, t4 = animation frame
  lda o_f,x
  and #F_FLIP
  beq :+
  lda #$40
: sta t3
  lda #0
  sta t4
  lda o_k,x
  cmp #K_ROBOT
  beq @dig
  cmp #K_CREW
  beq @dig
  cmp #K_WALKER
  beq @walk
  cmp #K_LEAPER
  beq @leap
  cmp #K_CAR
  beq @car
  cmp #K_SPIN
  beq @spin
  cmp #K_BURIED
  beq @buried
  cmp #K_JACK
  beq @semi
  cmp #K_TIRE
  beq @tire
  lda #V_MOUND
  rts
@dig:
  lda o_t,x
  lsr a
  lsr a
  lsr a
  lsr a
  lsr a
  and #1
  sta t4
  lda o_f,x
  and #$40
  beq :+
  lda #V_DIG_FRONT
  rts
: lda #V_DIG_SIDE
  rts
@walk:
  lda o_f,x
  and #$10
  beq :+
  inc t4
: lda #V_WALK
  rts
@leap:
  lda #V_LEAP
  rts
@car:
  lda o_f,x
  and #F_DARK
  beq :+
  lda #V_CAR_DARK
  rts
: lda #V_CAR_LIGHT
  rts
@spin:
  lda o_t,x
  clc
  adc #16
  lsr a
  lsr a
  lsr a
  lsr a
  lsr a
  tay
  lda SPIN_FLIP,y
  sta t3
  lda SPIN_VIEW,y
  rts
@buried:
  lda #V_BURIED
  rts
@semi:
  lda #V_SEMI
  rts
@tire:
  lda o_t,x
  lsr a
  lsr a
  and #1
  sta t4
  lda #V_TIRE
  rts
SLOT_BASE: .byte 64, 128, 192
SPIN_VIEW: .byte V_CAR_LIGHT, V_SPIN45, V_SPIN90, V_SPIN135, V_SPIN180, V_SPIN135, V_SPIN90, V_SPIN45
SPIN_FLIP: .byte 0, 0, 0, 0, 0, $40, $40, $40

; ---- the reflector posts, both sides, every 30 m
draw_posts:
  ; where the first is: 30 - (s mod 30), kept by postz
  lda postz
  sec
  sbc spd
  sta postz
  lda postz+1
  sbc #0
  sta postz+1
  bpl :+
  cmp #<-3
  bcs :+
  clc
  adc #30
  sta postz+1
: lda postz+1
  sta t5
@each:
  lda t5
  cmp #62
  bcs @r
  cmp #4
  bmi @next
  ; zq
  cmp #32
  bcs :+
  asl a
  asl a
  jmp :++
: sec
  sbc #32
  asl a
  clc
  adc #128
: tay
  lda ZPPMH,y
  sta ppmh
  lda ZGY,y
  sta sy_
  ; left and right: x = -+7.1 m from the middle, less px less the eye's 0.55
  lda #<(-(7*256+26) + 141)
  sta t0
  lda #>(-(7*256+26) + 141)
  sta t1
  jsr post_at
  lda #<((7*256+26) + 141)
  sta t0
  lda #>((7*256+26) + 141)
  sta t1
  jsr post_at
@next:
  lda t5
  clc
  adc #30
  sta t5
  bcc @each
@r:
  rts

POST_T:
  .byte SPT_POST_H2, SPT_POST_H2, SPT_POST_H2, SPT_POST_H3, SPT_POST_H4, SPT_POST_H4, SPT_POST_H6, SPT_POST_H6
  .byte SPT_POST_H8, SPT_POST_H8, SPT_POST_H10, SPT_POST_H10, SPT_POST_H10, SPT_POST_H13, SPT_POST_H13, SPT_POST_H13
  .byte SPT_POST_H16
post_at:                   ; t0:t1 = x + 0.55 m (8.8); ppmh, sy_ set
  lda t0
  sec
  sbc pxl
  sta t0
  lda t1
  sbc pxh
  sta t1
  ; px = x * ppmh (whole m and 1/256)
  lda t1
  php
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
  ldy ppmh
  jsr qmul
  sta t2
  lda qlo
  sta t3                   ; t3:t2 = whole metres * ppm
  lda t0
  ldy ppmh
  jsr qmul                 ; frac * ppm / 256
  clc
  adc t3
  sta t3
  bcc :+
  inc t2
: plp
  bpl :+
  lda #128
  sec
  sbc t3
  sta t3
  lda #0
  sbc t2
  jmp :++
: lda #128
  clc
  adc t3
  sta t3
  lda #0
  adc t2
:  sta t2
  ; the bend: + curv * z / 128 (z whole metres in t5)
  lda curv
  beq @nb
  bpl :+
  eor #$FF
  clc
  adc #1
: ldy t5
  jsr qmul
  asl qlo
  rol a
  sta t4
  lda curv
  bmi :+
  lda t3
  clc
  adc t4
  sta t3
  bcc @nb
  inc t2
  jmp @nb
: lda t3
  sec
  sbc t4
  sta t3
  bcs @nb
  dec t2
@nb:
  lda t2
  bne @off
  lda t3
  cmp #248
  bcs @off
  ; height: 1.2 m up, in px = 1.2 * ppmh  (77/64)
  lda ppmh
  ldy #77
  jsr qmul
  asl qlo
  rol a
  asl qlo
  rol a
  cmp #2
  bcc @off                 ; too far to see
  cmp #33
  bcs @off
  sta t4                   ; t4 = height in px
  ldx oamn
  beq @off
  cmp #17
  bcc @short
  ; tall: the full 16 px stick on the ground, the topped 16 under the reflector
  lda sy_
  sec
  sbc #17
  sta oam,x
  lda #SPT_POST
  jsr @put
  beq @one
  lda sy_
  sec
  sbc t4
  sec
  sbc #1
  sta oam,x
  lda #SPT_POST_H16
  jsr @put
  jmp @one
@short:
  lda sy_
  sec
  sbc #17
  sta oam,x
  ldy t4
  lda POST_T,y
  jsr @put
  jmp @one
@put:                      ; tile in A at oam,x (y already there), x at t3
  sta oam+1,x
  lda #0
  sta oam+2,x
  lda t3
  sta oam+3,x
  inx
  inx
  inx
  inx
  txa
  rts
@one:
  stx oamn
@off:
  rts

; ---- the snow, streaming out of the white at you
NFLAKE = 10
draw_snow:
  ; how fast new flakes start out: with your speed (spd / 64, at least 1/2)
  lda spd
  lsr a
  lsr a
  lsr a
  cmp #3
  bcs :+
  lda #3
: sta fspd
  ldy #0
@f:
  sty fi
  ; respawn when it's off the picture
  lda fl_y,y
  cmp #186
  bcs @new
  cmp #16                  ; (not over the cab roof and the HUD)
  bcc @new
  lda fl_x,y
  cmp #8
  bcc @new
  cmp #248
  bcs @new
  jmp @move
@new:
  jsr rand
  and #63
  clc
  adc #96
  sta fl_x,y
  jsr rand
  and #31
  clc
  adc #84
  sta fl_y,y
  ; velocity: straight out from the white (128, 100), x the speed / 8
  lda fl_x,y
  sec
  sbc #128
  ldx fspd
  jsr mul_s8
  sta fl_vx,y
  lda fl_y,y
  sec
  sbc #100
  ldx fspd
  jsr mul_s8
  sta fl_vy,y
@move:
  ; v grows as it comes nearer (x 1 + 1/16 a frame); the position moves by v / 16
  lda fl_vx,y
  jsr asr4
  clc
  adc fl_vx,y
  bvs :+
  sta fl_vx,y
: lda fl_vy,y
  jsr asr4
  clc
  adc fl_vy,y
  bvs :+
  sta fl_vy,y
: lda fl_vx,y
  jsr v16
  clc
  adc fl_xf,y
  sta fl_xf,y
  lda fl_x,y
  adc t1
  sta fl_x,y
  lda fl_vy,y
  jsr v16
  clc
  adc fl_yf,y
  sta fl_yf,y
  lda fl_y,y
  adc t1
  sta fl_y,y
  ; draw: the streak by its direction
  ldx oamn
  beq @next
  lda fl_y,y
  cmp #186
  bcs @next
  lda state
  beq :+
  cmp #3
  bne @draw
: lda fl_y,y               ; (a panel covers rows 5-23)
  cmp #36
  bcc @draw
  jmp @next
@draw:
  lda fl_y,y
  sbc #0
  sta oam,x
  lda fl_x,y
  sta oam+3,x
  jsr flake_tile
  ldy fi
  sta oam+1,x
  lda t3
  sta oam+2,x
  inx
  inx
  inx
  inx
  stx oamn
@next:
  ldy fi
  iny
  cpy #NFLAKE
  beq :+
  jmp @f
: rts

mul_s8:                    ; A (signed) * X / 8 -> A (signed, clamped)
  sta t2
  bpl :+
  eor #$FF
  clc
  adc #1
: stx qb
  ldy qb
  jsr qmul
  lsr a
  ror qlo
  lsr a
  ror qlo
  lsr a
  ror qlo
  lda qlo
  cmp #$7F
  bcc :+
  lda #$7F
: bit t2
  bpl :+
  eor #$FF
  clc
  adc #1
: ldy fi
  rts

v16:                       ; A = v (signed, 4.4) -> A = fraction byte, t1 = whole (signed) of v / 16
  sta t1
  asl a
  asl a
  asl a
  asl a
  pha
  lda t1
  cmp #$80
  ror a
  cmp #$80
  ror a
  cmp #$80
  ror a
  cmp #$80
  ror a
  sta t1
  pla
  rts

asr4:
  cmp #$80
  ror a
  cmp #$80
  ror a
  cmp #$80
  ror a
  cmp #$80
  ror a
  rts

flake_tile:                ; Y = flake -> A = tile, t3 = attributes (flips; palette 3, white)
  lda #3
  sta t3
  lda fl_vx,y
  bpl :+
  eor #$FF
  clc
  adc #1
  pha
  lda t3
  ora #$40
  sta t3
  pla
: sta t0                   ; |vx|
  lda fl_vy,y
  bpl :+
  eor #$FF
  clc
  adc #1
  pha
  lda t3
  ora #$80
  sta t3
  pla
: sta t1                   ; |vy|
  clc
  adc t0
  cmp #24
  bcs :+
  lda #SPT_DOT1
  rts
: cmp #60
  bcs :+
  lda #SPT_DOT2
  rts
: ; the slope
  lda t1
  asl a
  cmp t0
  bcs :+
  lda #SPT_S22             ; |vy| < |vx| / 2
  rts
: lda t0
  asl a
  cmp t1
  bcs :+
  lda #SPT_S67             ; |vx| < |vy| / 2
  rts
: lda #SPT_S45L
  rts
