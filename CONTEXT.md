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

**Cloud progress snapshot**:
A recoverable, versioned copy of a signed-in profile's portable profile.
_Avoid_: Plus backup, live state

**Progress sync**:
The local-first reconciliation of a signed-in profile with its cloud progress snapshots.
_Avoid_: Realtime collaboration, cloud-only storage

**Internal canary**:
A release stage in which account-backed behavior is available only to the developer for production-like verification.
_Avoid_: Private deployment, public beta
