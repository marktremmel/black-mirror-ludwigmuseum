"""Curate + shrink the sticker packs into site/img/stickers (WebP, trimmed, <=360px).
Run: python3 tools/build_stickers.py
"""
import glob, json, os, unicodedata, zipfile, io
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ST = os.path.join(ROOT, 'stickers')
OUT = os.path.join(ROOT, 'site', 'img', 'stickers')
import shutil
shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT, exist_ok=True)

GRUNGE = sorted(glob.glob(os.path.join(ST, "Designsoup's Urban Grunge decal pack V1.1/Individuals/*/*.png")))
GRAFFITI = GRUNGE[1:40]  # all tags except decal1 ('SEX'), it's a school app
GRUNGE_PICK = [40, 41, 42, 44, 45, 46, 47, 49, 50, 51, 53, 54, 70, 73, 80, 81, 87, 92, 103, 104, 105, 114, 127, 128, 151]
ERIKARI_PICK = ['objects/phone-golden.png', 'objects/key-golden.png', 'objects/lantern.png', 'objects/chandelier-gold.png',
                'objects/bell-silver.png', 'objects/teapot.png', 'objects/boook-front-red.png', 'objects/feather-pen.png',
                'others/booh-1.png', 'others/booh-2.png', 'others/booh-3.png', 'others/booh-4.png', 'others/crown-small.png',
                'others/heart-shaped-cloud.png', 'glass/glass-bottle-2.png', 'plants/red-roses-group.png',
                'square-frames/rectangular-frame-gold.png', 'banners/rectangular-banner-2.png', 'decorated-arrows/decorated-arrow-red.png']

def nfc(p): return unicodedata.normalize('NFC', p)

packs = [
    ('graffiti', 'Graffiti', GRAFFITI, 'Decals by Designsoup (Urban Grunge decal pack)'),
    ('capy', 'Capybaras', sorted(glob.glob(os.path.join(ST, 'Cute_Capybara_* Background Removed.png'))), None),
    ('cyber', 'Cyber beasts', sorted(glob.glob(os.path.join(ST, 'cyber-cutout/Cyberpunk *.png'))), None),
    ('signs', 'Warnings & street', [GRUNGE[i] for i in GRUNGE_PICK], 'Decals by Designsoup (Urban Grunge decal pack)'),
    ('cursed', 'Cursed', sorted(glob.glob(os.path.join(ST, 'Cursed_3set_Assets/*.png'))), 'Cursed sticker set by Ash N Ink (@AshNInk)'),
    ('moods', 'Moods', sorted(glob.glob(os.path.join(ST, 'bubloopack/*.gif'))), None),
    ('manga', 'Manga', sorted(glob.glob(os.path.join(ST, 'Manga Discord Stickers (320 x 320 px)(1)/*.png')), key=lambda p: int(os.path.basename(p)[:-4])), None),
    ('aria', 'Aria', sorted(glob.glob(os.path.join(ST, 'Aria Stickers (320 x 320 px)/*.png')), key=lambda p: int(os.path.basename(p)[:-4])), None),
    ('planets', 'Planets', sorted(glob.glob(os.path.join(ST, 'planetswface/*.png'))), None),
    ('vintage', 'Vintage bits', ERIKARI_PICK, 'erikari lovely stickers'),
]

manifest = []
total = 0
ez = zipfile.ZipFile(os.path.join(ST, 'erikari-lovely-stickers.zip'))
for key, label, files, credit in packs:
    os.makedirs(os.path.join(OUT, key), exist_ok=True)
    items = []
    for i, f in enumerate(files):
        im = Image.open(io.BytesIO(ez.read(f))) if key == 'vintage' else Image.open(f)
        im = im.convert('RGBA')
        bb = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
        if bb: im = im.crop(bb)
        im.thumbnail((360, 360), Image.LANCZOS)
        name = f'{key}-{i:02d}.webp'
        path = os.path.join(OUT, key, name)
        im.save(path, 'WEBP', quality=80, method=6)
        total += os.path.getsize(path)
        items.append(f'img/stickers/{key}/{name}')
    manifest.append({'id': key, 'label': label, 'credit': credit, 'items': items})

json.dump(manifest, open(os.path.join(ROOT, 'site', 'data', 'stickers.json'), 'w'), indent=0)
print(sum(len(p['items']) for p in manifest), 'stickers,', round(total / 1e6, 2), 'MB')
