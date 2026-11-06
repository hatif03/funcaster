# Funcaster assets (AS1–AS4)

The asset pipeline and generated subset are implemented. Sources remain unchanged in `assets/source/`; the optional glove is derived from the unchanged `public/assets/hand-p1.png`. Output is resolved relative to the script and written to `assets/os/`, with provenance upserted in `assets/CREDITS.json`. No Node dependency or lockfile changes are needed. The owner authorized PR delivery and merge on 6 November after verification.

Run these commands from the repository root (or use an absolute script path):

```sh
python3 -m venv --system-site-packages /tmp/chonks-os-assets
/tmp/chonks-os-assets/bin/python -m pip install Pillow fonttools brotli
/tmp/chonks-os-assets/bin/python scripts/os-assets/prepare.py
```

FFmpeg must have `libvorbis` and `libmp3lame`. The installed macOS Homebrew build on 6 November lacks `libvorbis`. A local alternative is:

```sh
/tmp/chonks-os-assets/bin/python -m pip install imageio-ffmpeg
FFMPEG=$(/tmp/chonks-os-assets/bin/python -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())') /tmp/chonks-os-assets/bin/python scripts/os-assets/prepare.py
```

After shell source changes, refresh the report without regenerating media:

```sh
/tmp/chonks-os-assets/bin/python scripts/os-assets/prepare.py --report-only
npm run test:os
```

`--report-only` recomputes the static module graph and currently used sprite PNGs. `npm run test:os` independently checks the current sizes, paths, source hashes and frame metadata without needing Python or FFmpeg. It includes local server tests and needs loopback networking.

## Generated subset

- Cleaned 1080/2160 WebP wallpapers; 131 base Luna sprite crops plus expanded states and rooted CSS URLs; full icon sheets and small lossless role crops.
- Outlined XP cursors with measured hotspots, plus a lazy **128×128, 10,021-byte** glove with the retained `(0.32,0.09)` fingertip. The source image is never rewritten.
- Twenty-five helper sheets with per-frame timing, normalized Vorbis+MP3 cues, WOFF2 subsets, theme manifest and deterministic credits.
- `craftpix.py` reads selected PNG members directly from the committed ZIP archives and writes `pets/` and `avatars/` under `assets/os/`. It creates no `_extracted` source tree. Five street animals use idle/walk sheets; four seat avatars use idle/moving sheets. `pets.json` and `avatars.json` include frame counts, source animation names, timing, frame rectangles/ink bounds and archive/member hashes.
- Biker, Punk, Cyborg and **Townsperson 4** were inspected on a contact sheet. The chosen townsperson is non-smoking. Its available Walk sheet fills the moving role with `sourceAnimation: "walk"`; no Run sheet is invented. Crow frames are measured **32×32**; the other selected frames are 48×48.

Two complete builds after the final shell-source changes produced **359/359 byte-identical files**, including `assets/CREDITS.json`. [Comparison and SHA-256 hashes](../../docs/evidence/os-build/asset-reproducibility.json) and [current integration evidence](../../docs/OS-BUILD-PROGRESS.md) are recorded.

## Budget and loading

`assets/os/theme/size-report.json` records budgets and exact counted files. The **600,000-byte** limit covers uncompressed shell-owned initial transfer, excluding wallpaper and the existing Socket.IO transport. `initial-files.mjs` walks static imports, including imported core and party artwork helpers, and discovers the sprite images referenced by initial stylesheets. It excludes dynamic window modules and game runtimes. Helper/pet/avatar sheets, optional glove, full icon sheets and audio load lazily. Wallpaper has its own two limits. This is not a measurement of cold-load latency.

The full 48 px icon sheet alone is 728 KB, so initial UI uses role crops through `icons.files`; the original sheet and coordinates are retained. Supplied helper PNGs total 46.98 MB and are loaded on demand. Pet/avatar metadata and lazy byte totals are included in the manifest/report.

Font coverage is measured in `fonts/coverage.json`: Tahoma lacks U+20B9 (₹). The shell uses the existing local Hind font as a fallback, with size/ascent/descent metrics computed from both fonts. All supplied source directories remain inaccessible through HTTP and outside the deployment image; only the generated subset is shipped.
