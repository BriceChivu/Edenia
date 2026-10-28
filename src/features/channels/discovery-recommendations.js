// The caller supplies accepted channel-add records, not YouTube subscribers,
// searches, video views, or the number of times one learner clicked Add.
export function selectDiscoveryRecommendations({
  channels,
  learnerId,
  learningLanguages,
  ownedChannelIds = [],
  previouslyDeletedChannelIds = [],
  onboardingChannelIds = [],
  learnerAdditions = [],
  limit = 6
}) {
  if (!learnerId || !Number.isInteger(limit) || limit < 1) return []
  const languages = new Set(learningLanguages)
  const excluded = new Set([...ownedChannelIds, ...previouslyDeletedChannelIds])
  const onboardingIds = new Set(onboardingChannelIds)
  const addedBy = new Map()
  for (const addition of learnerAdditions) {
    if (!addition.learnerId || addition.learnerId === learnerId || !addition.channelId) continue
    if (!addedBy.has(addition.channelId)) addedBy.set(addition.channelId, new Set())
    addedBy.get(addition.channelId).add(addition.learnerId)
  }

  const eligible = new Map()
  for (const channel of channels) {
    if (!channel.channelId || excluded.has(channel.channelId)
      || channel.available === false || channel.privacyStatus === 'private'
      || !(channel.languages || []).some(language => languages.has(language))) continue
    if (!eligible.has(channel.channelId)) eligible.set(channel.channelId, channel)
  }
  return [...eligible.values()].sort((left, right) => {
    const tier = Number(onboardingIds.has(left.channelId)) - Number(onboardingIds.has(right.channelId))
    const popularity = (addedBy.get(right.channelId)?.size || 0) - (addedBy.get(left.channelId)?.size || 0)
    return tier || popularity || (left.channelId < right.channelId ? -1 : left.channelId > right.channelId ? 1 : 0)
  }).slice(0, limit)
}
