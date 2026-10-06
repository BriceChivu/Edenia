# CHICKEN4.0 animation sheets

Created from `/Users/brice/Downloads/CHICKEN4.0.png` with the built-in imagegen tool, using Tiny Swords sheep animation sheets as movement references. The final sheets were normalized with the user's approval. Full generation prompts are in `prompts.json`; original generated sheets remain in `generated/`.

| Sheet | Frames | Dimensions | Loop at 10 fps |
| --- | --- | --- | --- |
| chicken_idle.png | 6 | 768 × 128 | 0.6 seconds |
| chicken_eating.png | 12 | 1536 × 128 | 1.2 seconds |
| chicken_run.png | 4 | 512 × 128 | 0.4 seconds |

Every frame is a 128 × 128 transparent cell, read left to right. The chicken faces left; mirror it for rightward movement. The standing ground baseline is y=103; running retains a small rise/fall. All sheets use hard alpha and nearest-neighbor sizing.

Open `preview.html` for playback, slower motion, mirroring, and a checkerboard transparency view. `animation-preview.gif` shows the three loops together. `sprites.json` records the atlas layout.

Sheep motion study: idle uses six poses with a stable 45 × 44 pixel silhouette; grazing uses twelve poses, with the lowered head extending sideways while the body and bottom remain nearly fixed; movement uses four poses with a roughly seven-pixel height change. All play at 10 fps. Chicken idle uses gentle breathing and a blink; eating translates the grazing rhythm into three ground pecks; run uses alternating legs, a tucked airborne pose, and a compressed landing.

These are generated adaptations of the supplied chicken, with small shape/detail differences between poses. No Edenia gameplay assets or code were replaced.
