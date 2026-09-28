# Pixel-town economy: experience, coins, and player choices

Recorded: 2026-09-28

Status: agreed product direction with draft balancing and interaction details.

This document records the discussion about evolving the internal pixel-town at
`https://www.edenia.study/?internal_test=1`. It describes intended behavior, not
implemented gameplay. Implementation work and acceptance criteria remain tracked
in GitHub Issues under the repository's existing conventions.

## Agreed direction

Learners choose how their town grows by spending coins earned from studying.
Construction no longer follows one fixed sequence of level scenes. Two learners
at the same level can have different towns because they bought different things.

Levels remain, driven by experience. The earlier suggestion to remove town levels
was superseded by the decision to separate experience from coins.

| Concept | Purpose | Behavior |
| --- | --- | --- |
| Experience (XP) | Recognize cumulative study progress | Earned through studying; accumulates permanently and determines level |
| Coins | Allow choices about town development | Earned through studying; spent on purchases; the wallet shows the current unspent balance |
| Level | Unlock new ways to personalize the town | Reached through XP; spending coins does not reduce XP or level |
| Owned upgrades | Record the learner's construction choices | Purchased objects remain in the town |

A study session rewards both XP and coins. Their earning rates can differ so
level progression and purchase pacing can be tuned separately. No earning rates,
conversion formula, or XP thresholds have been settled.

## Building directly on the map

Each purchasable addition has a fixed intended location. A faint outline previews
the object where it will appear once built.

Show the outline only when all three conditions are met:

1. The learner does not already own this particular upgrade.
2. Its physical prerequisites have been built.
3. The current coin balance covers its full purchase cost.

Interacting with the outline starts the purchase at that location. Completing the
purchase deducts coins and replaces the outline with the actual object. Recheck
all outlines after earning or spending coins: other outlines disappear if the
remaining balance no longer covers them.

For example, a boat costing 40 coins appears as an outline only when the dock is
owned and at least 40 coins remain. Lifetime XP does not make an item affordable.

The preferred interaction discussed was to tap an outline, see the name and cost,
then use a small **Build · 40 coins** button. This avoids accidental purchases on
mobile. Exact confirmation, dismissal, and post-purchase feedback remain UI design
details to resolve.

## Construction and customization have different roles

Coins buy additions such as flowers, a fishing boat, a playground, or another
island. Levels unlock customization options such as house colors, roof colors,
boat paint, and fence styles.

The preferred starting rule is to keep construction independent of level gates.
Learners can save for a larger project instead of following a compulsory purchase
sequence. Prerequisites should be physical and easy to understand: a boat needs a
dock, a pool needs an island, and a bench beneath a tree needs that tree.

Level rewards unlock a customization permanently. Applying or switching between
unlocked options should be free. A level-up should provide a usable reward, and
learners should be free to keep an older appearance they prefer. Customization for
an object can be unlocked before that object is owned; it becomes usable when the
learner owns it.

The following rewards were illustrative, not an approved level schedule:

| Level | Example reward |
| --- | --- |
| 1 | Starter home and access to construction purchases |
| 2 | A small palette of house colors |
| 3 | Alternative roof colors |
| 4 | Fishing-boat paint options, usable once the boat is owned |
| 5 | Garden-fence styles |

## Starting town and purchase catalog

The proposed starting town contains the main island, a small house, a basic path,
and an otherwise empty garden. Water, reflections, and basic shoreline details are
free scenery. Town expansion should preserve the positions of objects already
built.

The first draft contains 25 purchases in
[`src/experiments/pixel-town/upgrades.js`](../../../src/experiments/pixel-town/upgrades.js).
Use that file as the source for the item list rather than maintaining a second
complete price table here. It records stable IDs, names, descriptions, costs,
placement descriptions, artwork references, and prerequisites.

Illustrative prices retained from that draft are:

| Purchase | Draft cost | Prerequisite |
| --- | --- | --- |
| First flower patch | 15 coins | None |
| Wooden fishing dock | 35 coins | None |
| Small fishing boat | 40 coins | Fishing dock |
| Children's playground | 100 coins | None |

The dock and boat together therefore cost 75 coins. Future planning UI should
explain the remaining prerequisite costs, not just the final object's price.

Each catalog entry is a one-time purchase at its own position. Additional flowers
or trees receive their own IDs even when they reuse artwork. Most draft items have
existing artwork; the bench needs new artwork. Exact coordinates, footprints, and
draw order remain unset pending layout review.

The catalog uses coins for its `cost` values, separate from XP. All prices remain
provisional, including the first flower patch at 15 coins. The catalog is not
connected to gameplay.

Upgrade definitions belong in the shared catalog. Ownership and economy state
belong to the learner profile. A separate definition of level rewards should
describe customization unlocks. The precise persistence and rendering design is
not yet settled.

## Pacing and motivation

The agreed target is that a new learner can afford the first flower patch after
ten minutes of studying. This target does not settle the earning formula or
broader balancing. Early choices should offer different outcomes: decorate now,
or save for a boat or larger project.

Tune prices against actual study earning rules rather than selecting numbers in
isolation. The intended pacing discussed was:

| Purchase size | Intended feeling |
| --- | --- |
| Small decoration | Today's studying added something |
| Boat or tree | I saved across a few sessions |
| Playground or island | I worked toward a larger project |

Purchases should be permanent. Avoid upkeep fees or loss of town objects after
inactivity; the town should be a welcoming place to return to.

Post-study feedback could show both rewards, for example **+20 XP · +10 coins**,
alongside level progress and the wallet balance. These reward amounts are examples
only, not an agreed earning ratio.

