# Tiny Swords selected assets

Source assets for Tiny Swords. Runtime art lives inside the canonical Godot
project in `godot/tiny-swords`; this raw collection is never copied to `_site`.

## Distribution and notices (checked 5 October 2026)

This import is **Tiny Swords (Free Pack)**, not `TS_old version_CC0 Licensed`.
The publisher distinguishes those downloads on the
[Tiny Swords page](https://pixelfrog-assets.itch.io/tiny-swords).
The current Free Pack terms permit personal/commercial game use and modification,
make credit optional, and prohibit standalone redistribution, resale or repackaging,
including modified assets. Edenia delivers art as resources in its Godot game pack;
it excludes this raw asset directory, editor previews, test resources and obsolete
chicken reference frames from hosting. Do not offer the art as a downloadable pack.

Pixel Frog created the pack artwork. Edenia's separated cloud/shadow layers, UI
slices and axe icon derive from it. The chicken is a separate supplied CHICKEN4.0
image, with idle/eating/run adaptations generated using imagegen and the pack's
sheep motion as references; imported on 4 October 2026. Its source provenance is
`/Users/brice/Downloads/chicken-4.0-sprites/README.md`; it is not advertised as
Pixel Frog's original art or part of the Free Pack license grant.

The versioned game directory contains `notices/ASSET-PROVENANCE.md`, the Godot
4.7.2 MIT license and complete third-party copyright/license collection, and
MedievalSharp's SIL Open Font License with its copyright/reserved-name statement.
The font is Wojciech Kalinowski's MedievalSharp from
[Google Fonts](https://github.com/google/fonts/tree/main/ofl/medievalsharp).
See [Godot licensing](https://godotengine.org/license/) and
[license compliance](https://docs.godotengine.org/en/stable/about/complying_with_licenses.html).

Source: `/Users/brice/Downloads/Tiny Swords (Free Pack)`.
Imported on 2026-09-28. This pack matches the requested category names and UI
numbering. No assets from `Tiny Swords (Update 010)` or the ZIP archives were
mixed in. Original category paths and filenames are preserved, including the
source's nested `UI Elements/UI Elements` directory. Downloads remain untouched.

| Category | PNG files | Included selection |
| --- | ---: | --- |
| Units | 100 | Pawns only: Black, Blue, Purple, Red, Yellow; 20 animation sheets per color |
| Buildings | 15 | Black, Blue, Purple, Red, Yellow; `House1.png`, `House2.png`, `House3.png` per color |
| Terrain/Tileset | 8 | Five tilemap colors, shadow, water background, water foam |
| Terrain/Decorations | 21 | Bushes, clouds, rocks, rocks in water, rubber duck |
| Terrain/Resources | 31 | Gold, meat/sheep, tools, wood/trees; available highlights included |
| Particle FX | 8 | Two dust, two explosion, three fire sheets, water splash |
| UI Elements | 77 | Complete folder: bars, buttons, papers, icons, cursors, avatars, swords, wood tables, banners and ribbons, including store-page banners |
| **Total** | **260** | **1,811,394 bytes of image data** |

Each pawn color includes idle/run sheets with no tool or with axe, gold, hammer,
knife, meat, pickaxe, or wood, plus interact sheets for axe, hammer, knife, and
pickaxe. All supplied pawn PNGs are included.

The three supplied house images were visually checked: House1 is the entrance
view, House2 an angled entrance/side view, and House3 the side view. These are
the pack's available house views; no additional rotations or mirrored variants
were generated.

Only usable PNG assets were copied; macOS `.DS_Store` metadata is excluded.
Other unit/building types remain excluded. On 2026-09-29, the complete UI Elements
folder was added, preserving its hierarchy and all 77 PNGs (71 newly added).

Verification: all UI copies match their source SHA-256 hashes, and PNG signatures
and chunk checksums pass. The original 189-asset import was verified the same way.
