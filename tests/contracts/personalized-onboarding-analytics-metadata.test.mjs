import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  GLOBAL_ACTION_NAMES
} from '../../src/core/global-action-contract.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const analyticsSource = await readFile(
  new URL('../../analytics.js', import.meta.url),
  'utf8'
)

function getAttribute(tag, name) {
  return tag.match(
    new RegExp(`\\s${name}=(["'])([\\s\\S]*?)\\1`)
  )?.[2] ?? null
}

function getElements(source, tagName) {
  return [...source.matchAll(
    new RegExp(`(<${tagName}\\b[^>]*>)([\\s\\S]*?)<\\/${tagName}>`, 'g')
  )].map(match => ({
    content: match[2],
    tag: match[1]
  }))
}

function getFunctionSource(name, nextName) {
  const declaration = new RegExp(
    `(?:async\\s+)?function\\s+${name}\\s*\\(`
  ).exec(appSource)
  assert.ok(declaration, `Expected ${name}`)
  const end = appSource.indexOf(`\nfunction ${nextName}(`, declaration.index)
  assert.notEqual(end, -1, `Expected boundary after ${name}`)
  return appSource.slice(declaration.index, end)
}

function normalizeClickEventName(action) {
  return `${String(action || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)}_clicked`
}

const renderSources = {
  language: getFunctionSource(
    'renderOnboardingLanguageStep',
    'renderOnboardingOtherStep'
  ),
  other: getFunctionSource(
    'renderOnboardingOtherStep',
    'renderOnboardingLevelStep'
  ),
  level: getFunctionSource(
    'renderOnboardingLevelStep',
    'renderOnboardingChannelsStep'
  ),
  channels: getFunctionSource(
    'renderOnboardingChannelsStep',
    'selectOnboardingLanguage'
  )
}

const expectedVariants = {
  language: [
    {
      action: 'selectOnboardingLanguage',
      className: 'onboarding-choice',
      content: [
        '<span class="onboarding-choice-icon" aria-hidden="true">${escHtml(option.icon)}</span>',
        '<span class="onboarding-choice-label">${escHtml(t(`onboarding.language.${option.id}`))}</span>'
      ],
      dataName: 'data-language-id',
      dataValue: '${escHtml(option.id)}',
      disabled: null,
      handler: null,
      ownershipAction: 'select-language',
      pressed: '${option.id === selectedLanguageId}'
    },
    {
      action: 'continuePersonalizedOnboardingFromLanguage',
      className: 'btn-primary',
      content: ["${escHtml(t('onboarding.continue'))}"],
      disabledExpression: "${selectedLanguageId ? '' : 'disabled'}",
      handler: null,
      ownershipAction: 'continue-language',
      pressed: null
    }
  ],
  other: [
    {
      action: 'setPersonalizedOnboardingStep',
      className: 'btn-ghost',
      content: ["${escHtml(t('onboarding.back'))}"],
      disabledExpression: "${personalizedOnboardingState.isApplyingChannels ? 'disabled' : ''}",
      handler: null,
      onboardingStep: 'language',
      ownershipAction: 'set-step',
      pressed: null
    },
    {
      action: 'finishPersonalizedOnboarding',
      className: 'btn-primary',
      content: ["${escHtml(t(personalizedOnboardingState.isApplyingChannels ? 'onboarding.building' : 'onboarding.build'))}"],
      disabledExpression: "${personalizedOnboardingState.isApplyingChannels ? 'disabled' : ''}",
      handler: null,
      ownershipAction: 'finish',
      pressed: null
    }
  ],
  level: [
    {
      action: 'selectOnboardingLevel',
      className: 'onboarding-choice onboarding-level-choice',
      content: [
        '<span class="onboarding-choice-label">${escHtml(t(`onboarding.level.${option.id}.label`))}</span>',
        '<span class="onboarding-choice-detail">${escHtml(t(`onboarding.level.${option.id}.detail`))}</span>'
      ],
      dataName: 'data-level-id',
      dataValue: '${escHtml(option.id)}',
      disabled: null,
      handler: null,
      ownershipAction: 'select-level',
      pressed: '${option.id === selectedLevelId}'
    },
    {
      action: 'setPersonalizedOnboardingStep',
      className: 'btn-ghost',
      content: ["${escHtml(t('onboarding.back'))}"],
      disabled: null,
      handler: null,
      onboardingStep: 'language',
      ownershipAction: 'set-step',
      pressed: null
    },
    {
      action: 'setPersonalizedOnboardingStep',
      className: 'btn-primary',
      content: ["${escHtml(t('onboarding.continue'))}"],
      disabledExpression: "${selectedLevelId ? '' : 'disabled'}",
      handler: null,
      onboardingStep: 'channels',
      ownershipAction: 'set-step',
      pressed: null
    }
  ],
  channels: [
    {
      action: 'toggleOnboardingChannel',
      className: 'onboarding-channel',
      content: [
        '<span class="onboarding-channel-avatar" aria-hidden="true">${avatar}</span>',
        '<span class="onboarding-channel-name">${escHtml(channel.name)}</span>',
        '<span class="onboarding-channel-meta">${escHtml(t(ONBOARDING_CHANNEL_STYLE_KEYS[channel.style] || channel.style))}</span>',
        '<span class="onboarding-channel-check" aria-hidden="true">✓</span>'
      ],
      dataName: 'data-catalog-id',
      dataValue: '${escHtml(channel.id)}',
      disabled: null,
      handler: null,
      ownershipAction: 'toggle-channel',
      pressed: '${selected}'
    },
    {
      action: 'setPersonalizedOnboardingStep',
      className: 'btn-ghost',
      content: ["${escHtml(t('onboarding.back'))}"],
      disabledExpression: "${personalizedOnboardingState.isApplyingChannels ? 'disabled' : ''}",
      handler: null,
      onboardingStep: 'level',
      ownershipAction: 'set-step',
      pressed: null
    },
    {
      action: 'finishPersonalizedOnboarding',
      className: 'btn-primary',
      content: ["${escHtml(t(personalizedOnboardingState.isApplyingChannels ? 'onboarding.building' : 'onboarding.build'))}"],
      disabledExpression: "${personalizedOnboardingState.isApplyingChannels ? 'disabled' : ''}",
      handler: null,
      ownershipAction: 'finish',
      pressed: null
    }
  ]
}

