"""Regenerate the bundled Chinese game UI subsets from licensed Noto CJK sources."""
import argparse
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-dir', type=Path, required=True)
args = parser.parse_args()
project = Path(__file__).resolve().parents[1] / 'godot/tiny-swords'
for suffix, locale in [('TC', 'zh-Hant'), ('SC', 'zh-Hans')]:
    font = TTFont(args.source_dir / f'NotoSansCJK{suffix.lower()}-Regular.otf')
    text = (project / f'i18n/{locale}.json').read_text()
    text += ''.join(chr(i) for i in range(32, 383)) + '×−•…'
    sub = subset.Subsetter()
    sub.populate(text=text)
    sub.subset(font)
    for name in font['name'].names:
        if name.nameID in [1, 4, 6]:
            name.string = f'EdeniaNoto{suffix}'.encode(name.getEncoding())
    font.save(project / f'fonts/EdeniaNoto{suffix}.otf')
