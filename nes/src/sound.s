; ---------------------------------------------------------------------------- sound
; The band (see tools/music.py) and the truck. Called once a frame from the NMI.

STEP_RATE = 13470          ; 65536 / 4.865 frames a sixteenth (185 beats a minute)

sound_init:
  lda #$0F
  sta $4015
  lda #$30
  sta $4000
  sta $4004
  sta $400C
  lda #$80
  sta $4008
  lda #$08
  sta $4001
  sta $4005
  lda #$FF
  sta l_hi
  sta t_hi
  lda #0
  sta mus_on
  rts

sound_toggle:
  lda muted
  eor #1
  sta muted
  rts

sound_start_run:           ; rolling out: the band counts in from the top
  lda #0
  sta mbar
  sta mstep
  sta macc
  sta macc+1
  sta dive
  sta l_vol
  sta t_vol
  jsr load_bar
  lda #1
  sta mus_on
  rts

sound_over:
  lda #0
  sta mus_on
  rts

sound_pause:
  rts

load_bar:                  ; the patterns for bar mbar
  ldx #0
@c:
  ldy mbar
  lda ORDLO,x
  sta snd_ptr
  lda ORDHI,x
  sta snd_ptr+1
  lda (snd_ptr),y
  tay
  txa
  asl a
  tax
  lda PAT_L,y
  sta mp0,x
  lda PAT_H,y
  sta mp0+1,x
  txa
  lsr a
  tax
  inx
  cpx #4
  bne @c
  ldy #0
  lda (mp1),y
  sta t_mode
  rts
ORDLO: .byte <ORD0, <ORD1, <ORD2, <ORD3
ORDHI: .byte >ORD0, >ORD1, >ORD2, >ORD3

sound_update:
  lda snd_ptr              ; (its own temps: the NMI lands anywhere in the main loop)
  pha
  lda snd_ptr+1
  pha
  lda paused
  bne @silent
  lda muted
  bne @silent
  lda mus_on
  beq @nomus
  lda macc
  clc
  adc #<STEP_RATE
  sta macc
  lda macc+1
  adc #>STEP_RATE
  sta macc+1
  bcc :+
  jsr music_step
: jsr lead_frame
  jsr twin_frame
  jsr drum_frame
  jmp @sfx
@nomus:
  jsr dive_frame
  jsr wind_frame
@sfx:
  jsr sfx_frame
  pla
  sta snd_ptr+1
  pla
  sta snd_ptr
  rts
@silent:
  lda #$30
  sta $4000
  sta $4004
  sta $400C
  lda #$80
  sta $4008
  pla
  sta snd_ptr+1
  pla
  sta snd_ptr
  rts

music_step:
  ldy mstep
  iny                      ; (byte 0 of a pattern is its mode)
  ; the lead
  lda (mp0),y
  beq :+
  jsr lead_note
: ldy mstep
  iny
  lda (mp1),y
  beq :+
  jsr twin_note
: ldy mstep
  iny
  lda (mp2),y
  beq :+
  jsr bass_note
: ldy mstep
  iny
  lda (mp3),y
  beq :+
  jsr drum_hit
: inc mstep
  lda mstep
  cmp #16
  bcc @r
  lda #0
  sta mstep
  inc mbar
  lda mbar
  cmp #SONG_BARS
  bcc :+
  lda #SONG_LOOP
  sta mbar
: jsr load_bar
@r:
  rts

; ---- the lead
lead_note:                 ; A = code: note | $80 bend | $40 slide; $FF off
  cmp #$FF
  bne :+
  lda #0
  sta l_vol
  rts
: sta snd_t0
  and #$3F
  tax
  lda PER_L,x
  sta l_tgt
  lda PER_H,x
  sta l_tgt+1
  lda snd_t0
  bmi @bend
  and #$40
  bne @slide
  lda l_tgt
  sta l_per
  lda l_tgt+1
  sta l_per+1
  jmp @go
@bend:                     ; from a whole step under
  dex
  dex
  lda PER_L,x
  sta l_per
  lda PER_H,x
  sta l_per+1
  jmp @go
@slide:                    ; from where it was (the per is still there)
@go:
  lda #12
  sta l_vol
  lda #0
  sta l_age
  rts

lead_frame:
  lda s_pt                 ; the horn has both pulses
  beq :+
  lda s_pk
  cmp #1
  bne :+
  rts
