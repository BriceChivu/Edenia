# Existing production experience

Issue #384 keeps ordinary visits and sandbox on the existing released
experience while mode 2 tests the new Tiny Swords dashboard. The compatibility
overlay contains the source files that differ from production commit
`5ea3c0654d772548d2cb7f8b73560a0f1fdde74a` (the last successful Pages release when this
overlay was prepared). Its manifest records their provenance. Unchanged modules
and assets remain shared with the main source tree.

The retired mode-1 query now opens ordinary Edenia and is removed from the URL.

`scripts/build-production-experience.mjs` resolves those overrides without
requiring Git history or downloading an old build. It preserves the production
town timeline, onboarding, translations and XP policy. Changes to shared modules
must retain this route's behavior; update an override deliberately when fixing
the production experience. Remove this overlay only as part of a separately
authorized public Tiny Swords rollout.
