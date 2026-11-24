; ---------------------------------------------------------------------------- screens and the HUD

; Rendering off, the nametables back as they were.
restore_screen:
  jsr screen_off
  jsr set_fixed_banks
  jsr load_nametables
  jsr screen_on
  rts

go_title:
  lda #0
  sta state
  lda #R1_TITLE
  sta r1val
  jsr screen_off
  jsr set_fixed_banks
  jsr load_nametables
  lda #5
  ldx #24
  jsr panel
  ldx #0
@s:
  lda TITLE_STRS,x
  sta ptr
  lda TITLE_STRS+1,x
  sta ptr+1
  txa
  pha
  jsr put_str
  pla
  tax
  inx
  inx
  cpx #NTITLE*2
  bne @s
  lda #<STR_BIG0
  sta ptr
  lda #>STR_BIG0
  sta ptr+1
  jsr put_big
  lda #<STR_BIG1
  sta ptr
  lda #>STR_BIG1
  sta ptr+1
  jsr put_big
  lda best
  ora best+1
  beq :+
  lda #<STR_BEST
  sta ptr
  lda #>STR_BEST
  sta ptr+1
  jsr put_str
  lda best
  sta t0
  lda best+1
  sta t1
  jsr fmt_metres          ; -> lexbuf, A = length
  sta t2
  ldx #18
  lda #23
  jsr put_buf
: jsr screen_on
  rts

put_big:                   ; a big string: row, col, n, top tiles, bottom tiles
  ldy #0
  lda (ptr),y
  sta t3
  iny
  lda (ptr),y
  sta t4
  iny
  lda (ptr),y
  sta t2
  lda #3
  sta t5
  jsr @half
  inc t3
@half:
  lda t3
  ldx t4
  jsr scr_addr
  lda ptr2+1
  sta PPUADDR
  lda ptr2
  sta PPUADDR
  ldy t5
  ldx t2
: lda (ptr),y
  sta PPUDATA
  iny
  dex
  bne :-
  sty t5
  rts

put_buf:                   ; lexbuf at row A, col X, length t2 (rendering off); a tile at a time, as
  sta t3                   ; road rows run on from one nametable into the other
  stx t4
  ldx #0
@c:
  stx t5
  lda PPUSTAT
  lda t3
  ldx t4
  jsr scr_addr
  lda ptr2+1
  sta PPUADDR
  lda ptr2
  sta PPUADDR
  ldx t5
  lda lexbuf,x
  sta PPUDATA
  inc t4
  inx
  cpx t2
  bne @c
  rts

go_over:
  lda #3
  sta state
  lda #0
  sta deadt
  ; your best
  lda meters+1
  cmp best+1
  bcc :++
  bne :+
  lda meters
  cmp best
  bcc :++
: lda meters
  sta best
  lda meters+1
  sta best+1
: jsr screen_off
  jsr load_nametables
  lda #6
  ldx #23
  jsr panel
  lda #<STR_OVER
  sta ptr
  lda #>STR_OVER
  sta ptr+1
  jsr put_str
  ; how it happened
  lda dkind
  sec
  sbc #1
  asl a
  tax
  lda DEATH_STR,x
  sta ptr
  lda DEATH_STR+1,x
  sta ptr+1
  lda #9
  jsr put_centred
  ; how far
  lda meters
  sta t0
  lda meters+1
  sta t1
  jsr fmt_metres
  sta t2
  lda #32
  sec
  sbc t2
  lsr a
  tax
  lda #12
  jsr put_buf
  ; and how far the exit was
  jsr fmt_exit
  sta t2
  lda #32
  sec
  sbc t2
  lsr a
  tax
  lda #15
  jsr put_buf
  lda #<STR_OVER1
  sta ptr
  lda #>STR_OVER1
  sta ptr+1
  jsr put_str
  lda #<STR_OVER2
  sta ptr
  lda #>STR_OVER2
  sta ptr+1
  jsr put_str
  lda #<STR_GO
  sta ptr
  lda #>STR_GO
  sta ptr+1
  jsr put_str
  jsr screen_on
  jsr sound_over
  rts

