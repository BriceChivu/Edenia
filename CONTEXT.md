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
