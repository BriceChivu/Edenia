# Pip visual refinement — design interview

Status: the user confirmed the complete scope with "ok build it". Implemented and browser-validated locally on `codex/pip-internal-story`. No hosted deployment has been performed.

## Confirmed direction

- Source: the easy-English story in `prototype/pip-story/easy.html`.
- Q1: integrate the experience into Edenia's `?internal_test=1` view.
- Q2: lush, slightly overhead pixel art inspired by handheld-game composition, with expressive characters and richer surroundings.
- Q3: contain the entire story experience inside the current town rectangle, including reading, choices, and story controls.
- Q4: Pip replaces the town view in internal-test mode. There is no Town / Pip switch.
- Q5: use game-style paged dialogue and a separate choice panel within the frame. On phones, the choice panel may cover most of the illustration.
- Q6: animate character idles, environmental details, and important actions. Story advancement remains reader-controlled.
- Q7: remember the story's place and choices in this browser, with a separate Restart story control. Choices remain free.
- Every story illustration should be animated. The user's reference is the gentle up-and-down idle movement of Pokemon characters.
- Public path: unchanged. The requested integration targets internal-test mode.

## Observed constraints

- The existing town viewport uses `1672 / 720` above 640px and `1672 / 1080` at or below 640px. Preserve these bounds when planning the story panel.
- At a typical 390px phone width, the viewport is approximately 344 by 222px, derived from the current CSS. Long story passages and all choices cannot remain simultaneously visible at comfortable text sizes within that height.
- At a 320px phone width, the viewport is approximately 274 by 177px. Some story states offer four choices; four 44px controls already consume 176px before gaps or navigation. Choice panels therefore need their own overflow or paging behavior at narrow sizes.
- The prototype currently has 43 scene keys plus state-dependent variants and choice outcomes. Its 192 by 32 canvas draws static, mostly generic sketches.
- The new illustrations need to reflect the actual scene and story state: who is present, garden versus lily route, Bram's boat and cargo, nursery outcome, and crossing plan.
- Parents appear only during the opening. Chapter 1 does not reach the willow or reunite the family.
- The current prototype has free choices, Back, Restart, a notebook, and example-path shortcuts. It keeps story state in memory until reload.
- `internal_test=1` is an existing runtime selector; it is not a separate authentication permission.

Sources: `index.html`, `src/core/runtime-environment.js`, `src/styles/40-city.css`, `src/styles/98-responsive-phone.css`, `src/styles/99-responsive-wide.css`, and `prototype/pip-story/easy.html`.

## Settled design tree

1. Integration target: internal-test Edenia — confirmed.
   - Q4: replace the town view.
   - Q7: remember story progress in this browser.
2. Art direction: slightly overhead pixel art — confirmed.
   - Q6: character idles, environment loops, and short key-action animations.
3. Containment: entire experience in the existing town frame — confirmed.
   - Q5: paged dialogue and choice panels.

No product-choice questions remain in the current frontier. The user confirmed the complete scope below.

## Complete implementation scope for final confirmation

- Bring the complete existing easy-English Chapter 1 into Edenia's internal-test town frame. Preserve its wording, branches, freely available choices, and story consequences while splitting narration into readable pages.
- Build a consistent pixel-art world with distinct environments and recognizable characters. Reuse environments where the story revisits a place, with scene-specific staging and props for all story states and meaningful outcomes.
- Animate every scene with gentle, independently timed character and environmental motion. Add brief action animations for important moments such as splashes, Bram's rescue, and crossing. Reading and choice controls remain available without mandatory animation waits. Honor reduced-motion preferences.
- Keep illustrations, narration, choices, Back, notebook, and Restart inside the existing responsive rectangle. Keep text readable. When a choice list cannot fit, allow it to scroll within the choice panel. No automatic whole-page scrolling when advancing the story.
- Resume the saved story and reading position after reload in this browser. Associate progress with the active learner profile and keep Restart limited to the story. Cloud story sync is outside this browser-resume scope.
- Replace the town illustration and its zoom/timeline interactions only in internal-test mode. Preserve study facts, earned town progress, and other Edenia features outside the rectangle. Public mode continues to show the existing town.

## Integration and verification notes

- Mount within `.city-image-wrap` and follow profile activation and access closure. Do not let a previous profile's story remain active after the active profile changes.
- Suspend the town's wheel, drag, pinch, and timeline behavior while Pip is displayed; hiding town imagery alone does not disable wrapper listeners.
- Preserve the existing city calculations and progress displays outside the rectangle. Account for walkthrough targeting and level-up effects that currently refer to or render inside the town viewport.
- Distinguish dialogue-page navigation from story transitions. Back must restore both the correct story state and a coherent reading position.
- Verify complete companion and independent routes, key state-dependent scenes and outcomes, Back, notebook, story restart, and reload resume.
- Verify frame containment and reachable text/choices at 320px, 390px, and wide desktop sizes, plus the 640px/641px aspect-ratio transition. Check keyboard navigation and reduced motion.
- Verify that ordinary public mode retains its town rendering and interactions, and that story actions do not alter study progress.

No ADR is warranted: these visual and panel choices remain readily reversible.

## Implementation

- `src/features/pip-story/story.js`: exact extracted easy-English narrative and transitions.
- `session.js`: compact decision-history replay, reading pagination, and state-specific scene descriptions.
- `renderer.js`: pixel sprites, six environment panels, ambient motion, and short action effects; pauses offscreen and honors reduced motion.
- `index.js` and `story.css`: bounded, keyboard-operable story panel and controls.
- `persistence.js`: browser resume through active-profile persistence, with a local identity-scoped story cache that survives a cloud profile refresh. No cloud story field or provider/schema changes.
- `images/pip/world.png`: generated environment atlas, with prompt provenance in `pip-art-prompt.md`.
- `src/app.js`: internal-only lazy loading, town interaction suspension, and profile-lifecycle cleanup.
- `scripts/build-site.mjs`: separate story script and scoped stylesheet. The ordinary public homepage requests neither these resources nor the atlas.

Experiment: pip-story

Gate: `IS_INTERNAL_TEST` (`?internal_test=1`)

Public path: unchanged in behavior. Shared app bootstrap/build code changed to add the guarded loader; public HTML, shared styles, town assets, and public city interactions retain their existing behavior. Public-mode browser regression coverage checks asset requests and existing screenshots.

## Local validation — 2026-09-25

- Build passed. Full contract suite passed: 1,653 tests. The six focused Pip contracts also passed after the final browser-cache refinement.
- Twelve Pip browser cases passed across desktop and phone: three full chapter routes, public asset exclusion, reading/save/Back/notebook/restart, keyboard activation, animation and reduced motion, and four-choice containment across 320px, 390px, 640px, 641px, and 1440px widths.
- Combined story and existing preservation browser suite: 90 passed, 46 expected project-specific skips. Existing public screenshot assertions passed.
- Four focused public/reading browser checks passed again after the final notebook and cache changes.
- Pure story route sampling reached all 43 scene keys. A captured source hash verifies that the easy-English narrative and transitions remain exact, independent of the untracked original prototype.
- Manually viewed the integrated scene at desktop, 390px, and 320px in the browser. Shortened pages at sentence boundaries and adjusted sprite placement after the first phone inspection.
- `git diff --check` passed.
- These are local checks; they do not claim CI or hosted-browser verification. The local preview is `http://localhost:4187/?internal_test=1`.
- The repository publishes the shared GitHub Pages site on a push to `master`. No commit, push, merge, or deployment was performed for this build.
