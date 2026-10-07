"""Compose the original Wood pawn and chicken pixels. Requires Pillow.

The mask removes ONLY the log; both characters retain their source artwork.
No generated redraws, palette changes or filtered resampling.
Run from anywhere with Python/Pillow; assets are located relative to this file.
"""
from pathlib import Path
from PIL import Image, ImageOps, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PAWN = ROOT / 'Tiny Swords (Free Pack)/Units/Blue Units/Pawn'
BIRD = Image.open(ROOT / 'assets/chicken/chicken_idle.png').convert('RGBA')
OUT = ROOT / 'assets/pawn'
OUT.mkdir(exist_ok=True)
# These four colors belong only to the log, never the pawn's hat or gloves.
WOOD_COLORS = {(180, 129, 80, 255), (134, 99, 83, 255),
               (101, 72, 72, 255), (218, 181, 112, 255)}
OUTLINE = (22, 28, 46, 255)
# A distinctive log highlight measures each pose's authored bob and sway.
GOLD = (218, 181, 112, 255)

def log_anchor(frame):
    points = [(x, y) for y in range(58, 99) for x in range(73, 133)
              if frame.getpixel((x, y)) == GOLD]
    return (round(sum(x for x, y in points) / len(points)),
            round(sum(y for x, y in points) / len(points)))

reference = Image.open(PAWN / 'Pawn_Idle Wood.png').convert('RGBA').crop((0, 0, 192, 192))
anchor = log_anchor(reference)
for kind, count in [('Idle', 24), ('Run', 12)]:
    source = Image.open(PAWN / f'Pawn_{kind} Wood.png').convert('RGBA')
    hat_source = Image.open(PAWN / f'Pawn_{kind}.png').convert('RGBA')
    pawn_count = source.width // 192
    atlas = Image.new('RGBA', (count * 192, 192))
    for index in range(count):
        pose = source.crop(((index % pawn_count) * 192, 0, (index % pawn_count + 1) * 192, 192))
        at = log_anchor(pose)
        dx, dy = at[0] - anchor[0], at[1] - anchor[1]
        mask = Image.new('L', (192, 192))
        for y in range(54, 102):
            for x in range(66, 140):
                if pose.getpixel((x, y)) in WOOD_COLORS:
                    mask.putpixel((x, y), 255)
        perimeter = mask.filter(ImageFilter.MaxFilter(5))
        for y in range(52, 104):
            for x in range(64, 142):
                if perimeter.getpixel((x, y)) and pose.getpixel((x, y)) == OUTLINE:
                    mask.putpixel((x, y), 255)
        # Preserve the original tan gloves and their one-pixel outline.
        hands = Image.new('L', (192, 192))
        for y in range(83 + dy, 100 + dy):
            for x in range(74 + dx, 131 + dx):
                if pose.getpixel((x, y)) == (200, 168, 118, 255):
                    hands.putpixel((x, y), 255)
        hands = hands.filter(ImageFilter.MaxFilter(3))
        original_hands = pose.copy()
        pose.paste((0, 0, 0, 0), mask=mask)
        # Restore the original unladen hat where the log used to occlude it.
        # This fills the gap behind the bird without inventing any pawn pixels.
        hat = hat_source.crop(((index % pawn_count) * 192, 0,
                               (index % pawn_count + 1) * 192, 192))
        for y in range(52, 99):
            for x in range(64, 142):
                if mask.getpixel((x, y)) and hat.getpixel((x, y))[3]:
                    pose.putpixel((x, y), hat.getpixel((x, y)))
        # The same 59.5% nearest-neighbor chicken used in-game, facing the pawn's direction.
        bird_frame = (index // 2 if kind == "Run" else index) % 6
        bird = BIRD.crop((bird_frame * 128, 0, (bird_frame + 1) * 128, 128))
        bird = ImageOps.mirror(bird).resize((76, 76), Image.Resampling.NEAREST)
        pose.alpha_composite(bird, (61 + dx, 33 + dy))
        pose.paste(original_hands, mask=hands)
        atlas.alpha_composite(pose, (index * 192, 0))
    atlas.save(OUT / f'chicken_carry_{kind.lower()}.png')
