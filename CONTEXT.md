# Edenia

Edenia helps learners build a durable language-study practice from videos and Anki activity. Its study experience can remain browser-local or be connected to a learner identity for account-backed services.

## Language

**Accountless profile**:
A learner profile that is not connected to an identity and remains on its browser.
_Avoid_: Guest account, anonymous account

**Signed-in profile**:
A learner profile connected to a verified Edenia identity.
_Avoid_: Plus profile, cloud account

**Learner profile**:
The durable study state and preferences that describe one learner's Edenia experience.
_Avoid_: User document, app state

**Active profile**:
The one learner profile whose study state Edenia currently displays and accepts changes for.
_Avoid_: Current user, selected account

**Profile opening**:
The transition that makes a verified signed-in profile active after Edenia completes the checks needed to display it safely.
_Avoid_: Loading progress, profile sync

**Cached signed-in profile**:
A signed-in profile retained on a browser while inactive and available only to its verified owning identity.
_Avoid_: Remembered account, dormant user

**Ready empty accountless profile**:
An accountless profile prepared for immediate study without selected languages or channels.
_Avoid_: Guest profile, onboarding profile

**Portable profile**:
The transferable portion of a learner profile, excluding credentials, authentication sessions, analytics identifiers, and device-specific integration data.
_Avoid_: Full browser state, database dump

**Study fact**:
A durable record that learning activity occurred, used to calculate Study History, streaks, points, and earned town progress.
_Avoid_: Study statistic, analytics event

**Study day**:
The learner-local calendar date assigned when a study fact is recorded and retained when that profile moves between timezones.
_Avoid_: Display date, current-device date

**Profile combination**:
A rollback-protected reconciliation of two portable profiles that preserves compatible study facts and resolves other fields by explicit rules.
_Avoid_: Whole-profile overwrite, last-write-wins

**Profile lineage**:
The ancestry that identifies revisions as versions of the same learner profile, even when a shared revision is no longer available.
_Avoid_: Account identity, cloud history

**Profile generation**:
A segment of a profile lineage started by an intentional reset; older generations can return only through explicit recovery.
_Avoid_: Schema version, revision

**Trusted profile predecessor**:
The newest earlier version within the current profile generation that is owner-bound, structurally valid, and connected to the profile lineage by verified revision evidence; it can safely become active when the current version cannot be opened.
_Avoid_: Last-write-wins backup, arbitrary old copy

**Profile-opening fallback**:
A safe outcome of profile opening that restores a trusted profile predecessor within the current generation, or sends the verified owner through language-selection onboarding when no trusted state remains; it never crosses an intentional reset boundary or creates an isolated signed-in profile.
_Avoid_: Isolated town, blank recovery, indefinite recovery

**Fresh signed-in profile**:
A meaningfully empty learner profile created through language-selection onboarding after Edenia verifies the owner and finds no trusted state in the current profile generation.
_Avoid_: Guest profile, shadow profile

**Meaningfully empty profile**:
A learner profile with no study facts, saved study organization, learner selections, portable histories, or completed milestones.
_Avoid_: New account, default document

**Cloud progress snapshot**:
A recoverable, versioned copy of a signed-in profile's portable profile.
_Avoid_: Plus backup, live state

**Protected profile version**:
An unchosen profile version retained after a learner resolves a conflict and available for download until its protection deadline.
_Avoid_: Conflict backup, discarded profile

**Progress sync**:
The local-first reconciliation of a signed-in profile with its cloud progress snapshots.
_Avoid_: Realtime collaboration, cloud-only storage

**Internal canary**:
A release stage in which account-backed behavior is available only to the developer for production-like verification.
_Avoid_: Private deployment, public beta

**Auth health probe**:
A synthetic check of Edenia Auth availability that neither signs in as a learner nor uses learner data.
_Avoid_: Test login, learner probe

**Auth monitor capability**:
Revocable authority to invoke the Auth health probe and read its aggregate status, without authority over learner identities or profiles.
_Avoid_: Account credential, learner token

**Independent Auth monitor**:
An Auth health probe scheduler and operator-alert path whose control plane is outside Edenia, Supabase, and GitHub Actions.
_Avoid_: Auth workflow, internal health job
