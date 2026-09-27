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
