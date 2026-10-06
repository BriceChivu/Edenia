from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
SPECS = {'idle': (6, 1), 'eating': (6, 2), 'run': (4, 1)}
all_frames = {}
manifest = {'frame_size': [128, 128], 'fps': 10, 'facing': 'left', 'loop': True,
            'ground_anchor': [64, 103], 'animations': {}}

for action, (columns, rows) in SPECS.items():
    source = Image.open(ROOT / 'generated' / f'chicken_{action}.png').convert('RGBA')
    poses = []
    for index in range(columns * rows):
        column, row = index % columns, index // columns
        rectangle = (round(column * source.width / columns), round(row * source.height / rows),
                     round((column + 1) * source.width / columns), round((row + 1) * source.height / rows))
        cell = source.crop(rectangle)
        mask = cell.getchannel('A').point(lambda alpha: 255 if alpha > 128 else 0)
        bounds = mask.getbbox()
        if bounds is None:
            raise ValueError(f'Empty {action} frame {index}')
        cell.putalpha(mask)
        poses.append((cell.crop(bounds), bounds))

    # Match the supplied chicken's 63px body width and 66px standing height.
    # Eating keeps a fixed scale so lowered poses retain their head/body motion.
    # Running retains the generated cycle's rise/fall against a common baseline.
    scale = 63 / poses[0][0].width
    baseline = max(bounds[3] for _, bounds in poses)
    frames = []
    for index, (pose, bounds) in enumerate(poses):
        width, height = round(pose.width * scale), round(pose.height * scale)
        bottom = 103
        if action == 'idle':
            width = 63
            height = [66, 67, 68, 68, 67, 66][index]
        elif action == 'run':
            bottom -= round((baseline - bounds[3]) * scale)
        pose = pose.resize((width, height), Image.Resampling.NEAREST)
        frame = Image.new('RGBA', (128, 128))
        # Keep the torso/tail fixed horizontally while the head reaches left.
        frame.alpha_composite(pose, (92 - width, bottom - height))
        frames.append(frame)

    atlas = Image.new('RGBA', (128 * len(frames), 128))
    for index, frame in enumerate(frames):
        atlas.alpha_composite(frame, (index * 128, 0))
    atlas.save(ROOT / f'chicken_{action}.png')
    all_frames[action] = frames
    manifest['animations'][action] = {'file': f'chicken_{action}.png', 'frames': len(frames),
                                     'columns': len(frames), 'rows': 1,
                                     'duration_seconds': len(frames) / 10}

(ROOT / 'sprites.json').write_text(json.dumps(manifest, indent=2) + '\n')

try:
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 17)
except OSError:
    font = ImageFont.load_default()
preview_frames = []
for time in range(12):
    panel = Image.new('RGB', (600, 360), '#172321')
    draw = ImageDraw.Draw(panel)
    draw.text((25, 16), 'CHICKEN4.0 · 10 fps', font=font, fill='#f6edcf')
    for row, action in enumerate(SPECS):
        x = 100 + row * 200
        draw.text((x - 28, 65), action.upper(), font=font, fill='#f6edcf')
        frame = all_frames[action][time % len(all_frames[action])]
        frame = frame.resize((256, 256), Image.Resampling.NEAREST)
        panel.paste(frame, (x - 128, 88), frame)
    preview_frames.append(panel)
preview_frames[0].save(ROOT / 'animation-preview.gif', save_all=True,
                       append_images=preview_frames[1:], duration=100, loop=0, disposal=2)
print(json.dumps(manifest, indent=2))
