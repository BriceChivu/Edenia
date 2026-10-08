# Cached metadata refresh cloud-write audit

Scope: issue #177's admitted-owner sign-in trial. Ordinary accountless behavior remains unchanged.

A focused regression reproduced three unnecessary cloud paths in `maybeRefreshFeed`: unchanged cached metadata renewal, an unchanged provider quota failure, and renewal after a concurrent learner edit. The cache-maintenance callback always used a cloud-eligible save and its outcome always appended portable diagnostic history.

Signed-in maintenance now compares the canonical portable profile before and after each batch. Freshness timestamps and cooldowns still persist locally. An unchanged run does not append portable history. Actual catalog changes, expiration, and recovered provider data remain cloud eligible. Each provider callback refreshes the comparison baseline from the current profile so concurrent learner edits remain intact. Profile-retirement fences and accountless diagnostics remain in place. Failed portable normalization does not suppress cloud persistence.

Validation: the new regression failed in three cases before the repair; seven new focused cases pass afterward, alongside existing metadata-maintenance and feed-refresh coverage. The browser case exercises unchanged renewal against an advanced cloud revision, genuine provider changes, reload persistence, opaque island preservation, and retained bytes of other modes. Full build, contract, browser, and CI results are recorded in the pull request.

Hosted evidence from the preceding background-refresh release: Chrome and native Safari both displayed Up to date with equal saved XP. A later successful Chrome Anki poll completed without advancing the admitted owner's cloud head. This evidence covers that prior deployed fix, not this cached-metadata follow-up until it is deployed.

The independent native Safari email sign-in acceptance remains pending the previously requested action-time CAPTCHA confirmation. Google sessions, global refresh-token revocation, and the other completed acceptance scenarios do not substitute for that pending email test.
