.segment "ZEROPAGE"
; ---- sound (zero page)
mus_on: .res 1
muted: .res 1
macc: .res 2
mstep: .res 1
mbar: .res 1
mp0: .res 2                ; this bar's pattern, each channel
mp1: .res 2
mp2: .res 2
mp3: .res 2
l_per: .res 2              ; the lead: where its pitch is, and where it's going
l_tgt: .res 2
l_vol: .res 1
l_age: .res 1
l_note: .res 1
t_per: .res 2              ; the twin / rhythm
t_tgt: .res 2
t_vol: .res 1
t_age: .res 1
t_note: .res 1
t_dec: .res 1
t_mode: .res 1
b_on: .res 1               ; the bass
d_ptr: .res 2              ; the kit: where in a drum's envelope
d_on: .res 1
s_pt: .res 1               ; a pulse sound effect: frames left, kind
s_pk: .res 1
s_pper: .res 2
s_nt: .res 1               ; a noise sound effect
s_nk: .res 1
s_nv: .res 1
s_nper: .res 1
dive: .res 1
wind: .res 1
l_hi: .res 1               ; last high period bytes written (writing them restarts the wave)
t_hi: .res 1
