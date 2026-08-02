# Current Experience Preservation Inventory

> Source-derived baseline from `index.html`, `app.js`, `style.css`, and `README.md`
> on 2026-07-28. The phase-1 harness verifies representative first-run, dashboard,
> Settings, and sandbox states across six viewport profiles; inventory rows beyond
> that representative coverage still require their named acceptance tests.

## Preservation policy

- **Every current experience is `Keep` by default**, including details not explicitly named below.
- `Keep` means preserving appearance, content, order, interaction, accessibility semantics, state effects, analytics effects, and responsive/input variants.
- Architectural work may reproduce an experience with different internals, but may not intentionally change its observable result.
- Omission from this inventory is not permission to change or remove something.
- When source intent is unclear, preserve the current result.
- A row may change only after a separate review moves it from `Keep` to `Approved change`.
- Current absence or dormancy is also protected: refactoring must not accidentally expose obsolete controls.

## Baseline coverage axes

| Axis | Current source-defined contract | Disposition |
|---|---|---|
| Wide desktop | Main application is centered and capped at 1100px from 900px upward. Trailer uses its preserved reference composition from 641px upward, with additional tuning above 1024px. | Keep |
| Tablet/non-phone | Widths from 641px retain the non-phone trailer and shelf architecture. Widths 641–899 use a two-column watched grid. Touch/coarse-pointer tablets receive additional behavior described below. | Keep |
| Phone | `≤640px` activates full-screen trailer, onboarding, and Settings; compact scrolling header; touch-sized controls; fixed/bottom popovers; mobile channel shelves; safe-area handling; and phone-specific feature visibility. | Keep |
| Narrow phone | `≤480px` changes insight, history, Continue Watching, cards, watched layout, city controls, and form layout. `≤420px` applies the narrowest grid fallback. | Keep |
| Short non-phone viewport | At heights `≤720px` and widths `≥641px`, trailer typography, media, and spacing compress without switching to the phone composition. | Keep |
| Fine pointer with hover | Hover/focus shelf previews, hover history popovers, city hover details, native drag-and-drop shelf ordering, and visible hover affordances are enabled. | Keep |
| Coarse pointer/no hover | Tap preview on non-phone devices, horizontally scrollable shelves, touch shelf ordering, persistent remove affordances, suppressed tap-focus outlines, and hidden Anki-specific UI apply independently of width. | Keep |
| Reduced motion | Shelf scrolling becomes immediate; shelf/drop/arrival/reminder animations and card transitions are disabled. | Keep |
| Theme | Light is the default; light/dark selection is saved and updates icons, tokens, cards, prompts, heatmap, insights, and modal surfaces. | Keep |
| Locale | English, Traditional Chinese, Simplified Chinese, Spanish, and French are supported, including dynamic content, attributes, dates, labels, and locale-specific trailer sizing. | Keep |
| Normal mode | Uses normal local state, backups, configuration cookie, search cache, integrations, and production analytics gate. | Keep |
| Internal-test mode | `?internal_test=1` uses isolated state/configuration, preserves the query after onboarding, and labels analytics as internal/test. | Keep |
| Sandbox mode | Available only at the expected localhost sandbox origin, uses isolated demo state, exposes Add day/Reset tools, and avoids live integrations. Invalid sandbox origins redirect away. | Keep |
| Local feedback test | The expected local origin simulates feedback success without sending the production analytics event. | Keep |

## Application shell and first run

