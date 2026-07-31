const EXCLUSION_LABELS = Object.freeze({
  already_in_catalog: 'Already present in a maintained catalog',
  catalog_selection: 'Added from an existing catalog selection',
  internal_or_test_event: 'Internal, localhost, or sandbox event',
  invalid_channel_id: 'Invalid YouTube channel ID',
  missing_distinct_user: 'Missing anonymous distinct-user identity',
  missing_positive_candidate_provenance: 'Legacy event without positive candidate provenance',
  not_publicly_available: 'Channel is unavailable or not public',
  unsupported_source: 'Event source is not eligible for community import'
})

const BLOCKER_LABELS = Object.freeze({
  below_distinct_user_threshold: 'below learner threshold',
  invalid_candidate_source: 'invalid source',
  invalid_channel_id: 'invalid channel ID',
  missing_learning_language: 'missing learning language',
  missing_name: 'missing name',
  missing_published_at: 'missing publication date',
  missing_thumbnail: 'missing thumbnail',
  not_publicly_available: 'not publicly available',
  review_required: 'manual identity review required',
  unsupported_learning_language: 'unsupported learning language'
})

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim() || '—'
}

function channelLink(channel) {
  const name = escapeCell(channel?.name || channel?.channelId || 'Unknown channel')
  const channelId = String(channel?.channelId || '').trim()
  return channelId
    ? `[${name}](https://www.youtube.com/channel/${encodeURIComponent(channelId)})`
    : name
}

function formatDate(value) {
  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? '—' : timestamp.toISOString().slice(0, 10)
}

function formatTable(headers, rows) {
  if (!rows.length) return '_None._'
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.map(escapeCell).join(' | ')} |`)
  ].join('\n')
}

function byChannelId(catalog) {
  return new Map(
    (Array.isArray(catalog?.channels) ? catalog.channels : [])
      .map(channel => [channel.channelId, channel])
  )
}

export function buildCommunityCatalogPullRequestBody(input) {
  const baseCandidates = input.baseCandidates || { channels: [] }
  const baseCommunity = input.baseCommunity || { channels: [] }
  const currentCandidates = input.currentCandidates || { channels: [] }
  const currentCommunity = input.currentCommunity || { channels: [] }
  const report = input.importReport || {}
  const baseCandidateById = byChannelId(baseCandidates)
  const baseCommunityById = byChannelId(baseCommunity)
  const currentCandidateById = byChannelId(currentCandidates)
  const currentCommunityById = byChannelId(currentCommunity)
  const newlyPromoted = currentCommunity.channels.filter(
    channel => !baseCommunityById.has(channel.channelId)
  )
  const candidateAdditions = currentCandidates.channels.filter(
    channel => !baseCandidateById.has(channel.channelId)
  )
  const candidateRemovals = baseCandidates.channels.filter(
    channel => !currentCandidateById.has(channel.channelId)
  )
  const candidateUpdates = currentCandidates.channels.filter(channel => {
    const previous = baseCandidateById.get(channel.channelId)
    return previous && JSON.stringify(previous) !== JSON.stringify(channel)
  })
  const blockedById = new Map(
    (Array.isArray(report.blockedPromotions) ? report.blockedPromotions : [])
      .map(channel => [channel.channelId, channel.blockers || []])
  )
  const minimumDistinctUsers = Number(currentCommunity.minimumDistinctUsers) || 2
  const candidateRows = currentCandidates.channels.map(candidate => {
    let status = `${candidate.distinctUserCount}/${minimumDistinctUsers} learners`
    if (currentCommunityById.has(candidate.channelId)) status = 'Promoted'
    else if (blockedById.has(candidate.channelId)) {
      status = `Blocked: ${blockedById.get(candidate.channelId)
        .map(blocker => BLOCKER_LABELS[blocker] || blocker)
        .join(', ')}`
    } else if (Array.isArray(candidate.reviewReasons) && candidate.reviewReasons.length) {
      status = 'Manual identity review required'
    }
    return [
      channelLink(candidate),
      candidate.handle,
      candidate.languages?.join(', '),
      candidate.distinctUserCount,
      candidate.addCount,
      status,
      formatDate(candidate.lastSeenAt)
    ]
  })
  const promotedRows = newlyPromoted.map(channel => [
    channelLink(channel),
    channel.handle,
    channel.languages?.join(', '),
    channel.distinctUserCount,
    channel.addCount,
    formatDate(channel.promotedAt)
  ])
  const currentPromotedRows = currentCommunity.channels.map(channel => [
    channelLink(channel),
    channel.handle,
    channel.languages?.join(', '),
    channel.distinctUserCount,
    formatDate(channel.promotedAt)
  ])
  const excludedRows = (Array.isArray(report.exclusions) ? report.exclusions : []).map(entry => [
    channelLink(entry),
    EXCLUSION_LABELS[entry.reason] || entry.reason,
    entry.existingCatalogId,
    entry.eventCount,
    formatDate(entry.lastSeenAt)
  ])

  const body = [
    'Automated daily community-channel catalog update.',
    '',
    'This pull request contains only aggregate candidate data and qualifying promoted channels. It merges only after the community-specific safety checks and required CI pass.',
    '',
    '## Summary',
    '',
    `- ${currentCandidates.channels.length} eligible candidates in the current 180-day snapshot`,
    `- ${candidateAdditions.length} candidates added, ${candidateUpdates.length} updated, ${candidateRemovals.length} expired`,
    `- ${newlyPromoted.length} newly promoted channels; ${currentCommunity.channels.length} promoted in total`,
    `- ${(Array.isArray(report.exclusions) ? report.exclusions : []).length} aggregate exclusions reported`,
    `- Promotion threshold: ${minimumDistinctUsers} distinct learners`,
    '',
    '## Newly promoted channels',
    '',
    formatTable(
      ['Channel', 'Handle', 'Language', 'Learners', 'Adds', 'Promoted'],
      promotedRows
    ),
    '',
    '<details open>',
    '<summary><strong>Eligible candidates</strong></summary>',
    '',
    formatTable(
      ['Channel', 'Handle', 'Language', 'Learners', 'Adds', 'Status', 'Last seen'],
      candidateRows
    ),
    '',
    '</details>',
    '',
    '<details>',
    '<summary><strong>Excluded from automation</strong></summary>',
    '',
    formatTable(
      ['Channel', 'Reason', 'Existing catalog ID', 'Events', 'Last seen'],
      excludedRows
    ),
    '',
    '</details>',
    '',
    '<details>',
    '<summary><strong>Current promoted catalog</strong></summary>',
    '',
    formatTable(
      ['Channel', 'Handle', 'Language', 'Learners', 'Promoted'],
      currentPromotedRows
    ),
    '',
    '</details>',
    '',
    '## Safety boundary',
    '',
    '- Only positively identified direct-input and YouTube-search events are eligible.',
    '- Existing curated and discovered channel IDs and handles are excluded.',
    '- No PostHog person or distinct identifiers are written to the repository or this report.',
    '- Promoted channels cannot be removed or have stable identity fields rewritten automatically.',
    '- The checked head and base revisions must remain unchanged until merge.',
    '',
    `Base revision: \`${escapeCell(input.baseSha)}\``,
    '',
    `Head revision: \`${escapeCell(input.headSha)}\``
  ].join('\n')

  if (body.length > 60_000) {
    throw new Error(`Community catalog pull request report is too large (${body.length} characters).`)
  }
  return body
}