: inc l_age
  ; glide towards the target: per += (tgt - per) / 4
  lda l_tgt
  sec
  sbc l_per
  sta snd_t0
  lda l_tgt+1
  sbc l_per+1
  sta snd_t1
  cmp #$80
  ror snd_t1
  ror snd_t0
  lda snd_t1
  cmp #$80
  ror snd_t1
  ror snd_t0
  lda snd_t0
  ora snd_t1
  bne :+
  lda l_tgt
  sta l_per
  lda l_tgt+1
  sta l_per+1
  jmp :++
: lda l_per
  clc
  adc snd_t0
  sta l_per
  lda l_per+1
  adc snd_t1
  sta l_per+1
: ; the volume: down to 8 and held
  lda l_age
  and #7
  bne :+
  lda l_vol
  cmp #9
  bcc :+
  dec l_vol
: ; vibrato on long notes
  lda l_per
  sta snd_t0
  lda l_per+1
  sta snd_t1
  lda l_age
  cmp #18
  bcc @w
  and #8
  beq :+
  inc snd_t0
  bne @w
  inc snd_t1
  jmp @w
: lda snd_t0
  bne :+
  dec snd_t1
: dec snd_t0
@w:
  lda l_vol
  ora #$70                 ; 25 % duty, constant volume
  sta $4000
  lda snd_t0
  sta $4002
  lda snd_t1
  cmp l_hi
  beq :+
  sta l_hi
  ora #$08
  sta $4003
: rts

; ---- the twin lead, or the rhythm guitar
twin_note:
  cmp #$FF
  bne :+
  lda #0
  sta t_vol
  rts
: sta snd_t0
  and #$3F
  tax
  lda PER_L,x
  sta t_tgt
  sta t_per
  lda PER_H,x
  sta t_tgt+1
  sta t_per+1
  lda #0
  sta t_age
  lda t_mode
  beq @rhythm
  lda snd_t0                   ; twin: bends like the lead
  bpl :+
  dex
  dex
  lda PER_L,x
  sta t_per
  lda PER_H,x
  sta t_per+1
: lda #10
  sta t_vol
  lda #0
  sta t_dec
  rts
@rhythm:
  lda snd_t0
  and #$40
  beq :+
  lda #10                  ; palm-muted: a short thud
  sta t_vol
  lda #$22
  sta t_dec
  rts
: lda #10                  ; let ring
  sta t_vol
  lda #$04
  sta t_dec
  rts

twin_frame:
  lda s_pt
  beq :+
  rts                      ; a sound effect has this pulse
: inc t_age
  lda t_mode
  beq @rh
  ; glide
  lda t_tgt
  sec
  sbc t_per
  sta snd_t0
  lda t_tgt+1
  sbc t_per+1
  sta snd_t1
  cmp #$80
  ror snd_t1
  ror snd_t0
  lda snd_t1
  cmp #$80
  ror snd_t1
  ror snd_t0
  lda t_per
  clc
  adc snd_t0
  sta t_per
  lda t_per+1
  adc snd_t1
  sta t_per+1
  lda t_age
  and #7
  bne @w
  lda t_vol
  cmp #7
  bcc @w
  dec t_vol
  jmp @w
@rh:                       ; decay: t_dec = units a frame (high nibble) / frames a unit (low nibble)
  lda t_dec
  and #$F0
  beq @slow
  lsr a
  lsr a
  lsr a
  lsr a
  sta snd_t0
  lda t_vol
  sec
  sbc snd_t0
  bcs :+
  lda #0
: sta t_vol
  jmp @w
@slow:
  lda t_age
  and #3
  bne @w
  lda t_vol
  beq @w
  dec t_vol
@w:
  lda t_vol
  ldx t_mode
  bne :+
  ora #$30                 ; rhythm: 12.5 % duty, a buzz
  jmp :++
: ora #$70
: sta $4004
  lda t_per
  sta $4006
  lda t_per+1
  cmp t_hi
  beq :+
  sta t_hi
  ora #$08
  sta $4007
: rts

; ---- the bass
bass_note:
  cmp #$FF
  bne :+
  lda #$80
  sta $4008
  rts
: sta snd_t0
  and #$7F
  tax
  lda snd_t0
  bmi :+
  lda #$18                 ; an eighth: the linear counter stops it (~6 frames)
  bne :++