put_centred:               ; (ptr) = len, tiles; A = row
  pha
  ldy #0
  lda (ptr),y
  sta t2
  lda #32
  sec
  sbc t2
  lsr a
  tax
  pla
  jsr scr_addr
  lda ptr2+1
  sta PPUADDR
  lda ptr2
  sta PPUADDR
  ldy #1
  ldx t2
: lda (ptr),y
  sta PPUDATA
  iny
  dex
  bne :-
  rts

show_pause:
  lda paused
  beq @off
  lda #<STR_PAUSE0
  sta ptr
  lda #>STR_PAUSE0
  sta ptr+1
  jsr q_str
  lda #<STR_PAUSE1
  sta ptr
  lda #>STR_PAUSE1
  sta ptr+1
  jsr q_str
  jsr sound_pause
  rts
@off:
  lda #12
  jsr q_restore_row
  lda #14
  jsr q_restore_row
  jsr sound_pause
  rts

q_str:                     ; queue a string record (row, col, len, tiles) for the next vblank
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
  sty t4                   ; where the tiles are
  ; as far as the end of this nametable's row, then on in the other one
  lda ptr2
  and #31
  eor #31
  clc
  adc #1                   ; room left in the row
  cmp t2
  bcc :+
  lda t2
: sta t3
  sta t5
  jsr @run
  lda t2
  sec
  sbc t5
  beq @r
  sta t3
  lda ptr2
  and #$E0
  sta ptr2
  lda ptr2+1
  eor #$04
  sta ptr2+1
@run:
  lda t3
  jsr q_open
  bcs @r
  ldy t4
: lda (ptr),y
  sta qbuf,x
  inx
  iny
  dec t3
  bne :-
  sty t4
  jmp q_close
@r:
  rts

q_restore_row:             ; A = screen row: both nametables' row as built
  sta t3
  ; NT0
  lda t3
  lsr a
  lsr a
  lsr a
  ora #$20
  sta ptr2+1
  lda t3
  asl a
  asl a
  asl a
  asl a
  asl a
  sta ptr2
  jsr @row
  lda ptr2+1
  ora #$04
  sta ptr2+1
  lda #<NT1
  sta ptr
  lda #>NT1
  jmp @go
@row:
  lda #<NT0
  sta ptr
  lda #>NT0
@go:
  sta ptr+1
  ; + row * 32
  lda t3
  asl a
  asl a
  asl a
  asl a
  asl a
  php
  clc
  adc ptr
  sta ptr
  lda t3
  lsr a
  lsr a
  lsr a
  adc ptr+1
  sta ptr+1
  plp
  lda #32
  jsr q_open
  bcs @r
  ldy #0
: lda (ptr),y
  sta qbuf,x
  inx
  iny
  cpy #32
  bne :-
  jmp q_close
@r:
  rts

; ---- the HUD on the cab roof: labels on row 0, the numbers on row 1
hud_static:                ; (rendering off)
  lda #$20
  sta PPUADDR
  lda #$00
  sta PPUADDR
  ldx #0
: lda HUD_LABELS,x
  sta PPUDATA
  inx
  cpx #34
  bcc :-
  lda #1
  sta wh_up
  rts

hud_update:
  jsr fade_pal
  jsr whisper_tick
  lda state
  cmp #1
  beq :+
  cmp #2
  beq :+
  rts
: lda wh_up
  beq :+
  lda frame                ; at most every fourth frame
  and #3
  beq :++
: rts
: lda #0
  sta wh_up
  ; row 1: the distance on the left, the next exit on the right
  ldx #31
  lda #T_SPACE
: sta hudbuf,x
  dex
  bpl :-
  lda meters
  sta t0
  lda meters+1
  sta t1
  jsr fmt_metres
  tax
  dex