test('all personalized-onboarding variants retain exact order and ownership arguments', () => {
  for (const [step, expectedControls] of Object.entries(expectedVariants)) {
    const controls = getElements(renderSources[step], 'button')
    assert.equal(controls.length, expectedControls.length, step)

    expectedControls.forEach((expected, index) => {
      const control = controls[index]
      assert.equal(getAttribute(control.tag, 'type'), 'button', step)
      assert.equal(
        getAttribute(control.tag, 'class'),
        expected.className,
        step
      )
      assert.equal(
        getAttribute(control.tag, 'onclick'),
        expected.handler,
        step
      )
      if (expected.handler !== null) {
        assert.equal(expected.handler.startsWith('return '), false, step)
      }
      assert.equal(
        getAttribute(
          control.tag,
          'data-personalized-onboarding-action'
        ),
        expected.ownershipAction ?? null,
        step
      )
      assert.equal(
        getAttribute(
          control.tag,
          'data-personalized-onboarding-step'
        ),
        expected.onboardingStep ?? null,
        step
      )
      assert.equal(
        getAttribute(control.tag, 'data-analytics-action'),
        expected.action,
        step
      )
      assert.equal(
        getAttribute(control.tag, 'aria-pressed'),
        expected.pressed,
        step
      )
      if (expected.dataName) {
        assert.equal(
          getAttribute(control.tag, expected.dataName),
          expected.dataValue,
          step
        )
      }
      if (expected.disabledExpression) {
        assert.ok(
          control.tag.includes(expected.disabledExpression),
          `${step} ${expected.action} disabled expression`
        )
      } else {
        assert.equal(getAttribute(control.tag, 'disabled'), null, step)
      }
      for (const content of expected.content) {
        assert.ok(
          control.content.includes(content),
          `${step} ${expected.action} content`
        )
      }
    })
  }
})

