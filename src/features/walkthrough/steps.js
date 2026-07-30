export const WALKTHROUGH_STEPS = [
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
    placement: 'top',
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  },
  {
    id: 'videos',
    target: '.feed-section',
    mobileTarget: '.feed-section > .section-header',
    textKey: 'walkthrough.videos',
    mobileTextKey: 'walkthrough.videosMobile',
    placement: 'top',
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  }
]

export const FIRST_STUDY_WALKTHROUGH_STEPS = [
  {
    id: 'first-study-channels',
    target: '#manualVideoBtn',
    textKey: 'walkthrough.firstStudyChannels',
    placement: 'bottom',
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  },
  {
    id: 'first-study-feed',
    target: '#videoGrid',
    textKey: 'walkthrough.firstStudyFeed',
    placement: 'top',
    scrollTarget: '.feed-controls',
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  },
  {
    id: 'first-study-video',
    target: '#videoGrid .channel-video-group:first-child .channel-shelf-slot:first-child .video-card',
    textKey: 'walkthrough.startWatching',
    placement: 'top',
    spotlightPadding: 6,
    spotlightRadius: 12,
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  }
]

export const OTHER_FIRST_STUDY_WALKTHROUGH_STEP = {
  id: 'first-study-other-add-now',
  target: '#manualVideoBtn',
  textKey: 'walkthrough.otherAddNow',
  placement: 'bottom',
  hooks: {
    beforeEnter: 'closeTransientUi'
  }
}

export const LEVEL_UP_GUIDANCE_WALKTHROUGH_STEP = {
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
}