| ID | Protected surface or behavior | States and variants to preserve | Risk | Disposition |
|---|---|---|---|---|
| APP-001 | Application boot and visibility | Main app initializes from normalized local state; new users receive default state; main UI is present behind first-run dialogs and made inert as appropriate. | High | Keep |
| APP-002 | Animated background | Full-page physics canvas remains decorative and theme-aware without entering the accessibility tree. | Medium | Keep |
| APP-003 | Mode isolation | Normal, internal-test, and sandbox state, backups, configuration, cache, and analytics contexts remain separate. | High | Keep |
| INTRO-001 | Trailer shell | Five-scene localized trailer with creator identity, social links, scene stage, progress timeline, safe-area positioning, and light/dark presentation. | High | Keep |
| INTRO-002 | Trailer content | Opening, YouTube/Anki progress demonstration, interactive town growth, history/insight demonstration, and final call to action retain their content and order. | High | Keep |
| INTRO-003 | Trailer timing and navigation | Per-scene auto-advance, disabled boundary controls, Previous/Next buttons, final Next removal on phone, Skip, final Start/Return action, and replay behavior. | High | Keep |
| INTRO-004 | Trailer input handling | Left/Right keyboard navigation, Escape behavior, horizontal touch swipe threshold, vertical-scroll preservation, click controls, and focus styling. | High | Keep |
| INTRO-005 | Trailer sound | Procedural intro audio starts when permitted, handles autoplay unlocking, toggles on/off, updates accessible labels, loops, and fades when leaving. | Medium | Keep |
| INTRO-006 | Trailer language picker | Language can change before setup; copy, document language, title, scene layout, city labels, and sound labels update immediately. | High | Keep |
| INTRO-007 | Town scene interaction | Automatic progression through levels 1/4/8/12 and manual selection followed by continued staged progression. | Medium | Keep |
| INTRO-008 | Responsive trailer composition | Non-phone reference-stage scaling, short-height compression, phone full-viewport scenes, safe areas, scrollable scene content, localized size overrides, and reordered feature demonstration. | High | Keep |
| ONB-001 | First-run routing | Fresh users see trailer then personalized onboarding; returning incomplete users resume at the correct step; completed users skip setup. | High | Keep |
| ONB-002 | Language selection | Mandarin, Japanese, Korean, Spanish, French, German, English, and Other remain in the current order with localized labels and single selection. | High | Keep |
| ONB-003 | Level selection | Just starting, Beginner, Intermediate, Advanced, and Not sure remain; English omits Just starting; Continue stays disabled until valid selection. | High | Keep |
| ONB-004 | Other-language path | Other bypasses level/channel recommendations, explains manual channel selection, and uses a two-step progress sequence. | High | Keep |
| ONB-005 | Starter-channel selection | Level-matched recommendations, bundled avatars/fallbacks, initial preselection, maximum five selections, limit warning, empty recommendation state, Back, and Start actions. | High | Keep |
| ONB-006 | Setup loading | Start action becomes disabled and displays the current “Starting…” state while channels resolve and the first refresh runs. | High | Keep |
| ONB-007 | Partial onboarding failure | Total channel-resolution failure leaves the user on onboarding; partial channel and video-refresh failures allow completion and surface localized warnings afterward. | High | Keep |
| ONB-008 | Persistence recovery | Storage/setup recovery dialog, Try again, Copy link, live status messages, resume target, and inert background behavior remain intact. | High | Keep |
| ONB-009 | Post-onboarding transition | Profile, selected channels, setup timestamps, activity entry, notice, integration start, URL cleanup, and first-study walkthrough sequencing remain unchanged. | High | Keep |
| ONB-010 | Responsive onboarding | Desktop/tablet centered card; phone full-height borderless flow, safe areas, two-column language choices, single-column levels/channels, hidden eyebrow/promise where currently hidden, and stacked full-width actions. | High | Keep |

## Settings, local data, and recovery