: lda #$FF                 ; held
: sta $4008
  lda TPER_L,x
  sta $400A
  lda TPER_H,x
  ora #$08
  sta $400B
  rts

; ---- the kit
drum_hit:
  tax
  lda DRUM_L-1,x
  sta d_ptr
  lda DRUM_H-1,x
  sta d_ptr+1
  lda #1
  sta d_on
  rts

drum_frame:
  lda s_nt
  beq :+
  rts                      ; a sound effect has the noise
: lda d_on
  bne :+
  jmp wind_frame
: ldy #0
  lda (d_ptr),y
  bne :+
  sta d_on
  lda #$30
  sta $400C
  rts
: ora #$30
  sta $400C
  iny
  lda (d_ptr),y
  sta $400E
  lda #$08
  sta $400F
  lda d_ptr
  clc
  adc #2
  sta d_ptr
  bcc :+
  inc d_ptr+1
: rts

DRUM_L: .byte <DR_KICK, <DR_SNARE, <DR_HAT, <DR_RIDE, <DR_CRASH, <DR_CHINA, <DR_TOM1, <DR_TOM2, <DR_TOM3, <DR_TOM4, <DR_ROLL, <DR_ROLL2, <DR_KICKL
DRUM_H: .byte >DR_KICK, >DR_SNARE, >DR_HAT, >DR_RIDE, >DR_CRASH, >DR_CHINA, >DR_TOM1, >DR_TOM2, >DR_TOM3, >DR_TOM4, >DR_ROLL, >DR_ROLL2, >DR_KICKL
; volume, period (| $80 metallic) a frame; volume 0 ends it
DR_KICK:  .byte 15,12, 13,13, 10,14, 7,15, 4,15, 2,15, 0
DR_KICKL: .byte 12,12, 8,14, 4,15, 0
DR_SNARE: .byte 15,5, 13,6, 11,6, 9,7, 7,7, 5,7, 3,7, 2,7, 1,7, 0
DR_HAT:   .byte 6,0, 3,0, 1,0, 0
DR_RIDE:  .byte 7,$82, 6,$82, 5,$82, 4,$82, 3,$82, 3,$82, 2,$82, 2,$82, 1,$82, 0
DR_CRASH: .byte 13,3, 12,3, 12,3, 11,3, 11,4, 10,4, 10,4, 9,4, 9,4, 8,4, 8,5, 7,5, 7,5, 6,5, 6,5, 5,5, 5,5, 4,5, 4,5, 3,5, 3,5, 2,5, 2,5, 1,5, 1,5, 0
DR_CHINA: .byte 12,$83, 11,$83, 10,$83, 9,$84, 8,$84, 7,$84, 6,$84, 5,$84, 4,$84, 3,$84, 2,$84, 1,$84, 0
DR_TOM1:  .byte 14,8, 12,9, 9,10, 6,11, 3,12, 1,12, 0
DR_TOM2:  .byte 14,9, 12,10, 9,11, 6,12, 3,13, 1,13, 0
DR_TOM3:  .byte 14,10, 12,11, 9,12, 6,13, 3,14, 1,14, 0
DR_TOM4:  .byte 14,11, 12,12, 9,13, 6,14, 3,15, 1,15, 0
DR_ROLL:  .byte 8,6, 5,6, 2,6, 0
DR_ROLL2: .byte 13,5, 9,6, 4,6, 0

; ---- the blizzard round the cab, when nothing else has the noise
wind_frame:
  lda s_nt
  bne @r
  inc wind
  lda wind
  lsr a
  lsr a
  lsr a
  tax
  lda WIND_V,x
  ora #$30
  sta $400C
  lda wind
  lsr a
  lsr a
  lsr a
  lsr a
  lsr a
  tax
  lda WIND_P,x
  sta $400E
  lda #$08
  sta $400F
@r:
  rts
WIND_V: .byte 1,1,2,2,2,3,3,3,3,3,2,2,2,1,1,1, 1,1,1,2,2,2,2,2,3,3,3,2,2,2,1,1
WIND_P: .byte 9,8,8,9,10,9,8,9

; ---- when you crash: the lead dives off the end of the whammy bar
dive_frame:
  lda dive
  beq @off
  dec dive
  lda l_per
  clc
  adc #6
  sta l_per
  bcc :+
  inc l_per+1
