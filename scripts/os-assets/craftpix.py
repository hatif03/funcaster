"""Read the three approved CraftPix archives without extracting or changing sources.

Only the named non-combat animation sheets ship. PNG bytes are copied unchanged;
frame metadata is measured from the actual images, including the 32px crow.
"""
from __future__ import annotations

from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
from zipfile import ZipFile

from PIL import Image

PACKS = {
    'animals': 'craftpix-net-610575-free-street-animal-pixel-art-asset-pack.zip',
    'cyberpunk': 'craftpix-net-856554-free-3-cyberpunk-characters-pixel-art.zip',
    'townspeople': 'craftpix-net-481510-free-townspeople-cyberpunk-pixel-art.zip',
}
PETS = [
    ('dog', 'Dog', '1 Dog', 48),
    ('dog-2', 'Dog 2', '2 Dog 2', 48),
    ('cat', 'Cat', '3 Cat', 48),
    ('cat-2', 'Cat 2', '4 Cat 2', 48),
    ('crow', 'Crow', '7 Bird', 32),
]
AVATARS = [
    ('biker', 'Biker', 'cyberpunk', '1 Biker/Biker_', 'idle', 'run'),
    ('punk', 'Punk', 'cyberpunk', '2 Punk/Punk_', 'idle', 'run'),
    ('cyborg', 'Cyborg', 'cyberpunk', '3 Cyborg/Cyborg_', 'idle', 'run'),
    ('townsperson', 'Townsperson', 'townspeople', '4/', 'Idle', 'Walk'),
]
FRAME_MS = 120


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def prepare(source: Path, output: Path):
    """Write pets/avatars and return manifest paths plus provenance records."""
    archive_files = {name: source / 'craftpix' / filename for name, filename in PACKS.items()}
    archive_hashes = {name: sha256(path.read_bytes()).hexdigest() for name, path in archive_files.items()}
    used = {name: [] for name in PACKS}
    credits = []

    def credit(file, **extra):
        return dict(file=file, author='CraftPix.net', sourceUrl='https://craftpix.net/file-licenses/',
                    licence='CraftPix free-asset licence; owner confirmed free use, 21 October 2026',
                    attributionRequired=True, modified=False, dateAdded='2026-11-06', **extra)

    def sheet(pack, entry, file, cell, source_animation):
        # Read a single approved member, not extractall: no path traversal and no
        # ignored scratch files or promotional fonts enter the source tree.
        with ZipFile(archive_files[pack]) as archive:
            data = archive.read(entry)
        image = Image.open(BytesIO(data)).convert('RGBA')
        if image.height != cell or image.width % cell:
            raise ValueError(f'{entry}: expected a horizontal {cell}px sheet, got {image.size}')
        frame_count = image.width // cell
        expected = 4 if source_animation == 'idle' else 6
        if frame_count != expected:
            raise ValueError(f'{entry}: expected {expected} frames, got {frame_count}')
        rects = []
        for index in range(frame_count):
            crop = image.crop((index * cell, 0, (index + 1) * cell, cell))
            bounds = crop.getchannel('A').getbbox()
            if bounds is None:
                raise ValueError(f'{entry}: empty frame {index}')
            rects.append(dict(x=index * cell, y=0, w=cell, h=cell, inkBounds=list(bounds)))
        target = output / file
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        output_file = f'assets/os/{file}'
        used[pack].append(output_file)
        credits.append(credit(output_file, sourceArchive=f'assets/source/craftpix/{PACKS[pack]}',
                              sourceMember=entry))
        return dict(file=file, sheet=[image.width, image.height], frames=frame_count,
                    frameDurationsMs=[FRAME_MS] * frame_count, frameRects=rects, loop=True,
                    sourceAnimation=source_animation,
                    source=dict(archive=PACKS[pack], member=entry, archiveSha256=archive_hashes[pack],
                                sha256=sha256(data).hexdigest()))

    def sprite(identifier, label, cell, anims):
        # The anchor aligns the lowest opaque source pixel to the taskbar/tile.
        baseline = max(frame['inkBounds'][3] for anim in anims.values() for frame in anim['frameRects'])
        return dict(id=identifier, label=label, frame=[cell, cell], anchor=[cell // 2, baseline], anims=anims)

    pets = {}
    for identifier, label, folder, cell in PETS:
        anims = {state: sheet('animals', f'{folder}/{state.title()}.png',
                              f'pets/{identifier}-{state}.png', cell, state)
                 for state in ['idle', 'walk']}
        pets[identifier] = sprite(identifier, label, cell, anims)
    avatars = {}
    for identifier, label, pack, prefix, idle, run in AVATARS:
        anims = {role: sheet(pack, f'{prefix}{state}.png', f'avatars/{identifier}-{role}.png',
                            48, state.lower()) for role, state in [('idle', idle), ('run', run)]}
        avatars[identifier] = sprite(identifier, label, 48, anims)
        if identifier == 'townsperson':
            avatars[identifier]['selection'] = dict(
                sourceCharacter=4, reviewed='2026-11-06',
                note='Idle and Walk contact-sheet frames reviewed: no cigarette or smoking motion. The run role uses the supplied Walk sheet unchanged.')
    write_json(output / 'pets/pets.json', dict(version=1, frameMs=FRAME_MS, maxVisible=2, pets=pets))
    write_json(output / 'avatars/avatars.json', dict(version=1, frameMs=FRAME_MS,
                                                   seats=[row[0] for row in AVATARS], avatars=avatars))
    for pack in PACKS:
        credits.append(credit(f'assets/source/craftpix/{PACKS[pack]}', outputs=sorted(used[pack]),
                              sha256=archive_hashes[pack]))
    return dict(pets='pets/pets.json', avatars='avatars/avatars.json', credits=credits)