: lda lexbuf,x
  sta hudbuf+1,x
  dex
  bpl :-
  jsr fmt_exit
  sta t2
  lda #31
  sec
  sbc t2
  tay
  ldx #0
: lda lexbuf,x
  sta hudbuf,y
  iny
  inx
  cpx t2
  bne :-
  lda #$20
  sta ptr2+1
  lda #$20
  sta ptr2
  lda #32
  jsr q_open
  bcc :+
  lda #1
  sta wh_up                ; next frame, then
  rts
: ldy #0
: lda hudbuf,y
  sta qbuf,x
  inx
  iny
  cpy #32
  bne :-
  jmp q_close

; t0:t1 metres -> lexbuf "12,345 m", A = length
fmt_metres:
  ldx #0
  stx t4                   ; leading zeros off
  ldy #0
@d:
  lda #0
  sta t2
@sub:
  lda t0
  sec
  sbc POW10L,y
  sta t3
  lda t1
  sbc POW10H,y
  bcc @digit
  sta t1
  lda t3
  sta t0
  inc t2
  jmp @sub
@digit:
  lda t2
  ora t4
  bne :+
  cpy #4
  bne @skip
: lda t2
  clc
  adc #T_0
  sta lexbuf,x
  inx
  sta t4
  cpy #1                   ; a comma after the thousands
  bne @skip
  lda #T_COMMA
  sta lexbuf,x
  inx
@skip:
  iny
  cpy #5
  bne @d
  lda #T_SPACE
  sta lexbuf,x
  inx
  lda #T_M
  sta lexbuf,x
  inx
  txa
  rts
POW10L: .byte <10000, <1000, <100, <10, <1
POW10H: .byte >10000, >1000, >100, >10, >1

; The next exit: 800 m halving every 300 m, from log10 of it (lexp, 8.24). -> lexbuf, A = length
fmt_exit:
  ; mantissa = 10^frac x 10000, interpolated: MANT[i] + (MANT[i+1] - MANT[i]) * w / 256
  ldy lexp+2
  lda MANT_L+1,y
  sec
  sbc MANT_L,y
  sta t2
  lda MANT_M+1,y
  sbc MANT_M,y
  sta t3                   ; the step (at most ~900)
  lda t2
  ldy lexp+1
  jsr qmul
  sta t4                   ; low * w / 256
  lda t3
  ldy lexp+1
  jsr qmul                 ; high * w -> A:qlo (/ 256 * 256)
  lda qlo
  clc
  adc t4
  sta t4
  ldy lexp+2
  lda MANT_L,y
  clc
  adc t4
  sta t0
  lda MANT_M,y
  adc #0
  sta t1
  lda MANT_H,y
  adc #0
  sta t2                   ; t0:t1:t2 = 10000..99999
  ; five digits
  ldy #0
@dg:
  lda #0
  sta t4
@s5:
  lda t0
  sec
  sbc D5L,y
  sta t3
  lda t1
  sbc D5M,y
  sta t5
  lda t2
  sbc D5H,y
  bcc @put
  sta t2
  lda t5
  sta t1
  lda t3
  sta t0
  inc t4
  jmp @s5
@put:
  lda t4
  sta digs,y
  iny
  cpy #5
  bne @dg
  ; lay it out by the exponent
  ldx #0
  lda lexp+3
  bmi @small
  ; d.dd, dd.dd, ddd.dd: E + 1 digits, the point, two more
  sta t3                   ; E
  ldy #0
: lda digs,y
  clc
  adc #T_0
  sta lexbuf,x
  inx
  iny
  cpy t3
  bcc :-
  beq :-
  lda #T_DOT
  sta lexbuf,x
  inx
  lda digs,y
  clc
  adc #T_0
  sta lexbuf,x
  inx
  iny
  lda digs,y
  clc
  adc #T_0
  sta lexbuf,x
  inx
  jmp @m