test('explicit metadata preserves identities across inline and module ownership', () => {
  const expectedEvents = {
    selectOnboardingLanguage: 'select_onboarding_language_clicked',
    continuePersonalizedOnboardingFromLanguage:
      'continue_personalized_onboarding_from_language_clicked',
    selectOnboardingLevel: 'select_onboarding_level_clicked',
    setPersonalizedOnboardingStep:
      'set_personalized_onboarding_step_clicked',
    toggleOnboardingChannel: 'toggle_onboarding_channel_clicked',
    finishPersonalizedOnboarding:
      'finish_personalized_onboarding_clicked'
  }

  for (const [step, expectedControls] of Object.entries(expectedVariants)) {
    const controls = getElements(renderSources[step], 'button')
    expectedControls.forEach((expected, index) => {
      const control = controls[index]
      const inlineHandler = getAttribute(control.tag, 'onclick')
      if (inlineHandler !== null) {
        const fallbackName = inlineHandler.match(
          /^([a-zA-Z_$][\w$]*)\(/
        )?.[1]
        assert.equal(fallbackName, expected.action, step)
      } else {
        assert.ok(expected.ownershipAction, step)
      }
      assert.equal(
        normalizeClickEventName(expected.action),
        expectedEvents[expected.action],
        step
      )
    })
  }
})

test('generated steps retain synchronous replacement and disabled timing', () => {
  for (const source of Object.values(renderSources)) {
    assert.match(source, /content\.innerHTML = `/)
  }

  const callbackNames = [
    ['selectOnboardingLanguage', 'continuePersonalizedOnboardingFromLanguage'],
    ['continuePersonalizedOnboardingFromLanguage', 'selectOnboardingLevel'],
    ['selectOnboardingLevel', 'setPersonalizedOnboardingStep'],
    ['setPersonalizedOnboardingStep', 'prepareOnboardingChannelSelections'],
    ['toggleOnboardingChannel', 'resolveCuratedChannelEntry']
  ]
  for (const [name, nextName] of callbackNames) {
    const source = getFunctionSource(name, nextName)
    assert.doesNotMatch(source, /\.preventDefault\(|\.stopPropagation\(/)
  }

  assert.match(
    analyticsSource,
    /const control = event\.target\.closest\('button, a'\);\s*if \(!control \|\| control\.disabled\) return;/
  )
  assert.match(
    analyticsSource,
    /const action = control\.dataset\.analyticsAction\s*\|\| control\.dataset\.i18n/
  )
})

test('language and level selection retain reset and replacement behavior', () => {
  const languageSource = getFunctionSource(
    'selectOnboardingLanguage',
    'continuePersonalizedOnboardingFromLanguage'
  )
  assert.match(
    languageSource,
    /if \(!getLearnerLanguageOption\(languageId\)\) return/
  )
  assert.match(
    languageSource,
    /personalizedOnboardingState\.languageId = languageId/
  )
  assert.match(
    languageSource,
    /personalizedOnboardingState\.selectedChannelCatalogIds = \[\]\s*personalizedOnboardingState\.channelSelectionsInitialized = false\s*renderPersonalizedOnboarding\(\)/
  )

  const continueSource = getFunctionSource(
    'continuePersonalizedOnboardingFromLanguage',
    'selectOnboardingLevel'
  )
  assert.match(
    continueSource,
    /setPersonalizedOnboardingStep\(personalizedOnboardingState\.languageId === 'other' \? 'other' : 'level'\)/
  )

  const levelSource = getFunctionSource(
    'selectOnboardingLevel',
    'setPersonalizedOnboardingStep'
  )
  assert.match(levelSource, /if \(!getLearnerLevelOption\(levelId\)\) return/)
  assert.match(
    levelSource,
    /personalizedOnboardingState\.levelId = levelId/
  )
  assert.match(
    levelSource,
    /personalizedOnboardingState\.selectedChannelCatalogIds = \[\]\s*personalizedOnboardingState\.channelSelectionsInitialized = false\s*renderPersonalizedOnboarding\(\)/
  )
})

test('step navigation retains guards, directional analytics, and rerendering', () => {
  const source = getFunctionSource(
    'setPersonalizedOnboardingStep',
    'prepareOnboardingChannelSelections'
  )
  assert.match(
    source,
    /if \(!\['language', 'level', 'channels', 'other'\]\.includes\(step\)\) return/
  )
  assert.match(
    source,
    /if \(step === 'channels' && !personalizedOnboardingState\.levelId\) return/
  )
  assert.match(
    source,
    /trackEdeniaEvent\(\s*nextIndex >= previousIndex \? 'onboarding_step_advanced' : 'onboarding_step_backed',/
  )
  assert.match(
    source,
    /previous_step: previousStep,\s*next_step: step,\s*learning_language: personalizedOnboardingState\.languageId \|\| null,\s*learner_level: personalizedOnboardingState\.levelId \|\| null,\s*selected_channel_count: personalizedOnboardingState\.selectedChannelCatalogIds\.length/
  )
  assert.match(source, /renderPersonalizedOnboarding\(\)/)
})

test('channel toggling retains guards, limit feedback, and live visual state', () => {
  const source = getFunctionSource(
    'toggleOnboardingChannel',
    'resolveCuratedChannelEntry'
  )
  assert.match(
    source,
    /if \(!getCuratedChannelEntry\(catalogId\) \|\| personalizedOnboardingState\.isApplyingChannels\) return/
  )
  assert.match(
    source,
    /const selectionLimit = getOnboardingChannelSelectionLimit\(state\)[\s\S]*?if \(selectedIds\.size >= selectionLimit\) \{[\s\S]*?showTrackedChannelAddRestriction\([\s\S]*?showToast\(t\('onboarding\.channels\.limit', \{ count: ONBOARDING_CHANNEL_SELECTION_LIMIT \}\), 'warn'\)[\s\S]*?return\s*\}/
  )
  assert.match(
    source,
    /personalizedOnboardingState\.selectedChannelCatalogIds = \[\.\.\.selectedIds\]\s*const control = \[\.\.\.document\.querySelectorAll\('\.onboarding-channel'\)\][\s\S]*?control\?\.setAttribute\('aria-pressed', String\(selectedIds\.has\(catalogId\)\)\)\s*syncOnboardingChoiceLayout\(\)/
  )
  assert.doesNotMatch(source, /renderPersonalizedOnboarding\(\)/)
})

test('finish retains synchronous busy replacement and performs no awaited work', () => {
  const source = getFunctionSource(
    'finishPersonalizedOnboarding',
    'getPostOnboardingAppUrl'
  )
  assert.match(
    source,
    /^async function finishPersonalizedOnboarding\(\) \{\s*if \(personalizedOnboardingState\.isApplyingChannels\) return/
  )
  const busyIndex = source.indexOf(
    'personalizedOnboardingState.isApplyingChannels = true'
  )
  const renderIndex = source.indexOf(
    'renderPersonalizedOnboarding()',
    busyIndex
  )
  assert.notEqual(busyIndex, -1)
  assert.ok(renderIndex > busyIndex)
  assert.doesNotMatch(source, /\bawait\b/)
  assert.doesNotMatch(source, /\.preventDefault\(|\.stopPropagation\(/)
  assert.doesNotMatch(source, /\bbutton\.disabled/)
})

test('finish retains persistence, recovery, completion analytics, and redirect', () => {
  const source = getFunctionSource(
    'finishPersonalizedOnboarding',
    'getPostOnboardingAppUrl'
  )
  assert.match(
    source,
    /const selectedChannelCatalogIds = personalizedOnboardingState\.selectedChannelCatalogIds\s*\.slice\(0, ONBOARDING_CHANNEL_SELECTION_LIMIT\)[\s\S]*?state\.learnerProfile = \{\s*languages: \[personalizedOnboardingState\.languageId\]\.filter\(Boolean\),\s*level: personalizedOnboardingState\.levelId,\s*selectedChannelCatalogIds,/
  )
  assert.match(
    source,
    /showOnboardingRecovery\('storage', \{ state, resume: 'complete' \}\)/
  )
  assert.match(
    source,
    /trackEdeniaEvent\('onboarding_completed', \{\s*learning_languages: state\.learnerProfile\.languages,\s*learner_level: state\.learnerProfile\.level \|\| null,\s*selected_channel_count: state\.learnerProfile\.selectedChannelCatalogIds\.length,\s*added_channel_count: 0,\s*resolved_channel_count: 0,\s*failed_channel_count: 0,\s*refresh_result: selectedChannelCatalogIds\.length \? 'queued' : 'not_requested'/
  )
  assert.match(
    source,
    /stopIntroMusic\(\{ fadeDuration: 7\.5 \}\)\s*window\.location\.assign\(getPostOnboardingAppUrl\(\)\)/
  )
})

test('personalized onboarding callbacks no longer require bridge aliases', () => {
  const globalActionAudit =
    GLOBAL_ACTION_NAMES.join('\n') || 'global action bridge removed'
  assert.ok(globalActionAudit)
  assert.equal(
    GLOBAL_ACTION_NAMES.includes('finishPersonalizedOnboarding'),
    false
  )
  assert.doesNotMatch(
    globalActionAudit,
    /(?:^|[\s,])finishPersonalizedOnboarding(?:[\s,]|$)/
  )
})