| ID | Protected surface or behavior | States and variants to preserve | Risk | Disposition |
|---|---|---|---|---|
| SET-001 | Settings modal | Desktop side drawer with overlay versus phone full-screen drawer; sticky phone header; inert main content; initial close-button focus; focus trap; Escape/overlay close; return focus. | High | Keep |
| SET-002 | Language setting | Radio-style locale menu, immediate save, full rerender, activity entry, title/theme refresh, and confirmation toast. | High | Keep |
| SET-003 | Short-video setting | Immediate save, under-three-minute filtering, stored-video repair, enabling-triggered refresh, activity logging, and preserved history. | High | Keep |
| SET-004 | Anki setting | Immediate enable/disable, same-day resume baseline, final refresh when disabling, activity logging, and prior Anki history preservation. | High | Keep |
| SET-005 | Anki device availability | Anki controls, setup instructions, and scoring instructions stay hidden at `≤640px` or on any coarse-pointer device; underlying preference is not rewritten merely because UI is unavailable. | High | Keep |
| SET-006 | Study Insights setting | Visibility can be disabled while insight calculation/history continues; immediate persistence and activity logging remain. | High | Keep |
| SET-007 | How-to accordion | Video action explanations, optional Anki explanation/setup, code sample, and scoring information remain collapsed initially and independently toggleable. | Medium | Keep |
| SET-008 | Activity log | All/User/Auto/Issues/Points filters; actor/status chips; timestamps; details; point-derived entries; empty states; and saved-state event order. | High | Keep |
| SET-009 | Mobile activity log | Consecutive identical automatic Anki entries group with a repeat count; first 20 entries show initially; Show older adds pages of 20. | Medium | Keep |
| SET-010 | Local backups | Empty state, four most recent displayed entries, localized timestamp/reason, Restore action, missing-backup failure, and rollback backup before restore. | High | Keep |
| SET-011 | Sync export | JSON shape, normal/sandbox marker, reminder exclusion, filename convention, and no-progress warning remain compatible. | High | Keep |
| SET-012 | Sync import | File parsing, structural validation, normal/sandbox rejection, rollback backup, state normalization, rerender, integration resync, field reset, and localized failure/success states. | High | Keep |
| SET-013 | Reset | Explicit confirmation, Cancel/Delete actions, rollback backup, state isolation, and unchanged Anki collection contract. | High | Keep |
| SET-014 | Replay actions | Show walkthrough again and Show trailer again retain their current settings placement and return behavior. | Medium | Keep |
| SET-015 | Creator footer | Creator branding and external YouTube, Twitch, and Ko-fi support links remain at the bottom of Settings. | Low | Keep |

## Header, town, progress, and insights

| ID | Protected surface or behavior | States and variants to preserve | Risk | Disposition |
|---|---|---|---|---|
| HDR-001 | Header identity | EDENIA title, localized week label, streak pill, theme, search, Settings, sandbox label, and sandbox tools retain order and grouping. | High | Keep |
| HDR-002 | Streak display | Zero, low, and high streak visual states; fire icon; count; localized text; and sandbox-specific behavior remain. | High | Keep |
| HDR-003 | Phone compact header | Header compacts only after its current scroll thresholds, expands near the top, stays expanded during walkthrough, preserves the compact week label, and hides the current compact-only elements. | High | Keep |
| HDR-004 | Saved-video search | Anchored desktop popover versus fixed phone dialog; initial guidance, live title/channel search, maximum eight ranked results, status metadata, no-results state, keyboard Enter/Escape, outside close, and result jump/flash. | High | Keep |
| HDR-005 | Theme toggle | Moon/sun icon swap, localized title/ARIA label, saved selection, activity entry, and full dark/light surface parity. | High | Keep |
| CITY-001 | Town image | Current stage image, 12-level progression, WebP-first loading, PNG fallback, preload order, placeholder background, loading fade, and localized alt text. | High | Keep |
| CITY-002 | Town pan and zoom | Mouse drag, wheel-centered zoom, buttons, reset, touch pinch, touch pan only while zoomed, 1×–2× limits, and clamped pan. Phone keeps gestures while hiding zoom buttons. | High | Keep |
| CITY-003 | Town timeline | Activity-day waveform, level-change styling, selected day, Today/historical preview, localized tooltip, hover preview, click selection, touch drag, edge auto-scroll, and outside clearing. | High | Keep |
| CITY-004 | Town progress bar | Current/next level labels, milestone points, filled and remaining regions, total-point tooltip, effort-to-next copy, max-level state, and accessible progress attributes. | High | Keep |
| CITY-005 | Level-up claim | Ready state, animated Level up control, one-time guidance, explicit claim, persistent unlocked level, image update, activity entry, and dual-corner confetti. | High | Keep |
| CITY-006 | Responsive town composition | Wide image aspect ratio versus phone aspect ratio, phone waveform dimensions/gestures, touch action changes, safe placement, and theme-specific tooltip surfaces. | High | Keep |
| INS-001 | Insight eligibility | Insights remain hidden until the current data thresholds are met and stay hidden when disabled. Calculation uses the existing observation window and local history. | High | Keep |
| INS-002 | Insight content | Weekly summary, preferred window, weekday/weekend patterns, momentum, routine reset/return, Anki fallback, and steady-process variants remain unchanged. | High | Keep |
| INS-003 | Current/Previous insight views | Current tab, Previous count, disabled Previous when empty, retained history, localized date, empty-history copy, and current-tab fallback. | High | Keep |
| INS-004 | Collapse and reopen | Collapse persists, Reopen pill appears only when appropriate, and focus transfers between controls correctly. | Medium | Keep |
| INS-005 | Narrow insight layout | `≤480px` stacked heading/tabs, compact type, history layout, and close-control placement remain. | Medium | Keep |
| NEXT-001 | Continue/Study next/Rewatch selection | Priority remains latest paused video, then active Watch later, then watched Favorite; the card mode and labels follow that selection. | High | Keep |
| NEXT-002 | Continue card actions | In-progress offers Set aside and timestamped Continue; favorite watched offers Remove favorite and Watch again; fresh Watch later offers Watch. | High | Keep |
| NEXT-003 | Narrow Continue card | At `≤480px`, the whole card becomes the player link, actions hide, thumbnail/copy compact, and desktop focus layer hides. Wider phone layouts retain their current variant. | High | Keep |

