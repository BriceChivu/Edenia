import assert from 'node:assert/strict'
import test from 'node:test'
import { createLearnerProfileSyncOpportunity } from '../../src/state/learner-profile-sync-opportunity.js'

test('game activity, recent camera input, visibility and actual playing video govern quiet moments', () => {
  let hidden = false, playing = false, time = 0
  const opportunity = createLearnerProfileSyncOpportunity({ isHidden: () => hidden,
    isWatchingVideo: () => playing, now: () => time })
  assert.equal(opportunity.isQuiet(), true, 'No game mounted')
  opportunity.reportGame({ visible: true, active: true })
  assert.equal(opportunity.isQuiet(), false, 'Moving/working pawn is active even without mouse input')
  playing = true
  assert.equal(opportunity.isQuiet(), false, 'Playing video cannot override visible pawn work')
  playing = false
  assert.equal(opportunity.isQuiet(), false)
  opportunity.reportGame({ visible: false, active: true })
  assert.equal(opportunity.isQuiet(), true)
  opportunity.reportGame({ visible: true, active: false })
  assert.equal(opportunity.isQuiet(), true)
  opportunity.reportHostInput()
  playing = true
  time = 4999
  assert.equal(opportunity.isQuiet(), false, 'Playing video cannot override recent island input')
  time = 5000
  assert.equal(opportunity.isQuiet(), true)
  opportunity.reportGame({ visible: true, active: true })
  hidden = true
  assert.equal(opportunity.isQuiet(), true)
  hidden = false
  opportunity.reportGame({ visible: true, active: 'wrong' })
  assert.equal(opportunity.isQuiet(), false, 'Malformed activity cannot turn active work quiet')
})