## Ideas still to explore

An optional **Town plans** panel could show additions that are not yet affordable
without showing their outlines on the map. It could display savings progress such
as “Playground: 65 / 100 coins” and let a learner select a savings goal. A goal
would not reserve coins or prevent other purchases.

We have not decided whether all future upgrades should be visible in that panel
from the start or whether some should be revealed as the town grows.

For existing learners, the preferred migration direction is to preserve objects
they already have and mark those upgrades as owned. How historical study maps to
XP, starting coins, and previous construction remains unresolved. The migration
must account for previous progress without accidentally counting it twice.

## First implementation slice

The first slice is **study → coins → confirmed first flower purchase → ownership
survives reload**. A new learner should earn enough coins after ten minutes of
studying to afford the first flower patch, confirm that purchase, and still own
it after reloading. Spending coins must leave XP and level unchanged.

The earning formula and broader balancing remain provisional. The draft first
flower price is 15 coins; no broader final rates have been approved. This slice
is planned work, not gameplay implemented by this foundation.

## Open decisions before implementation

- XP and coin earning rules, level thresholds, and final purchase prices.
- The actual level-reward schedule and available customization palettes/styles.
- Final purchase confirmation and feedback interactions.
- Whether to build Town plans, how discovery works, and how savings goals appear.
- Final map composition, coordinates, object footprints, and outline hit areas.
- Migration from existing points and level-based scenes to XP, coins, and ownership.
- Durable economy records and their behavior during profile combination, progress
  sync, recovery, and repeated purchase attempts.
- Rendering arbitrary owned-item combinations instead of selecting a fixed scene
  by level, while retaining the internal experiment's performance and isolation
  requirements.

Only the draft catalog has been created so far. Earning, spending, outlines,
customization unlocks, and migration have not been implemented by this discussion.

## First purchase milestone — implemented locally, 2026-09-28

The first slice fixes `garden-flower-1` at 15 coins and awards one coin per 40
recorded video-study seconds. Ten minutes therefore earns 15 coins; the existing
30 XP/hour calculation still gives 5 XP. Fractional coin progress carries across
sessions. Anki retains its existing XP rules; this slice does not invent a
minutes-to-coins conversion for review counts.

A newly created internal learner profile receives the starter island, house and
paths. The first patch occupies home coordinates `[-49, 13]`, footprint `[28, 18]`,
depth 10. Its affordable outline opens a confirmation with Build and Cancel.
Ownership changes the starter composition from scene 13 to 14. These are the
only new complete compositions; no catalog-wide combination generation or runtime
procedural drawing was introduced. XP/level progression continues independently;
new starter towns stay in this purchase composition as levels rise. Legacy scenes
and onboarding's demonstration scenes remain unchanged.

Every already-existing profile, including one with no study, keeps its legacy
scene progression and gets the already-visible first flower patch recorded at
zero cost. Existing video facts become reward baselines, not a starting grant.
No other legacy objects are removed or migrated. Newly recorded increases earn
coins from that point onward. Full existing-town migration remains later work.

`townEconomy` is optional portable profile state. Its reward records use video ID
and canonical session timestamp, with an initial baseline and monotonic seconds.
Reprocessing, metadata refresh, removal/reappearance of facts, reload and exact
sync retries do not award the same interval again. Receipts are not pruned when
video metadata disappears. Ownership is the debit receipt, and balance is derived
from rewards minus purchase costs; both are saved in one existing active-profile
write. Failed writes roll ownership back in memory. Confirm reads the active
profile again and rechecks ownership and balance. The existing activation fence
continues to protect profile changes and competing tabs; this does not claim a
new transactional cross-tab storage guarantee.

Portable export/import, backups and recovery retain the optional field and
include it in the integrity hash. Sync already resolves divergent profiles by
explicit protected version choice; wallets are never added together. Conflict
comparisons now expose wallet and flower-ownership differences. A chosen older
version or explicit recovery remains a whole-profile rollback, including its
wallet. Older clients reject the unknown portable field rather than silently
accepting a partial profile. Public profiles without the field keep their
previous canonical envelope shape and behavior.

Release prerequisite: apply the additive `pixel_town_economy_profile` database
migration before enabling this client for signed-in economy use. The current
server schema otherwise rejects the new optional field. This implementation task
does not authorize applying that migration, deployment, or merge.

### Local verification

- `EDENIA_PIXEL_TOWN_ENABLED=true npm run build`: passed.
- `node --test tests/contracts/*.test.mjs`: 1,730 passed. Includes accounting,
  failed-save rollback, legacy baselines, first signed-in creation, portable
  round trips, conflict comparison and exact cloud retry preservation.
- Enabled Playwright `town-economy.spec.mjs` and `pixel-town.spec.mjs` on
  `desktop-standard` and `phone-small`: 20 passed. The earning test calls the
  player's real progress recorder sixty times with ten-second increments; it
  does not wait for ten minutes of live YouTube playback. It checks immediate
  wallet refresh, confirmation, duplicate purchase rejection, unchanged XP,
  post-reload ownership, mobile panel containment and public request isolation.
  Existing lifecycle, reduced-motion, asset-failure and degradation checks pass.
- Visually inspected desktop ownership and the 360px-wide phone Build panel.
- `git diff --check`: passed.

The SQL regression file is included but has **not been executed**: neither the
local Docker nor Colima database runtime was available. The migration has not
been applied. Hosted signed-in sync, actual ten-minute playback, physical-device
performance, and deployment acceptance are not claimed by these local tests.