## Study History

| ID | Protected surface or behavior | States and variants to preserve | Risk | Disposition |
|---|---|---|---|---|
| HIST-001 | View switch | Summary/Heatmap tabs, active state, accessibility roles, saved default view, and transient current selection remain. | High | Keep |
| HIST-002 | Period selection | Week/Month period cells, localized available-period lists, active option, newest/current fallback, outside/Escape closing, and no-period empty state. | High | Keep |
| HIST-003 | Summary metrics | Video time, watched count, plus Anki reviewed/created when active; otherwise Days studied and Points scored. | High | Keep |
| HIST-004 | Summary rows | Localized date, video time, watched-video count, optional Anki counts, daily floor-rounded points, and newest-day-first ordering. | High | Keep |
| HIST-005 | Watched-video detail | Hover/focus/click popover, thumbnails/fallbacks, aggregated watched duration, jump back to saved video, missing-video warning, forced reveal, scroll, and arrival highlight. | High | Keep |
| HIST-006 | Point breakdown | Daily total, per-video fractional contribution, Anki review contribution, empty breakdown, hover/focus/touch opening, and outside/Escape closing. | High | Keep |
| HIST-007 | Heatmap | Up to one year from first active week, localized weekdays/months, seven activity levels, five-day streak outlines, sparse layout, horizontal scrolling, and legend. | High | Keep |
| HIST-008 | Heatmap tooltip | Date, points, streak badge, video time/count, conditional historical Anki rows, hover/focus/tap behavior, viewport-aware positioning, and outside dismissal. | High | Keep |
| HIST-009 | History empty states | No activity in selected range, no activity map, no available period, zero watched count, and empty point breakdown remain distinct. | Medium | Keep |
| HIST-010 | Responsive history | Two-by-two phone summary metrics, full-width view/range controls, phone fixed-bottom detail sheets, phone heatmap sizing, and hidden empty mobile range toolbar. | High | Keep |

## Video feed, channels, and playback

