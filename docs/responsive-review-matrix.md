# Responsive Review Matrix

This matrix is the approval boundary for intentional responsive changes. The
complete source-defined experience in
[`current-experience-inventory.md`](current-experience-inventory.md) remains the
authoritative preservation catalog; every inventory row is **Keep** unless an
individual row is explicitly approved here in a later migration entry.

## Status meanings

- **Keep:** Preserve the current result at every applicable width and input
  capability.
- **Candidate:** Discuss and compare only. Do not implement or update snapshots.
- **Approved change:** A user-approved difference with a dedicated migration
  identifier, implementation commit, and acceptance evidence.
- **Revisit:** Deliberately unresolved and excluded from implementation.

## Protected responsive outcomes

| Matrix ID | Surface | Phone outcome | Tablet outcome | Desktop outcome | Status |
|---|---|---|---|---|---|
| RESP-001 | Trailer | Current full-viewport, safe-area-aware scenes and navigation | Current non-phone stage and touch behavior | Current reference stage, hover, keyboard, and short-height tuning | Keep |
| RESP-002 | Onboarding and recovery | Current full-height flow, compact choices, and stacked actions | Current centered-card flow | Current centered-card flow | Keep |
| RESP-003 | Header, search, and status | Current scroll-driven compact header and fixed search dialog | Current full header and anchored search | Current full header and anchored search | Keep |
| RESP-004 | Town, goals, streaks, and insights | Current phone aspect ratio, gesture controls, and narrow insight layout | Current tablet geometry and coarse-input behavior | Current wide geometry, hover details, and controls | Keep |
| RESP-005 | Study History | Current compact metrics, full-width controls, and bottom sheets | Current non-phone layout with touch interactions | Current non-phone layout with hover/focus interactions | Keep |
| RESP-006 | Settings, activity, and local data | Current full-screen drawer, sticky header, grouped activity, and touch controls | Current side drawer with coarse-input rules | Current side drawer and fine-pointer controls | Keep |
| RESP-007 | Video toolbar and Add flow | Current Add/Undo/Redo toolbar and bottom-sheet Add flow | Current full filters and anchored Add flow | Current full filters and anchored Add flow | Keep |
| RESP-008 | Next Study card | Current narrow-card link behavior and hidden actions at the existing boundary | Current full card controls | Current full card controls and focus layer | Keep |
| RESP-009 | Channel shelves and ordering | Current touch scrolling, direct thumbnail opening, and pointer ordering | Current touch/fine-pointer capability behavior and tap preview where applicable | Current arrows, hover/focus preview, and native drag ordering | Keep |
| RESP-010 | Video cards, Watched, and player | Current card density, compact Watched layout, and player geometry | Current tablet grid, preview, and player behavior | Current desktop grid, preview, and player behavior | Keep |
| RESP-011 | Popovers, prompts, feedback, and toasts | Current fixed or bottom-sheet presentation and safe areas | Current capability-appropriate anchored/modal presentation | Current anchored/modal presentation | Keep |
| RESP-012 | Walkthroughs and transient focus | Current phone targets, placement, header handling, and touch sizing | Current tablet targets and viewport clamping | Current desktop targets, placement, and focus behavior | Keep |
| RESP-013 | Localization and themes | Current five-locale layout overrides and light/dark surfaces | Current five-locale layout overrides and light/dark surfaces | Current five-locale layout overrides and light/dark surfaces | Keep |
| RESP-014 | Accessibility and input | Current touch targets, focus, keyboard, reduced motion, and semantics | Current coarse/fine capability behavior | Current hover, fine-pointer, keyboard, reduced motion, and semantics | Keep |

The grouped rows above do not replace the detailed inventory IDs. They make the
review boundary easier to scan while all inventory states, empty/error cases,
content ordering, storage behavior, analytics, and accessibility details remain
protected.

## Candidates requiring explicit review

These are discussion prompts only. They do not authorize implementation.

| Candidate ID | Possible alignment to compare | Protected current behavior | Decision needed |
|---|---|---|---|
| CAND-001 | Make selected component layouts react to their container instead of only the viewport while reproducing the same rendered result | All existing breakpoints, cascade, and phone/tablet/desktop outcomes | Approve one named component only after side-by-side evidence is available |
| CAND-002 | Compare exposing tablet-style status/channel filtering on phone | Phone currently hides those filters while preserving Add and Undo/Redo | Approve exact controls, ordering, and compact behavior |
| CAND-003 | Compare tablet-style Next Study actions on narrow phones | At the current narrow boundary the whole card opens playback and secondary actions are hidden | Approve exact actions and space/touch treatment |
| CAND-004 | Compare selected tablet shelf controls or density on phone | Phone currently uses direct thumbnail opening, hidden arrows, touch scrolling, and its own card density | Approve each shelf interaction or spacing difference separately |

Candidate comparison work must not modify production source or snapshots. A
candidate becomes implementable only after the user changes its status to
**Approved change** and the ledger records the exact intended difference.

## Approved changes

None. The architecture migration contains no intentional responsive visual or
behavioral changes.

## Revisit

| Matrix ID | Item | Reason |
|---|---|---|
| REVISIT-001 | Browser and visual acceptance against the `v1.0.0` reference | Excluded from this task by the repository instruction not to validate through a browser or local UI |
| REVISIT-002 | Candidate comparison screenshots and snapshot updates | Requires a later, explicitly authorized visual-review task |

## Structural ownership now in place

- Page and full-screen responsive rules:
  `src/styles/96-responsive-page-flows.css`
- Coarse-input and touch-target rules:
  `src/styles/97-responsive-input.css`
- Phone component composition:
  `src/styles/98-responsive-phone.css`
- Tablet, desktop, capability, and reduced-motion rules:
  `src/styles/99-responsive-wide.css`
- Named JavaScript capability decisions:
  `src/core/responsive-capabilities.js`

This ownership split is structural only. It does not change the protected
responsive result.
