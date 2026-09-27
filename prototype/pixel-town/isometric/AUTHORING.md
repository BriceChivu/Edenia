# Production authoring requirements

The owner approved the animated isometric prototype at `238297c`, with the explicit requirement that design, animation and levels remain easy to improve incrementally. This file is an implementation handoff, not a claim that the throwaway renderer already has these modules.

## Keep ordinary edits local

| What changes | Where it belongs | What should stay untouched |
| --- | --- | --- |
| Roof tiles, door shape, tree crown | Reusable named artwork definition/drawing module | Scene layouts, animation scheduling, learner state |
| Island placement or a new visual stage | Declarative stage definition using stable landmark IDs and transforms | Renderer and existing stage definitions |
| Sunset colors or time transition | Named material palette and local-time lighting module | Object geometry and level selection |
| Smoke speed, foliage amplitude, water cycle | Named effect definition with bounded parameters and affected regions | Static artwork, unrelated effects, app integration |
| Cached patches, drawing cadence, pause/disposal | Renderer runtime module | Level content and learner progression |

Use a small application-facing interface that accepts the selected visual stage, clock/lighting input and motion preference, and supports updates and disposal. Hide cache generation, cancellation, visibility handling and drawing order inside the town renderer. Deterministic preview fixtures supply time/phase directly. Use the same scene definitions for live town, historical town, onboarding and fallback stills.

Keep the numeric study thresholds and earned-level selection in the existing progression module. Defining a new visual stage must not itself change learner rewards, thresholds, history, or saved data. Any future progression extension is a separate deliberate product change.

Avoid a giant render function containing stage-number conditionals, duplicated houses per stage, or animation constants embedded in drawing primitives. Prefer named materials and shared landmark assets, parameterized only where real variants exist. Do not introduce a generic game engine, plugin framework or one-line wrapper hierarchy.

## Authoring workflow

Retain a developer-only preview with stage, time/preset, motion/still and phase inputs plus phone/desktop framing. Keep the approved prototype as a pinned visual reference. Document concrete recipes: edit a roof; tune smoke; add a stage from existing landmarks; add a new landmark. Validate stage references/IDs and invalidate caches when relevant content changes.

Before accepting the implementation, demonstrate that a new preview-only stage can be defined using existing assets without editing the renderer, that an effect can be tuned independently, and that one shared artwork change appears in every intended scene. Keep temporary fixtures out of learner progression. Compare deterministic captures of existing stages to expose unintended changes, and rerun relevant performance checks when art density or effects change.

Exact file names and cache strategy belong to implementation after the performance contract is settled. The required outcome is a documented, narrow edit path for each common change, with a small stable interface for the application.

## Owner-facing asset catalog

Provide a local/developer-only visual catalog backed by the same asset definitions used by the town. The owner must be able to browse recognizable thumbnails, select one item (for example the flowering tree), and work on that item independently.

Each entry has a stable asset ID, plain-language name, source location, supported variants and editable design/motion parameters. Show the selected item at useful pixel scales, under the lighting presets, with still/play controls. Also preview it in an existing town to check scale, occlusion and visual consistency. Show which stages use it.

Distinguish changing a shared asset (updates all its instances) from creating a named variant (only selected scene references change). Make that scope visible before saving. Provide before/after comparison and reset for draft parameter changes. Accepted changes must be reproducible in version-controlled asset definitions, not trapped in browser-only state. Freeform artwork changes can use the linked source and the agent workflow; this does not require a full pixel-painting application.

Acceptance walkthrough: select the flowering tree, adjust one exposed design or breeze parameter, compare before/after in isolation and in the early/mature towns, then save the asset change through the documented source workflow. Only the tree and its dependent previews/caches should change; unrelated artwork, stage layout and learner data must remain intact. The catalog must not load on the ordinary learner route.