| ID | Protected surface or behavior | States and variants to preserve | Risk | Disposition |
|---|---|---|---|---|
| FEED-001 | Desktop feed toolbar | Visible status tabs with live counts for All, Unwatched, In progress, Watch later, and Favorite; Add; Undo; and Redo retain order and sizing. | High | Keep |
| FEED-002 | Phone feed toolbar | Status/channel filter controls remain hidden at `≤640px`; Add and Undo/Redo remain visible with current aspect-ratio width adjustment. | High | Keep |
| FEED-003 | Add popover | Anchored desktop popover versus phone fixed-bottom sheet; sticky phone header; search/paste field; focus; Escape/outside closing; and return focus. | High | Keep |
| FEED-004 | Local channel catalog search | Two-character threshold, normalization/aliases, ranked six-result limit, avatars/fallbacks, already-added state, keyboard combobox navigation, and result selection. | High | Keep |
| FEED-005 | YouTube channel search | Explicit fallback action, cached results, five-per-day limit, 2.5-second cooldown, searching state, no matches, unavailable state, missing-key warning, and cached/uncached results. | High | Keep |
| FEED-006 | URL addition | Supported video/channel forms, invalid URL/channel warnings, duplicate handling, API-key-dependent resolution, adding/loading states, and post-add spotlight/reveal. | High | Keep |
| FEED-007 | Channel grouping | Active/favorite videos remain grouped into channel shelves with channel avatar, name, count, YouTube link where possible, and shelf-specific ARIA labels. | High | Keep |
| FEED-008 | Channel order | Persisted manual shelf order wins; known ordered shelves precede unordered shelves; otherwise groups sort by latest upload. | High | Keep |
| FEED-009 | Shelf reordering | Fine-pointer native drag, non-mouse pointer drag, threshold before touch drag, cloned drag preview, before/after markers, edge scrolling, saved order, settle animation, and reduced-motion fallback. | High | Keep |
| FEED-010 | Channel removal | Remove affordance visibility differs by hover/touch; removal is undoable; qualifying saved/favorite/watched videos survive according to existing rules. | High | Keep |
| FEED-011 | Shelf scrolling | Desktop arrow controls with disabled endpoints, keyboard-focusable track, scroll snapping; phone hides arrows and uses touch horizontal scrolling; coarse tablets keep overflow scrolling. | High | Keep |
| FEED-012 | Video ordering within shelves | Paused/resumable videos first, Watch later next, then newest publication; Favorite-only mode uses chronological ordering. | High | Keep |
| FEED-013 | Card presentation | Thumbnail, duration, title, channel/publication metadata, status border, priority badge, Today-only New ribbon, lazy images, light/dark styling, and compact watched variant. | High | Keep |
| FEED-014 | Video status model | Unwatched, Watch later, In progress, and Watched remain distinct; opening a fresh video starts progress; Watch later remains a reminder and can coexist with resume priority. | High | Keep |
| FEED-015 | Favorite model | Favorite remains independent of watched status, survives completion, enables rewatch, remains undoable, and retains selected visual parity on every surface. | High | Keep |
| FEED-016 | Set aside | Available only for resumable videos; first use shows explanation; confirmation is remembered; progress/points/history remain; item moves to watched presentation; Watch later reactivates it. | High | Keep |
| FEED-017 | Resume timestamp | Valid timestamp parsing/formatting, saved `resumeAtSeconds`, latest `pausedAt` prioritization, Clear action, and undo/redo compatibility remain. | High | Keep |
| FEED-018 | Desktop shelf preview | At `≥641px` with fine hover, hover/focus expands a floating card while keeping it viewport-anchored; mouse leave, focus leave, Escape, scroll, resize, and outside actions close it appropriately. | High | Keep |
| FEED-019 | Touch-tablet shelf preview | At `≥641px` with no hover, first tap opens the preview and a subsequent thumbnail action opens playback; track remains touch-scrollable. | High | Keep |
| FEED-020 | Phone thumbnail behavior | At `≤640px`, no floating preview is used; tapping the thumbnail opens the player directly. | High | Keep |
| FEED-021 | Embedded player | Modal black player, responsive aspect ratio, autoplay/playsinline parameters, saved resume point, external IFrame API enhancement, usable iframe fallback, outside close, and body scroll lock. | High | Keep |
| FEED-022 | Playback tracking | One-second sampling, five-second persistence, seek-aware unique coverage, watch-progress entries, pause/cue/end/close/visibility persistence, and session analytics remain. | High | Keep |
| FEED-023 | Player keyboard controls | Escape closes; Left/Right seek two seconds; Space toggles play/pause; completion prompt suppresses conflicting shortcuts; cross-origin iframe focus handling remains. | High | Keep |
| FEED-024 | Completion prompt | Trigger after embedded playback ends or a due direct-open reminder; player/card/global placement; hidden-tab title; Yes/Not yet actions; Favorite toggle for first watch; separate rewatch question. | High | Keep |
| FEED-025 | Watched section | Newest-watched ordering, count, default collapse above six items, remembered session toggle, compact cards, Set aside timestamps, and distinct action visibility. | High | Keep |
| FEED-026 | Watched Favorites | A watched Favorite remains available in the active/favorite timeline for rewatch while retaining its history/watched representation according to the current filter. | High | Keep |
| FEED-027 | Empty feed states | Fresh feed, no active videos with watched below, filtered status/channel result, and Favorite-filter emptiness remain distinct and localized. | Medium | Keep |
| FEED-028 | Forced reveal | Search/history/Continue actions may temporarily include a filtered video, open the watched section where needed, center/scroll to it, and flash/spotlight it before clearing forced state. | High | Keep |
| FEED-029 | Undo/Redo | Disabled empty state, queue popovers, selectable historical actions, timestamps, directional labels, scroll behavior, and changes to video, channel, score, and history state remain atomic. | High | Keep |
| FEED-030 | Grid removal | Removing a video hides it from the grid without deleting study history and remains recoverable through Undo. | High | Keep |
| FEED-031 | YouTube refresh lifecycle | Five-hour staleness, per-channel active target, one-page fetch, metadata/status preservation, deduplication, 30-minute error backoff, automatic wake/visibility behavior, and partial-success toasts/logs. | High | Keep |
| FEED-032 | Short-video behavior | Three-minute cutoff, hidden active results when disabled, preserved existing state, refresh-time skipping, recheck, and localized skip counts/hints. | High | Keep |
| FEED-033 | Image fallbacks | Channel/avatar initials remain when images are absent or fail; thumbnails and city imagery keep their current fallback and lazy/preload behavior. | Medium | Keep |

