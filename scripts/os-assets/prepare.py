#!/usr/bin/env python3
"""Build the supplied Funcaster subset. Run with Python, Pillow, fonttools/brotli and ffmpeg.

Sources are read-only. All generated media stays under assets/os; credits are upserted.
Animations/audio are lazy assets, not part of the shell's initial-transfer budget.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import wave

from PIL import Image, ImageFilter
from fontTools import subset
from fontTools.ttLib import TTFont
from craftpix import prepare as prepare_craftpix

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'docs/plans/build/data'
SOURCE = ROOT / 'assets/source'
OUT = ROOT / 'assets/os'
DATE = '2026-11-06'
CREDITS = []


def read(name):
    return json.loads((DATA / f'{name}.json').read_text())


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def credit(path, modified=True, wallpaper=False):
    CREDITS.append(dict(file=path.relative_to(ROOT).as_posix(),
                        author='Supplied by the owner' if wallpaper else 'NullTale pack; underlying artwork, sounds and fonts © Microsoft Corporation',
                        sourceUrl='' if wallpaper else 'https://nulltale.itch.io/',
                        licence='Owner supplied' if wallpaper else 'Used as supplied; owner confirmed free use, 21 October 2026',
                        attributionRequired=True, modified=modified, dateAdded=DATE))


def wallpaper():
    img = Image.open(SOURCE / 'wallpaper/mumbai-pixelated.png').convert('RGB')
    for target, origin in [((1052,147,1136,183),(942,147,1026,183)),
                           ((1290,682,1350,744),(1220,682,1280,744))]:
        patch = img.crop(origin)
        mask = Image.new('L', patch.size)
        # Two-pixel feather, with a fully replaced interior.
        mask.putdata([round(255 * min(1, min(x+1,y+1,patch.width-x,patch.height-y)/2))
                      for y in range(patch.height) for x in range(patch.width)])
        img.paste(patch, target[:2], mask)
    master = img.resize((4128,2304), Image.Resampling.NEAREST)
    for height, width in [(1080,1935),(2160,3870)]:
        path = OUT / f'wallpaper/mumbai-{height}.webp'
        master.resize((width,height), Image.Resampling.LANCZOS).save(path, quality=90, method=6)
        credit(path, wallpaper=True)


def sprite_atlas():
    atlas = read('atlas')
    sheet = Image.open(SOURCE / 'winxp' / atlas['sheet']).convert('RGBA')
    sprites = {name: {k:v for k,v in box.items() if k != 'states'} for name,box in atlas['sprites'].items()}
    for name, box in atlas['sprites'].items():
        base = name.rsplit('.',1)[0] if name.endswith(('.normal','.active')) else name
        for state, xy in (box.get('states') or {}).items():
            key = f'{base}.{state}'
            if xy['x'] == box['x'] and xy['y'] == box['y'] and key not in sprites:
                continue  # the base sprite already represents this state
            expanded = {**sprites[name], **xy}
            if key in sprites and any(sprites[key][k] != expanded[k] for k in ['x','y','w','h']):
                raise ValueError(f'Conflicting atlas role: {key}')
            sprites[key] = expanded
    variables, classes = [], []
    for name, box in sprites.items():
        x,y,w,h = (box[k] for k in ['x','y','w','h'])
        if not (0 <= x < x+w <= sheet.width and 0 <= y < y+h <= sheet.height):
            raise ValueError(f'Out-of-bounds sprite {name}')
        path = OUT / f'ui/{name}.png'
        sheet.crop((x,y,x+w,y+h)).save(path, optimize=True)
        credit(path)
        key = name.replace('.','-')
        variables.append(f'  --sp-{key}: url("/assets/os/ui/{name}.png");')
        inset = box.get('slice')
        if inset:
            l,t,r,b = inset
            slices = f'{t} {r} {b} {l}'
            widths = ' '.join(f'calc({n} * var(--px, 1px))' for n in [t,r,b,l])
            classes.append(f'.sp-{key} {{ border-style: solid; border-width: {widths}; border-image: var(--sp-{key}) {slices} fill / {widths} / 0 stretch; }}')
        else:
            classes.append(f'.sp-{key} {{ background: var(--sp-{key}) center / 100% 100% no-repeat; }}')
        box['file'] = f'ui/{name}.png'
    (OUT/'ui/luna-sprites.css').write_text(':root {\n'+'\n'.join(variables)+'\n}\n'+'\n'.join(classes)+'\n')
    write_json(OUT/'theme/atlas.json', dict(size=atlas['size'], sprites=sprites, baseRoles=list(atlas['sprites'])))
    return sprites


def icons_and_cursors():
    for size in [16,32,48]:
        path = OUT / f'icons/WinIcons_{size}.png'
        shutil.copyfile(SOURCE / f'winxp/Icons/WinIcons_{size}.png', path)
        credit(path, False)
    # The data table is explicitly row,col; don't confuse it with x,y.
    roles = {name:[value['row'],value['col']] for name,value in read('roles').items()
             if not name.startswith('game.') and 'row' in value}
    sheet = Image.open(SOURCE/'winxp/Icons/WinIcons_48.png')
    for role,(row,col) in roles.items():
        path=OUT/f'icons/{role}.png'
        sheet.crop((col*48,row*48,(col+1)*48,(row+1)*48)).save(path,optimize=True)
        credit(path)
    write_json(OUT/'icons/icons.json', dict(index=read('icons-48'), roles=roles))
    cursors = {}
    for role, value in read('cursors')['roles'].items():
        img = Image.open(SOURCE/'winxp/Cursor'/value['file']).convert('RGBA')
        outline = Image.new('RGBA',img.size,'black')
        outline.putalpha(img.getchannel('A').filter(ImageFilter.MaxFilter(3)))
        path = OUT/f'cursors/{role}.png'
        Image.alpha_composite(outline,img).save(path,optimize=True)
        credit(path)
        cursors[role] = [f'cursors/{role}.png', *value['hotspot']]
    cursors['glove'] = legacy_glove()
    write_json(OUT/'cursors/cursors.json',cursors)
    return roles,cursors


def legacy_glove():
    # Preserve the retained pointer's artwork and fractional fingertip anchor.
    source = ROOT/'public/assets/hand-p1.png'
    image = Image.open(source).convert('RGBA')
    if image.size != (1024,1024):
        raise ValueError(f'Legacy glove dimensions changed: {image.size}; recheck HAND_TIP')
    path = OUT/'cursors/glove.png'
    image.resize((128,128), Image.Resampling.LANCZOS).save(path,optimize=True)
    CREDITS.append(dict(file=path.relative_to(ROOT).as_posix(),
                        author='Existing Funcaster artwork',
                        sourceUrl='https://github.com/hatif03/web3-multiplayer-games/blob/main/public/assets/hand-p1.png',
                        source=source.relative_to(ROOT).as_posix(),
                        sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                        licence='Retained repository artwork, reused per owner build specification',
                        attributionRequired=True,modified=True,dateAdded=DATE))
    return ['cursors/glove.png',128*0.32,128*0.09]


def mascot():
    animations = {}
    for name, value in read('clip')['anims'].items():
        file = f'mascot/clippit/{name.replace(" ","-")}.png'
        path = OUT/file
        shutil.copyfile(SOURCE/'winxp'/value['file'],path)
        credit(path,False)
        animations[name] = dict(file=file,frames=value['frames'],frameDurationsMs=value['frameDurationsMs'],
                                emptyFrames=value['emptyFrames'],loop=name=='idle')
    write_json(OUT/'mascot/clippit.json',dict(id='clippit',frame=[240,240],anchor=[120,232],anims=animations))


SOUNDS = {
    'startup':'Startup','shutdown':'Shutdown','logon':'Logon Sound','logoff':'Logoff Sound',
    'click':'Menu Command','launch':'Start','minimise':'Minimize','restore':'Restore',
    'error':'Error','critical':'Critical Stop','warning':'Exclamation','ding':'Ding',
    'notify':'Notify','balloon':'Balloon','recycle':'Recycle','joined':'Hardware Insert',
    'left':'Hardware Remove','failed':'Hardware Fail','denied':'Pop-up Blocked',
    'finished':'Print complete','invite':'Ringin','invite-sent':'Ringout','edge':'Default',
}


def sounds():
    ffmpeg = os.environ.get('FFMPEG') or shutil.which('ffmpeg')
    if not ffmpeg:
        raise RuntimeError('ffmpeg with libvorbis/libmp3lame is required (or set FFMPEG)')
    encoders = subprocess.check_output([ffmpeg, '-hide_banner', '-encoders'], stderr=subprocess.DEVNULL, text=True)
    if not all(codec in encoders for codec in ['libvorbis','libmp3lame']):
        raise RuntimeError('This ffmpeg lacks libvorbis/libmp3lame; set FFMPEG to a full build (e.g. imageio_ffmpeg.get_ffmpeg_exe()).')
    sound_map = {}
    for cue, name in SOUNDS.items():
        source = SOURCE / f'winxp/Sounds/Windows XP {name}.wav'
        with wave.open(str(source)) as stream:
            import array
            samples = array.array('h',stream.readframes(stream.getnframes()))
            if sys.byteorder != 'little': samples.byteswap()
            peak = max(abs(x) for x in samples)/32768
        gain = min(12, -6 - 20*math.log10(max(peak,1e-9)))
        formats = {}
        for extension, codec in [('ogg',['-c:a','libvorbis','-q:a','2']),('mp3',['-c:a','libmp3lame','-b:a','64k'])]:
            path = OUT / f'sounds/{cue}.{extension}'
            channels = '2' if cue in ['startup','shutdown','logon','logoff'] else '1'
            subprocess.run([ffmpeg,'-v','error','-y','-i',str(source),'-map_metadata','-1',
                            '-fflags','+bitexact','-flags:a','+bitexact','-af',f'volume={gain:.5f}dB','-ac',channels,*codec,str(path)],check=True)
            credit(path)
            formats[extension] = f'sounds/{cue}.{extension}'
        sound_map[cue] = dict(**formats,gainDb=round(gain,3))
    for alias,target in [('open','click'),('close','click'),('menu','click')]:
        sound_map[alias] = sound_map[target]
    for cue in ['countdown','go','win','lose']:
        sound_map[cue] = {'synth':cue}
    write_json(OUT/'sounds/sounds.json',sound_map)
    return sound_map


def fonts():
    report = {}
    for name,family,extra in [('tahoma','Tahoma XP',[0x2013,0x2014,0x2018,0x2019,0x201c,0x201d,0x2022,0x2026,0x20b9]),
                              ('framdit','Franklin Gothic XP',[])]:
        font = TTFont(SOURCE/f'winxp/Fonts/{name}.ttf',recalcTimestamp=False)
        codepoints = list(range(0x20,0x7f))+list(range(0xa0,0x100))+extra
        cmap = font.getBestCmap()
        report[name] = dict(missing=[f'U+{c:04X}' for c in codepoints if c not in cmap],rupee=0x20b9 in cmap)
        options = subset.Options()
        options.recalc_timestamp = False
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=codepoints)
        subsetter.subset(font)
        font.flavor = 'woff2'
        path = OUT/f'fonts/{name}-latin.woff2'
        font.save(path)
        credit(path)
    target = TTFont(SOURCE/'winxp/Fonts/tahoma.ttf')
    fallback = TTFont(ROOT/'public/fonts/hind-f8a983f122.woff2')
    target_x = target['glyf'][target.getBestCmap()[ord('x')]].yMax / target['head'].unitsPerEm
    adjust = target_x / (fallback['OS/2'].sxHeight / fallback['head'].unitsPerEm)
    ascent = 100 * target['hhea'].ascent / target['head'].unitsPerEm / adjust
    descent = -100 * target['hhea'].descent / target['head'].unitsPerEm / adjust
    report['fallback'] = dict(font='Hind', sizeAdjust=round(100*adjust,3), ascentOverride=round(ascent,3), descentOverride=round(descent,3))
    (OUT/'fonts/fonts.css').write_text('''@font-face { font-family: "Tahoma XP"; src: url("./tahoma-latin.woff2") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: "Franklin Gothic XP"; src: url("./framdit-latin.woff2") format("woff2"); font-weight: 400; font-style: italic; font-display: swap; }
@font-face { font-family: "Tahoma XP Fallback"; src: url("/fonts/hind-f8a983f122.woff2") format("woff2"); font-display: swap; size-adjust: SIZEADJUST%; ascent-override: ASCENT%; descent-override: DESCENT%; line-gap-override: 0%; }
'''.replace('SIZEADJUST', f'{100*adjust:.3f}').replace('ASCENT', f'{ascent:.3f}').replace('DESCENT', f'{descent:.3f}'))
    write_json(OUT/'fonts/coverage.json',report)
    return report


def size_report(manifest):
    def size(paths): return sum(p.stat().st_size for p in paths)
    # Initial asset transfer deliberately excludes optional icon sheets, animations and audio.
    eager = [OUT/'theme/theme-manifest.json',OUT/'theme/tokens.css',OUT/'fonts/fonts.css',
             OUT/'fonts/tahoma-latin.woff2',OUT/'fonts/framdit-latin.woff2',
             *(OUT/f'icons/{role}.png' for role in manifest['icons']['roles']),
             OUT/'ui/luna-sprites.css',OUT/'cursors/arrow.png',
             ROOT/'public/fonts/hind-f8a983f122.woff2']
    graph = json.loads(subprocess.check_output(['node', str(ROOT/'scripts/os-assets/initial-files.mjs')], text=True))
    eager = sorted(set([*eager, *(ROOT/path for path in graph)]))
    values = dict(wallpaper1080=(OUT/'wallpaper/mumbai-1080.webp').stat().st_size,
                  wallpaper2160=(OUT/'wallpaper/mumbai-2160.webp').stat().st_size,
                  fonts=size((OUT/'fonts').glob('*.woff2')),sounds=size((OUT/'sounds').glob('*.*')),
                  initialShell=size(eager),lazyMascot=size((OUT/'mascot').rglob('*.png')),
                  lazyPets=size((OUT/'pets').rglob('*.*')),lazyAvatars=size((OUT/'avatars').rglob('*.*')))
    limits = dict(wallpaper1080=1200000,wallpaper2160=3500000,fonts=200000,sounds=800000,initialShell=600000)
    report = dict(bytes=values,limits=limits,initialFiles=sorted(p.relative_to(ROOT).as_posix() for p in eager),
                  note='600 KB bounds uncompressed shell-owned initial files, excluding wallpaper and the existing Socket.IO transport. The static module graph includes imported core/art helpers; dynamic window/game modules, mascot, pet/avatar sheets and audio are lazy. All role icons are conservatively counted; sprite PNGs are counted only when an initial stylesheet references their CSS variable. Unused CSS declarations do not fetch images.')
    write_json(OUT/'theme/size-report.json',report)
    print(json.dumps(report['bytes'],indent=2))
    for key,limit in limits.items():
        if values[key] > limit: raise RuntimeError(f'{key}: {values[key]} bytes exceeds {limit}')
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report-only',action='store_true')
    args=parser.parse_args()
    if args.report_only:
        size_report(json.loads((OUT/'theme/theme-manifest.json').read_text()))
        return
    for folder in ['ui','icons','cursors','sounds','fonts','wallpaper','mascot/clippit','theme']:
        (OUT/folder).mkdir(parents=True,exist_ok=True)
    wallpaper()
    sprites=sprite_atlas()
    roles,cursors=icons_and_cursors()
    mascot()
    craftpix = prepare_craftpix(SOURCE, OUT)
    CREDITS.extend(craftpix['credits'])
    sound_map=sounds()
    coverage=fonts()
    # Token source is code-owned; the generated copy lets the entire asset skin be swapped.
    shutil.copyfile(ROOT/'public/os/theme/tokens.css',OUT/'theme/tokens.css')
    manifest=dict(id='luna',wallpaper={'1080':'wallpaper/mumbai-1080.webp','2160':'wallpaper/mumbai-2160.webp'},
                  sprites='ui/luna-sprites.css',atlas='theme/atlas.json',tokens='theme/tokens.css',
                  icons=dict(sheet48='icons/WinIcons_48.png',sheet32='icons/WinIcons_32.png',sheet16='icons/WinIcons_16.png',cell=48,cols=20,roles=roles,files={role:f'icons/{role}.png' for role in roles}),
                  games=dict(iconSource='artwork(id)',cropMap='/os/icon-crop.js'),cursors=cursors,sounds=sound_map,
                  fonts=dict(ui='fonts/tahoma-latin.woff2',logo='fonts/framdit-latin.woff2',css='fonts/fonts.css'),mascot='mascot/clippit.json',
                  pets=craftpix['pets'],avatars=craftpix['avatars'])
    write_json(OUT/'theme/theme-manifest.json',manifest)
    old=json.loads((ROOT/'assets/CREDITS.json').read_text())
    paths={c['file'] for c in CREDITS}
    write_json(ROOT/'assets/CREDITS.json',[c for c in old if c['file'] not in paths]+sorted(CREDITS,key=lambda c:c['file']))
    size_report(manifest)
    print(f'Generated {len(sprites)} sprites; font coverage: {coverage}')


if __name__ == '__main__':
    try: main()
    except (RuntimeError,subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
