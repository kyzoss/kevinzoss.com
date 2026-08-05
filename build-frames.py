#!/usr/bin/env python3
"""Render each clip to a WebP frame sequence for phones.

iOS will not reliably scrub a <video>: seeking only paints after a gesture-primed
play/pause, and nine decoders at once is more than a phone wants to hold. Swapping
an <img> src through pre-decoded frames has none of that failure surface, costs
about the same bytes as the mobile mp4s, and is smooth by construction.
"""
import subprocess, tempfile, pathlib, glob, os, shutil
from PIL import Image

FFMPEG  = "/opt/homebrew/bin/ffmpeg"
FFPROBE = "/opt/homebrew/bin/ffprobe"
WIDTH, QUALITY = 820, 72
SEGMENTS = [("cleveland", 48), ("conn1", 32), ("shoe", 48), ("conn2", 32),
            ("la", 48), ("conn3", 32), ("venice", 48), ("conn4", 32), ("yard", 48)]

root = pathlib.Path(__file__).parent
out_root = root / "assets" / "seq"
total = 0

for name, n in SEGMENTS:
    src = root / "assets" / "vid" / f"{name}.mp4"
    dur = float(subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration",
                                "-of", "csv=p=0", str(src)],
                               capture_output=True, text=True).stdout.strip())
    out = out_root / name
    if out.exists(): shutil.rmtree(out)
    out.mkdir(parents=True)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([FFMPEG, "-v", "error", "-i", str(src),
                        "-vf", f"fps={n}/{dur}", "-q:v", "2", f"{tmp}/f_%03d.jpg", "-y"], check=True)
        jpgs = sorted(glob.glob(f"{tmp}/*.jpg"))[:n]
        for i, f in enumerate(jpgs):
            im = Image.open(f).convert("RGB")
            im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
            im.save(out / f"{i:03d}.webp", "WEBP", quality=QUALITY, method=5)
    kb = sum(p.stat().st_size for p in out.glob("*.webp")) // 1024
    total += kb
    print(f"  {name:10s} {len(list(out.glob('*.webp'))):3d} frames  {kb:5d}KB")

print(f"  TOTAL {total//1024}MB across {out_root}")