## Walkthroughs, prompts, feedback, and notifications

| ID | Protected surface or behavior | States and variants to preserve | Risk | Disposition |
|---|---|---|---|---|
| HELP-001 | Main walkthrough | Town, Study History, and Videos steps; current targets; responsive target/text substitution; spotlight geometry; placement; and transient-UI cleanup. | High | Keep |
| HELP-002 | First-study walkthrough | Add, feed, first-card, and Other-language Add-now steps remain sequenced after onboarding according to available content. | High | Keep |
| HELP-003 | Contextual walkthroughs | Level-up confirmation and frequent-user Anki choice remain targeted, modal-like, and integrated with Settings/integration deferral. | High | Keep |
| HELP-004 | Walkthrough controls | Progress, Back, Next/Done, Skip/Close, disabled boundaries, keyboard Escape, target-click hooks, focus, scrims, arrow, scroll, and replay. | High | Keep |
| HELP-005 | Responsive walkthrough | Phone-specific placement, header behavior, touch-sized controls, and safe viewport clamping remain; active walkthrough suppresses conflicting shelf preview and header compaction. | High | Keep |
| PROMPT-001 | Set-aside dialog | Background inertness, first-use copy, Cancel/Confirm, Escape, initial focus, and focus restoration. Phone retains bottom-sheet placement. | High | Keep |
| FEEDBACK-001 | Feedback launcher | Footer placement, explicit analytics action, desktop right alignment, phone safe-area spacing, and accessible dialog relationship. | Medium | Keep |
| FEEDBACK-002 | Feedback modal | Desktop modal versus phone bottom sheet; backdrop/close/Escape; focus trap/return; category cards; required message; optional name/email; length limits. | High | Keep |
| FEEDBACK-003 | Feedback submission | Required-message error, live-only analytics requirement, local simulation, captured metadata, disabled/busy submit state, form reset, and no duplicate state. | High | Keep |
| FEEDBACK-004 | Feedback confirmation | Success toast-dialog, Discord link, explicit OK, focus transfer, and return to launcher. | Medium | Keep |
| TOAST-001 | Toast system | Success/warn/error visual states, polite versus assertive live announcements, localized text, phone wrapping/safe-area position, and 3.5-second dismissal. | High | Keep |

