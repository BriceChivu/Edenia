# Isometric pixel-town study — second pass

[Decision ticket](https://github.com/BriceChivu/Edenia/issues/347) remains open.

The owner's response to the first overhead pass was: "I do not like it much. I think it's quite far from the quality of Pokemon." The owner set the classic Pokémon-like overhead direction aside for now and requested pixel-art reinterpretations of the existing town visuals, limited to two stages with two or three lighting treatments each.

This pass contains **stage 2 and stage 12, each at day (13:00), sunset (18:30), and night (22:00)**. It preserves the existing isometric direction, rounded stone islands, cream cottages, orange/purple tiled roofs, arched front doors, flowering trees, dock and boat, pool island, playground, garden and volcano. The early town is shown larger for detail review. The mature town follows the original broad island arrangement. Both are still studies, with no animation, arbitrary clock interpolation or intermediate stages in this pass.

## Review

From the prototype branch, run `npm run prototype:pixel-town` and open:

http://localhost:4187/prototype/pixel-town/isometric/?stage=12&light=day

Switch between the two stages and three lighting presets. Below the main view are an original-versus-study comparison and all six views. Entire scenes fit at narrow widths; physical-phone legibility and production layout remain unapproved.

`art.js` generates original integer-grid shapes and material details directly with Canvas: isometric planes, scanline polygons, individual roof tiles, masonry courses, foliage clusters, pixel reflections and palette-specific lighting. It does not sample, downscale or filter the existing raster artwork. Source images appear only in the labelled reference panel.

## Evidence and limits

Chromium rendered all six fixtures without browser errors. Inspected layout at 320, 390, 768 and 1440 CSS-pixel widths without horizontal overflow. Stage/lighting buttons update URL state and survive reload. Captures are in `captures/`. These checks establish a runnable review artifact, not artwork acceptance, performance acceptance, device testing or production integration.

The previous overhead study is retained at the parent route and original commit for provenance. This directory is excluded from the production site's explicit build copy list. No production source, learner progress, backend configuration or deployment is changed.

Owner reaction to this second pass: pending.
