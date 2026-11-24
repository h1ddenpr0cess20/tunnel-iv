#!/bin/sh
# Builds tunnel-iv.nes (needs cc65, python3 with numpy and Pillow).
#   tools/assets.py   the picture: storm, road, cab, text, sprites -> build/chr.bin, build/data.inc
#   tools/music.py    the song -> build/music.inc
# The sprites come from captures of the remastered game's models in build/models (tools/capture/README).
set -e
cd "$(dirname "$0")"
[ -n "$SKIP_ASSETS" ] && [ -f build/chr.bin ] || python3 tools/assets.py
python3 tools/music.py
ca65 -g -I build --bin-include-dir build -o build/main.o src/main.s
ld65 -C nes.cfg -o tunnel-iv.nes build/main.o -Ln build/tunnel-iv.lbl
mkdir -p ../public
cp tunnel-iv.nes ../public/tunnel-iv.nes
echo "built $(pwd)/tunnel-iv.nes ($(wc -c < tunnel-iv.nes) bytes)"