## Loading, error, empty, and disabled-state catalog

| ID | State family to preserve | Required distinct cases | Disposition |
|---|---|---|---|
| STATE-001 | First-run loading/recovery | Onboarding building; storage unavailable; setup unavailable; copy success/failure; retry still unavailable; total/partial channel failure; video refresh failure. | Keep |
| STATE-002 | Search | Initial saved-search guidance; no saved-video matches; catalog suggestions hidden below threshold; catalog no matches; YouTube searching; no YouTube matches; unavailable; daily limit; cooldown; already added. | Keep |
| STATE-003 | Feed | Fresh empty feed; active empty with watched below; filtered empty; watched section absent; Favorite filter; Add loading; refresh loading/partial/full failure; missing API key; next-refresh/backoff message. | Keep |
| STATE-004 | Video actions | Missing video; invalid URL; already watched; watch cooldown; timestamp-format error; removed/hidden result; unable to reveal; Set aside first-use state; reminder card/player/global variants. | Keep |
| STATE-005 | History/insights | Empty range; no heatmap activity; no available periods; zero watched count; no point items; no current eligible insight; no previous insights; disabled; collapsed. | Keep |
| STATE-006 | Settings/data | Empty activity; empty points; empty backups; backup missing; no sync state; invalid/unreadable/import-failed sync; wrong normal/sandbox file; restore/import success. | Keep |
| STATE-007 | Integrations | Anki unavailable, hosted-origin CORS block, generic Anki failure, YouTube missing key, channel not found, unsupported custom URL, refresh failure, iframe API enhancement failure with usable fallback. | Keep |
| STATE-008 | Feedback | Blank-message validation, live capture unavailable, busy submission, success confirmation. | Keep |
| STATE-009 | Disabled controls | Trailer boundary arrows, onboarding Continue/Start during invalid/loading states, level-up until ready, Undo/Redo empty, shelf arrows at endpoints, Previous insight without history, and unavailable action buttons. | Keep |
| STATE-010 | Media loading/failure | City loading fade/fallback, channel avatar initials with failed image hidden, lazy video thumbnails, and cached aspect-ratio fallback. | Keep |

## Accessibility and interaction contracts

| ID | Protected contract | Disposition |
|---|---|---|
| A11Y-001 | Dialog roles, accessible names, `aria-modal`, `aria-expanded`, `aria-selected`, `aria-pressed`, progress values, tab roles, listbox/combobox roles, live regions, and translated ARIA/title/placeholder/alt attributes. | Keep |
| A11Y-002 | Main-content inertness during trailer, onboarding, Settings, and Set aside; body-scroll locking during player/feedback where currently applied. | Keep |
| A11Y-003 | Focus entry and restoration for Settings, feedback, prompts, completion actions, and mobile popovers. | Keep |
| A11Y-004 | Focus traps for Settings and feedback plus visible `:focus-visible` treatments on keyboard-operable non-button elements. | Keep |
| A11Y-005 | Escape and outside-click behavior remain surface-specific; closing one transient surface must not unexpectedly close or activate another. | Keep |
| A11Y-006 | Touch targets remain at least the current 44px where phone/coarse-pointer rules apply, while desktop control density remains unchanged. | Keep |
| A11Y-007 | Reduced-motion behavior, decorative `aria-hidden` imagery, empty image alts where appropriate, and semantic heatmap buttons remain. | Keep |
| A11Y-008 | Localized date/time/number formatting, document `lang`, exact translation copy/newlines/placeholders, and English fallback remain. | Keep |

## High-risk regression contracts