: lda l_per+1
  cmp #7
  bcc :+
  lda #0
  sta dive
  jmp @off
: lda dive
  lsr a
  lsr a
  lsr a
  ora #$B0
  sta $4000
  lda l_per
  sta $4002
  lda l_per+1
  cmp l_hi
  beq :+
  sta l_hi
  ora #$08
  sta $4003
: lda #$30
  sta $4004
  rts
@off:
  lda #$30
  sta $4000
  lda s_pt
  bne :+
  sta $4004
: rts

; ---- sound effects
SFX_HORN = 1
SFX_SERVO = 2
SFX_LEAP = 3
SFX_CHIME = 4

sfx_frame:
  lda s_pt
  bne :+
  jmp @noise
: dec s_pt
  bne :+
  lda #$30
  sta $4004
  lda s_pk
  cmp #SFX_HORN
  bne @noise
  sta $4000
  jmp @noise
: lda s_pk
  cmp #SFX_HORN
  bne @sweep
  ; the air horn: two reeds a little out of tune, a third apart
  lda s_pt
  lsr a
  lsr a
  cmp #11
  bcc :+
  lda #11
: ora #$B0
  sta $4000
  sta $4004
  lda #<HORN1
  sta $4002
  lda #<HORN2
  sta $4006
  lda #>HORN1
  cmp l_hi
  beq :+
  sta l_hi
  ora #$08
  sta $4003
: lda #>HORN2
  cmp t_hi
  beq @noise
  sta t_hi
  ora #$08
  sta $4007
  jmp @noise
@sweep:                    ; servos whining up, a leap, a chime
  lda s_pper
  sec
  sbc s_pk
  sta s_pper
  bcs :+
  dec s_pper+1
: lda s_pt
  lsr a
  cmp #8
  bcc :+
  lda #8
: ora #$70
  sta $4004
  lda s_pper
  sta $4006
  lda s_pper+1
  cmp t_hi
  beq @noise
  sta t_hi
  ora #$08
  sta $4007
@noise:
  lda s_nt
  beq @r
  dec s_nt
  bne :+
  lda #$30
  sta $400C
  rts
: lda s_nt
  cmp s_nv
  bcc :+
  lda s_nv
: lsr a
  ora #$30
  sta $400C
  lda s_nper
  ldx s_nk
  beq :+
  ; the whoosh: lower as it goes past
  lda s_nt
  lsr a
  lsr a
  eor #$0F
  and #$0F
: sta $400E
  lda #$08
  sta $400F
@r:
  rts

HORN1 = 1789773 / (16 * 233) - 1   ; A#3, a touch flat
HORN2 = 1789773 / (16 * 294) - 1   ; D4

sfx_horn:
  lda #SFX_HORN
  sta s_pk
  lda #44
  sta s_pt
  rts

pulse_sweep:               ; A = rate, X/Y = start period lo/hi, snd_t0 = frames
  sta s_pk
  stx s_pper
  sty s_pper+1
  lda snd_t0
  sta s_pt
  rts

sfx_servo:
  lda s_pt
  bne :+
  lda #18
  sta snd_t0
  ldx #<400
  ldy #>400
  lda #12
  jmp pulse_sweep
: rts

sfx_leap:
  lda #24
  sta snd_t0
  ldx #<600
  ldy #>600
  lda #16
  jmp pulse_sweep

sfx_chime:
  lda s_pt
  bne :+
  lda #30
  sta snd_t0
  ldx #<120
  ldy #>120
  lda #0
  jmp pulse_sweep
: rts

noise_fx:                  ; A = frames, X = period, Y = loudness x 2
  sta s_nt
  stx s_nper
  sty s_nv
  lda #0
  sta s_nk
  rts

sfx_crash:
  lda #0
  sta mus_on
  lda #90
  ldx #12
  ldy #30
  jsr noise_fx
  lda #60
  sta dive
  rts

sfx_plow:
  lda #26
  ldx #10
  ldy #28
  jmp noise_fx

sfx_scrape:
  lda #20
  ldx #3
  ldy #18
  jmp noise_fx

sfx_whoosh:
  lda s_nt
  bne :+
  lda #22
  ldx #4
  ldy #22
  jsr noise_fx
  lda #1
  sta s_nk
: rts