@small:
  cmp #<-12
  bcc @exp
  ; 0.000dddd
  eor #$FF                 ; -E - 1 zeros
  sta t3
  lda #T_0
  sta lexbuf,x
  inx
  lda #T_DOT
  sta lexbuf,x
  inx
  lda t3
  beq :++
  lda #T_0
: sta lexbuf,x
  inx
  dec t3
  bne :-
: ldy #0
: lda digs,y
  clc
  adc #T_0
  sta lexbuf,x
  inx
  iny
  cpy #4
  bne :-
  jmp @m
@exp:                      ; d.ddde-NN
  sta t3
  lda digs
  clc
  adc #T_0
  sta lexbuf,x
  inx
  lda #T_DOT
  sta lexbuf,x
  inx
  ldy #1
: lda digs,y
  clc
  adc #T_0
  sta lexbuf,x
  inx
  iny
  cpy #4
  bne :-
  lda #T_E
  sta lexbuf,x
  inx
  lda #T_DASH
  sta lexbuf,x
  inx
  lda t3
  eor #$FF
  clc
  adc #1                   ; -E
  ldy #0
: cmp #10
  bcc :+
  sbc #10
  iny
  bne :-
: pha
  tya
  clc
  adc #T_0
  sta lexbuf,x
  inx
  pla
  clc
  adc #T_0
  sta lexbuf,x
  inx
@m:
  lda #T_SPACE
  sta lexbuf,x
  inx
  lda #T_M
  sta lexbuf,x
  inx
  txa
  rts
D5L: .byte <10000, <1000, <100, <10, <1
D5M: .byte >10000, >1000, >100, >10, >1
D5H: .byte 0, 0, 0, 0, 0

; ---- whispers: a line over the storm for a couple of seconds
whisper:                   ; (ptr) = len, tiles: row 6, centred over the storm
  ldy #0
  lda (ptr),y
  sta t2
  ; the row as it is, then the words over it
  ldx #31
: lda NT0+6*32,x
  sta whbuf,x
  dex
  bpl :-
  lda #32
  sec
  sbc t2
  lsr a
  tax
  lda t2
  sta t3
  ldy #1
: lda (ptr),y
  sta whbuf,x
  inx
  iny
  dec t3
  bne :-
  lda #156
  sta wh_t
  lda #1
  sta wh_q
  rts

whisper_tick:
  lda wh_q                 ; a new one to send
  bne q_whbuf
  lda wh_t
  beq wt_r
  dec wh_t
  bne wt_r
  ldx #31
: lda NT0+6*32,x
  sta whbuf,x
  dex
  bpl :-
q_whbuf:
  lda #$20
  sta ptr2+1
  lda #$C0
  sta ptr2
  lda #32
  jsr q_open
  bcc :+
  lda #1
  sta wh_q                 ; next frame, then
  rts
: lda #0
  sta wh_q
  ldy #0
: lda whbuf,y
  sta qbuf,x
  inx
  iny
  cpy #32
  bne :-
  jmp q_close
wt_r:
  rts

; ---- the palette: a white flash when you hit something, fading to the white of the storm after
fade_pal:
  lda flash
  lsr a
  lsr a
  lsr a
  lsr a
  lsr a
  lsr a                    ; 0..3
  sta t0
  lda state
  cmp #2
  bne :+
  lda deadt
  lsr a
  lsr a
  lsr a
  lsr a
  lsr a
  cmp t0
  bcc :+
  sta t0
: lda t0
  cmp fadel
  beq @r
  sta fadel
  ldx #31
@c:
  lda INIT_PAL,x
  ldy t0
  beq @s
: jsr lighter
  dey
  bne :-
@s:
  sta pal,x
  dex
  bpl @c
  inc pal_dirty
@r:
  rts
lighter:                   ; one grey lighter: 0F -> 00 -> 10 -> 30
  cmp #$0F
  bne :+
  lda #$00
  rts
: cmp #$30
  beq :+
  clc
  adc #$10
  cmp #$20
  bne :+
  lda #$30
: rts
