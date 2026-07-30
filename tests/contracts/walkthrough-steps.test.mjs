import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FIRST_STUDY_WALKTHROUGH_STEPS,
  LEVEL_UP_GUIDANCE_WALKTHROUGH_STEP,
  OTHER_FIRST_STUDY_WALKTHROUGH_STEP,
  resolveWalkthroughTextKey,
  WALKTHROUGH_STEPS
} from '../../src/features/walkthrough/steps.js'

test('main walkthrough preserves exact step order, targets, copy keys, and hooks', () => {
  assert.deepEqual(WALKTHROUGH_STEPS, [
    {
      id: 'town',
      target: '.city-image-wrap',
      textKey: 'walkthrough.town',
      placement: 'bottom'
    },
    {
      id: 'study-history',
      target: '.study-history-section',
      textKey: 'walkthrough.studyHistory',
      noAnkiTextKey: 'walkthrough.studyHistoryNoAnki',
      placement: 'top',
      hooks: { beforeEnter: 'closeTransientUi' }
    },
    {
      id: 'videos',
      target: '.feed-section',
      textKey: 'walkthrough.videos',
      placement: 'top',
      scrollTarget: '.feed-section > .section-header',
      hooks: { beforeEnter: 'closeTransientUi' }
    }
  ])
})

test('walkthrough copy follows Anki activity before responsive fallbacks', () => {
  const step = {
    textKey: 'walkthrough.default',
    mobileTextKey: 'walkthrough.mobile',
    noAnkiTextKey: 'walkthrough.noAnki'
  }

  assert.equal(
    resolveWalkthroughTextKey(step, {
      ankiActive: false,
      phoneComposition: true
    }),
    'walkthrough.noAnki'
  )
  assert.equal(
    resolveWalkthroughTextKey(step, {
      ankiActive: true,
      phoneComposition: true
    }),
    'walkthrough.mobile'
  )
  assert.equal(
    resolveWalkthroughTextKey(step, {
      ankiActive: true,
      phoneComposition: false
    }),
    'walkthrough.default'
  )
})

test('first-study walkthrough preserves exact steps and Other-language addition', () => {
  assert.deepEqual(
    FIRST_STUDY_WALKTHROUGH_STEPS.map(step => step.id),
    ['first-study-channels', 'first-study-feed', 'first-study-video']
  )
  assert.equal(
    FIRST_STUDY_WALKTHROUGH_STEPS[1].target,
    WALKTHROUGH_STEPS[2].target
  )
  assert.equal(
    FIRST_STUDY_WALKTHROUGH_STEPS[1].scrollTarget,
    WALKTHROUGH_STEPS[2].scrollTarget
  )
  assert.equal(
    FIRST_STUDY_WALKTHROUGH_STEPS[2].target,
    '#videoGrid .channel-video-group:first-child .channel-shelf-slot:first-child .video-card'
  )
  assert.equal(FIRST_STUDY_WALKTHROUGH_STEPS[2].spotlightPadding, 6)
  assert.equal(FIRST_STUDY_WALKTHROUGH_STEPS[2].spotlightRadius, 12)
  assert.deepEqual(OTHER_FIRST_STUDY_WALKTHROUGH_STEP, {
    id: 'first-study-other-add-now',
    target: '#manualVideoBtn',
    textKey: 'walkthrough.otherAddNow',
    placement: 'bottom',
    hooks: { beforeEnter: 'closeTransientUi' }
  })
})

test('level-up walkthrough preserves confirmation geometry and hook names', () => {
  assert.deepEqual(LEVEL_UP_GUIDANCE_WALKTHROUGH_STEP, {
    id: 'level-up-ready',
    target: '#levelUpButton',
    textKey: 'walkthrough.levelUpReady',
    actionLabel: 'Ok!',
    placement: 'bottom',
    spotlightPadding: 6,
    spotlightHeightTarget: '.goal-card',
    spotlightVerticalPadding: 0,
    spotlightRadius: 999,
    confirmationOnly: true,
    hooks: {
      afterEnter: 'focusWalkthroughTarget',
      targetClick: 'advanceAfterTargetClick'
    }
  })
})
