## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues for `BriceChivu/Edenia`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context domain-documentation layout. See `docs/agents/domain.md`.

### Tiny Swords changes

Before changing Tiny Swords or its Edenia bridge, read and follow the Godot ownership rule in `godot/tiny-swords/README.md#game-ownership-and-edenia-integration`.

### Git workflow

- `master` is the permanent integration branch. Start each new task from current `origin/master` on `codex/<issue>-<short-description>` (omit the issue number when none exists).
- Continue an existing task on its task branch. Use feature flags and internal-test modes to control release availability.
- Give concurrent tasks separate worktrees. Before switching a shared checkout, check for other active chats and preserve local changes.
- After a PR merges, delete its finished local and remote branches and archive its worktree. Verify merged PR contents when squash merges obscure ancestry; preserve unfinished work and local artifacts before cleanup.
