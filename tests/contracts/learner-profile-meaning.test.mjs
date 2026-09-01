import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isMeaningfullyEmptyLearnerProfile
} from '../../src/domain/learner-profile-meaning.js'

function emptyProfile() {
  return {
    activityLog: [],
    anki: {},
    cityProgress: { maxLevelIndex: 0 },
    config: {
      ankiEnabled: true,
      channelShelfOrder: [],
      channelVideoFormats: {},
      channels: [],
      includeShorts: true,
      locale: 'en',
      removedChannelIds: [],
      removedDefaultChannelIds: [],
      weeklyGoalHours: 4
    },
    learnerProfile: {
      createdAt: '2026-08-20T00:00:00.000Z',
      languages: [],
      level: null,
      selectedChannelCatalogIds: [],
      updatedAt: '2026-08-21T00:00:00.000Z'
    },
    noAnkiFrequentUserPrompt: {
      respondedAt: null,
      response: null
    },
    onboarding: {
      introSeenAt: null,
      levelUpGuidanceShownAt: null,
      recommendationsAppliedAt: null,
      setupCompleted: false,
      setupCompletedAt: null,
      walkthroughCompleted: false,
      walkthroughCompletedAt: null
    },
    videos: {}
  }
}

test('default profile metadata is meaningfully empty', () => {
  assert.equal(isMeaningfullyEmptyLearnerProfile(emptyProfile()), true)
})

for (const [label, makeMeaningful] of [
  ['study history', profile => profile.activityLog.push({ type: 'study' })],
  ['Anki history', profile => { profile.anki['2026-08-21'] = { reviewed: 1 } }],
  ['town progress', profile => { profile.cityProgress.maxLevelIndex = 1 }],
  ['saved channels', profile => profile.config.channels.push({ id: 'lesson' })],
  ['study preferences', profile => { profile.config.includeShorts = false }],
  ['learner selections', profile => profile.learnerProfile.languages.push('french')],
  ['prompt choices', profile => { profile.noAnkiFrequentUserPrompt.response = 'yes' }],
  ['completed milestones', profile => { profile.onboarding.setupCompleted = true }],
  ['saved video organization', profile => { profile.videos.lesson = { favorite: true } }]
]) {
  test(`${label} makes a profile meaningful`, () => {
    const profile = emptyProfile()
    makeMeaningful(profile)
    assert.equal(isMeaningfullyEmptyLearnerProfile(profile), false)
  })
}

test('an unverified profile shape never qualifies as empty', () => {
  assert.equal(isMeaningfullyEmptyLearnerProfile({}), false)
  assert.equal(isMeaningfullyEmptyLearnerProfile({
    ...emptyProfile(),
    unknownPortableHistory: []
  }), false)
})
