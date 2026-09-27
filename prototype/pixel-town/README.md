# Pixel-town art review — throwaway prototype

Question: Which overhead composition, pixel language, and local-time lighting should carry Edenia's existing town progression?

Decision ticket: [Approve the pixel-town art, lighting, and responsive composition](https://github.com/BriceChivu/Edenia/issues/347).

**Owner verdict: first pass rejected.** The owner did not like this overhead pass and considered it far from Pokémon quality. The overhead direction is set aside for now. See [the second, isometric study](isometric/README.md), which reinterprets the existing town visuals in pixels with only two stages and three lighting treatments. Neither pass is accepted artwork or a production renderer.

## Run

`npm run prototype:pixel-town`

Open http://localhost:4187/prototype/pixel-town/?variant=A . The bottom arrows select A (wide harbor), B (island courtyard), C (north–south islands). Stage, clock, motion and phone-frame settings are URL fixtures. No account, learner state or persistence is used. The town has no interactions; the history buttons outside it are fixture controls.

The isolated route follows the existing prototype directory convention. It reproduces a populated town card, history and study-summary context without mounting the production app or touching live profile services. The production build's explicit copy list excludes this directory. The simulated card is not proof of integration with the actual dashboard.

## Inventory and reuse

Inspected all 13 originals in `images/city/level 0.webp` through `level 12.webp`, and `src/features/city/model.js`. The reference gallery includes every original.

| Stage | Score threshold | Recognizable contribution |
| --- | ---: | --- |
| Initial/loading | — | Open water, no earned landmarks |
| 1 | 0 | Orange-roof home, tree, lantern, mailbox, stone island |
| 2 | 60 | Refreshed roof, dock and boat |
| 3 | 140 | Small connected island |
| 4 | 230 | Main island playground |
| 5 | 320 | Round pool on the small island |
| 6 | 400 | Visiting water birds |
| 7 | 480 | Expanded small island |
| 8 | 570 | Striped deckchair and flowers |
| 9 | 680 | Small orange-roof backyard cottage |
| 10 | 800 | Separate purple-roof neighbor island |
| 11 | 920 | Neighbor's flower garden and fence |
| 12 | 1050 | Separate volcano islet |

Onboarding samples are 1, 4, 8, 12. Historical views reuse the identical stage definition; no new artwork family is needed. This prototype changes no threshold, date, or earned-stage semantics. Initial/loading water is rendered with the same palette. Stages 2 and 12 are the representative early and mature anchors; intervening stages are progression studies, not twelve approved deliverables.

Reusable vocabulary: integer scanline silhouettes; tiled orange/purple roofs; cream masonry; teal doors/windows; three-tone round tree crowns; sandstone shoreline bands; planked bridges/dock; sparse flowers, grass and water marks. Art is generated with code, not sampled from old images or Pokémon assets. Organic rounded islands and existing landmark identities remain, reinterpreted overhead.

## Composition candidates

- A: 480 × 248 desktop harbor; below 600px card width, 288 × 272 phone triangle. Tradeoff: island positions change at the breakpoint.
- B: fixed 288 × 256 courtyard; geography stays stable across sizes. Tradeoff: fuller desktop scene and less water separation.
- C: fixed 288 × 344 north–south arrangement. Tradeoff: taller card, more room between islands.

All landmarks remain in the canvas bounds at the narrowest inspected width, 320px. Nearest-neighbor CSS scaling preserves sharp edges, but fractional display scale can produce uneven pixel widths. Native-device judgement remains necessary before approving the phone density.

## Light and motion

Continuous palette interpolation: 00:00/05:00 cool night, 06:30 peach dawn, 08:00–16:30 day, 18:00 warm amber, 19:00 mauve dusk, 20:30 night. Windows and lamps warm gradually; small broken reflection bands sit below the islands. No location request, astronomy, weather, blur or gradient. The review defaults to a repeatable 18:30 fixture; “Use my clock” samples device-local time. This is not a production wall-clock scheduler.

Still is the default. Gentle mode plays four cached full-scene plates at 4fps, changing sparse water and grass details; it pauses visually when offscreen/hidden and honors system reduced motion. The review-only interval remains scheduled when paused: production timer suspension, patch compositing, offscreen cleanup, performance and battery measurements remain work for the later renderer ticket. Preview plates and gallery can be rebuilt on fixture changes; they are not performance evidence.

## Review evidence

Chromium: all three variants at 320, 390, 768 and 1440 CSS-pixel widths, no page overflow or browser errors. Variant URL survives reload; gentle mode changes pixels; system reduced motion holds pixels still. Captures include phone variants, mature desktop evening, early evening, six clock samples and all stages. These are browser emulations, not physical-phone or production acceptance.

Owner acceptance/rejection/revision requests must be recorded on the decision ticket after actual visual reaction. No production files, deployment, hosted configuration or map resolution is included here.
