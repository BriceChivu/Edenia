# Local email design preview

Run `node scripts/preview-emails.mjs` from the repository root.

- Mailbox: http://localhost:4188
- Edenia destination sandbox: http://localhost:4190/?sandbox=1

The preview renders the actual shared production reminder renderer and Auth code
template, with fake streak numbers, video artwork, addition records and recipient
profile. The dummy sign-in code is 123456. English, Traditional and Simplified
Chinese, Spanish and French use the same production templates. Images and the
wordmark are hosted assets; only the sample video artwork is a placeholder.

Channel links open the production app's actual Add/prefill and bulk-add handlers
in a separate local sandbox tab. Bulk additions save sequentially and show bottom
progress, skip owned/removed channels, and stop on a failed save or lost active
profile. The sandbox has no Auth/API configuration and uses its own origin and
storage. Production app source is bundled through the normal compatibility
resolver; only its sandbox origin is overridden in the generated preview bundle.

Discovery uses `src/features/channels/discovery-recommendations.js` with the
explicit fixture in `recommendation-sample.json`. Its real server counterpart
uses accepted cloud history and private SQL ranking, never this fixture. Both
filter to selected learning languages, exclude owned and previously deleted
channel IDs, rank channels outside onboarding first by distinct other-learner
additions, and use onboarding channels only to fill remaining slots. Fewer than
six eligible channels is valid. The sample has six eligible non-onboarding
channels. It already owns Grace Mandarin Chinese and has deleted one discovery
channel. Popularity numbers are fictional test records, never live analytics.

Checks:

```sh
node --test tests/contracts/discovery-recommendations.test.mjs tests/contracts/email-channel-destination.test.mjs
```

Building or visiting this preview never activates email delivery.