1. **CSS cascade and order:** Responsive rules are layered in several later passes at `≤640px`, `≤480px`, and `≤420px`, followed by non-phone shelf rules and capability queries. Moving equivalent selectors can change the winner without changing specificity.

2. **Viewport and capability are not interchangeable:** Width, hover, pointer precision, `any-pointer`, aspect ratio, viewport height, and reduced motion currently drive different behavior. A single “mobile” abstraction cannot safely replace them.

3. **Global handler compatibility:** Static HTML and generated markup call many global functions through inline handlers. Module conversion must preserve every callable boundary until its markup is migrated.

4. **Persistence compatibility:** Normal, sandbox, and internal-test storage keys; backup keys; search cache/usage keys; onboarding notices; config cookies; state normalization; and backup limits must remain stable.

5. **Save side effects:** State writes also drive analytics synchronization, backups, activity history, streak calculation, reminders, and rerenders. Extracting state code must preserve ordering and optional suppression flags.

6. **Video state independence:** Favorite, Watch later, resume priority, watched state, Set aside, hidden-from-grid, removed-channel membership, reminder state, and watch coverage are overlapping rather than mutually exclusive.

7. **Channel ordering:** Persisted shelf order, fallback recency ordering, within-shelf priority, Favorite chronological mode, and touch/fine-pointer drag behavior form one contract.

8. **Playback accounting:** Unique seek-aware coverage, periodic persistence, resume position, daily progress entries, rewatch behavior, lifecycle exit reasons, and explicit completion confirmation must migrate together.

9. **Date and scoring boundaries:** Local activity dates, Anki’s 4 a.m. day boundary, weekly ranges, daily floor rounding, five-point streak threshold, sandbox clock, and historical aggregation cannot be casually converted to generic UTC/date utilities.

10. **Localization:** Dictionaries are assembled through English fallback plus later locale assignments. Static and generated content use text, attributes, placeholders, parameters, and intentional newlines. Extraction must be atomic across all five locales.

11. **Analytics:** Production/internal gates, event names, property shapes, action inference, saved-state snapshots, user properties, feedback metadata, and “do not send” local/sandbox behavior are compatibility contracts.

12. **Focus and stacking:** Trailer, onboarding, Settings, walkthrough, video preview/player, reminders, history sheets, feedback, and toasts have interdependent inertness, focus, body classes, and high z-index states.

13. **Async partial success:** Onboarding, channel addition, feed refresh, YouTube search, image hydration, IFrame enhancement, and Anki all intentionally continue through some partial failures.

14. **Anki availability:** Current product availability is tied to `≤640px` or any coarse pointer in both CSS and JavaScript. Responsive cleanup must preserve this current result until a separately approved product decision changes it.

15. **Current DOM/source mismatch:** Several legacy targets are referenced by JavaScript or CSS but are absent or hidden in current HTML. Refactoring must not accidentally revive or silently redefine them:

    - Weekly-goal display IDs and controls are absent while weekly-goal state/calculation remains.
    - `refreshBtn`, `channelFilterBtn`, `manualVideoAddBtn`, `manualVideoChannelOptions`, and Settings channel-list targets are absent.
    - The status-filter popover exists but is hidden; desktop uses tabs and phone hides the filter group.
    - These are migration-analysis items, not authorization to expose, delete, or redesign functionality.

16. **README drift:** README feature descriptions are useful context but do not always match the current DOM. When they differ, preserve the actual source-defined application until the discrepancy is separately reviewed.

17. **Deployment/cache compatibility:** Existing deployed filenames, script order, `window.EDENIA_CONFIG`, PostHog initialization order, query-string asset versions, fonts, images, catalog data, and static Pages runtime must remain compatible.

18. **Unverified baseline:** This inventory is source-only. A change cannot claim visual/runtime equivalence until the approved acceptance process has been completed and documented in its pull request.

## Catch-all preservation rule

Any currently working or intentionally hidden behavior discovered later that is not listed above is automatically added to this catalog as `Keep` before related code is changed. The implementer must document that discovery and its protection contract in the pull request; they must not silently “clean it up.”
