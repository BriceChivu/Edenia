import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { I18N } from '../../src/i18n/index.js'
import {
  createLearnerProfileConflictView
} from '../../src/features/profile-access/conflict-view.js'

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8')

function element(initialClasses = []) {
  const classes = new Set(initialClasses)
  const attributes = new Map()
  return {
    children: [],
    className: '',
    classList: {
      add: value => classes.add(value),
      contains: value => classes.has(value),
      remove: value => classes.delete(value)
    },
    dataset: {},
    disabled: false,
    focused: false,
    hidden: true,
    scope: '',
    textContent: '',
    append(...children) {
      this.children.push(...children)
    },
    focus() {
      this.focused = true
    },
    getAttribute(name) {
      return attributes.get(name) || null
    },
    querySelectorAll() {
      return []
    },
    replaceChildren(...children) {
      this.children = children
    },
    setAttribute(name, value) {
      attributes.set(name, String(value))
    }
  }
}

function createHarness(viewOptions = {}) {
  let translationPrefix = ''
  const elements = new Map([
    ['learnerProfileConflict', element(['hidden'])],
    ['learnerProfileConflictRows', element()],
    ['learnerProfileConflictIslands', element()],
    ['learnerProfileConflictEnlarge', element()],
    ['learnerProfileConflictChooseDevice', element()],
    ['learnerProfileConflictChooseCloud', element()],
    ['learnerProfileConflictEmpty', element(['hidden'])],
    ['learnerProfileConflictConfirmation', element(['hidden'])],
    ['learnerProfileConflictConfirmationText', element()],
    ['learnerProfileConflictConfirm', element()],
    ['learnerProfileConflictFeedback', element()]
  ])
  const root = {
    createElement: () => element(),
    getElementById: id => elements.get(id) || null
  }
  return {
    elements,
    setTranslationPrefix(value) {
      translationPrefix = value
    },
    view: createLearnerProfileConflictView({
      formatDateTime: value => `date:${value}`,
      formatNumber: value => `number:${value}`,
      now: () => 0,
      root,
      translate: (key, params = {}) => translationPrefix
        + Object.entries(params).reduce(
          (text, [name, value]) => `${text}|${name}=${value}`,
          key
        ),
      ...viewOptions
    })
  }
}

test('conflict view renders only meaningful rows and a focused confirmation', () => {
  const { elements, view } = createHarness()
  const rendered = view.renderConflict({
    cloud: {
      profile: {
        learnerProfile: { languages: ['mandarin'], level: 'beginner' }
      }
    },
    device: {
      profile: {
        learnerProfile: { languages: ['french'], level: 'intermediate' }
      }
    },
    status: 'open'
  })

  assert.equal(rendered, true)
  assert.equal(
    elements.get('learnerProfileConflict').classList.contains('hidden'),
    false
  )
  const tableRows = elements.get('learnerProfileConflictRows').children
  assert.equal(tableRows.length, 1)
  assert.equal(
    tableRows[0].children[0].textContent,
    'profileConflict.category.language-level'
  )
  assert.equal(view.requestChoice('cloud'), true)
  assert.equal(
    elements.get('learnerProfileConflictConfirmation').hidden,
    false
  )
  assert.equal(
    elements.get('learnerProfileConflictConfirmation').classList
      .contains('hidden'),
    false
  )
  assert.equal(
    elements.get('learnerProfileConflictConfirm').dataset.conflictSide,
    'cloud'
  )
  assert.equal(elements.get('learnerProfileConflictConfirm').focused, true)
})

test('conflicts without compared differences show an explanation and hide it when differences return', () => {
  const { elements, view } = createHarness()
  const shared = { learnerProfile: { languages: ['french'] } }
  const empty = elements.get('learnerProfileConflictEmpty')
  view.renderConflict({
    cloud: { profile: structuredClone(shared) },
    device: { profile: shared },
    status: 'open'
  })
  assert.equal(empty.hidden, false)
  assert.equal(empty.classList.contains('hidden'), false)

  view.renderConflict({
    cloud: { profile: { learnerProfile: { languages: ['mandarin'] } } },
    device: { profile: shared },
    status: 'open'
  })
  assert.equal(empty.hidden, true)
})

test('conflict markup names both versions and offers no automatic merge action', () => {
  assert.match(
    html,
    /data-i18n="profileConflict\.thisDevice">This device</
  )
  assert.match(html, /data-i18n="profileConflict\.cloud">Cloud</)
  assert.doesNotMatch(html, /data-profile-conflict-action="export-(both|device|cloud)"/)
  assert.match(html, /id="learnerProfileConflictIslands"/)
  assert.match(html, /Your device version differs from the Cloud version\. Choose which one to use\./)
  assert.match(html, /data-profile-conflict-action="confirm-choice"/)
  assert.doesNotMatch(html, />\s*Combine\s*</i)
  assert.doesNotMatch(html, /data-profile-conflict-action="merge/i)
})

test('economy comparisons remain hidden publicly even when cloud contains internal economy', () => {
  const conflict = { status: 'open', device: { profile: {} }, cloud: { profile: { townEconomy: { version: 1, mode: 'legacy', rewards: {}, purchases: { 'garden-flower-1': 0 } } } } }
  for (const enabled of [false, true]) {
    const { view, elements } = createHarness({ isTownEconomyEnabled: () => enabled })
    view.renderConflict(conflict)
    assert.equal(elements.get('learnerProfileConflictRows').children.length, enabled ? 1 : 0)
  }
})

test('island previews replace the redundant island-difference table row', () => {
  const { elements, view } = createHarness()
  assert.equal(view.renderConflict({ status: 'open',
    device: { profile: { tinySwordsIsland: { opaque: 1 } } },
    cloud: { profile: { tinySwordsIsland: { opaque: 2 } } } }), true)
  const rows = elements.get('learnerProfileConflictRows').children
  assert.equal(rows.length, 0)
  assert.equal(elements.get('learnerProfileConflictIslands').children.length, 2)
  assert.equal(elements.get('learnerProfileConflictEmpty').hidden, true)
})


test('previews receive isolated copies and stale captures cannot reveal a previous conflict', () => {
  const calls = []
  let disposed = 0
  const { elements, view } = createHarness({ createIslandPreviews(options) {
    calls.push(options)
    return () => { disposed += 1 }
  } })
  const conflict = { status: 'open', device: { profile: { tinySwordsIsland: { version: 1 } } }, cloud: { profile: {} } }
  const original = structuredClone(conflict)
  view.renderConflict(conflict)
  calls[0].layouts[0].version = 99
  assert.deepEqual(conflict, original)
  view.renderConflict(conflict)
  assert.equal(calls.length, 1)
  const oldImage = elements.get('learnerProfileConflictIslands').children[0].children[1]
  view.hideConflict()
  calls[0].onImage(0, 'data:image/png;base64,old')
  assert.equal(oldImage.hidden, true)
  assert.equal(disposed, 1)
  view.renderConflict(conflict)
  calls[1].onImage(0, 'data:image/png;base64,current')
  assert.equal(elements.get('learnerProfileConflictIslands').children[0].children[1].hidden, false)
  assert.equal(elements.get('learnerProfileConflictIslands').children[0].children[2].hidden, true)
  assert.equal(elements.get('learnerProfileConflictIslands').children[1].children[2].textContent, 'profileConflict.value.islandAbsent')
  view.setBusy(true)
  assert.equal(disposed, 2)
  assert.equal(view.requestChoice('cloud'), false)
})

test('unavailable or oversized previews never block the choice', () => {
  const { elements, view } = createHarness({ createIslandPreviews() { throw new Error('GPU unavailable') } })
  view.renderConflict({ status: 'open', device: { profile: { tinySwordsIsland: {} } }, cloud: { profile: {} } })
  assert.equal(elements.get('learnerProfileConflictIslands').children[0].children[2].textContent, 'profileConflict.preview.unavailable')
  assert.equal(view.requestChoice('device'), true)
  view.renderConflict({ status: 'open', device: { profile: { tinySwordsIsland: { huge: 'x'.repeat(524288) } } }, cloud: { profile: {} } })
  assert.equal(view.requestChoice('cloud'), true)
})

test('lower progress uses the secondary outline while ambiguous evidence keeps both primary', () => {
  const { elements, view } = createHarness()
  const device = elements.get('learnerProfileConflictChooseDevice')
  const cloud = elements.get('learnerProfileConflictChooseCloud')
  view.renderConflict({ status: 'open', device: { profile: {} }, cloud: { profile: { anki: { day: { reviewed: 20 } } } } })
  assert.equal(device.classList.contains('btn-secondary'), true)
  assert.equal(cloud.classList.contains('btn-primary'), true)
  view.renderConflict({ status: 'open', device: { profile: {} }, cloud: { profile: {} } })
  assert.equal(device.classList.contains('btn-primary'), true)
  assert.equal(cloud.classList.contains('btn-primary'), true)
})


test('recent channel refresh activity names the channel instead of repeating a generic title', () => {
  const { elements, view } = createHarness()
  view.renderConflict({ status: 'open', cloud: { profile: {} }, device: { profile: {
    config: { channels: [{ id: 'channel-1', name: 'Mandarin Stories' }] },
    activityLog: [{ id: 'refresh', type: 'youtube-refresh', title: 'YouTube channel refreshed',
      createdAt: '2026-10-14T12:20:00Z', detail: 'Fetched new videos', meta: { channelId: 'channel-1' } }]
  } } })
  const recent = elements.get('learnerProfileConflictRows').children.find(row => row.children[0].textContent === 'profileConflict.category.recent-activity')
  assert.match(recent.children[1].children[1].textContent, /Mandarin Stories/)
})

test('no island previews are displayed when both versions have no island', () => {
  let captures = 0
  const { elements, view } = createHarness({ createIslandPreviews() { captures += 1 } })
  view.renderConflict({ status: 'open', device: { profile: {} }, cloud: { profile: {} } })
  assert.equal(elements.get('learnerProfileConflictIslands').hidden, true)
  assert.equal(elements.get('learnerProfileConflictIslands').children.length, 0)
  assert.equal(captures, 0)
  view.renderConflict({ status: 'open', device: { profile: { tinySwordsIsland: {} } }, cloud: { profile: {} } })
  assert.equal(elements.get('learnerProfileConflictIslands').hidden, false)
})

test('busy choice disables the entire gate and rejects replacement choices', () => {
  const controls = [element(), element(), element(), element()]
  const gate = element()
  gate.querySelectorAll = () => controls
  const { elements, view } = createHarness()
  // Test a gate root separately, including Sign out outside the comparison.
  const root = { getElementById: id => id === 'learnerProfileAccessGate' ? gate : elements.get(id), createElement: () => element() }
  const gated = createLearnerProfileConflictView({ root, translate: key => key })
  gated.requestChoice('cloud')
  gated.setBusy(true)
  assert.equal(controls.every(control => control.disabled), true)
  assert.equal(gated.requestChoice('device'), false)
  gated.cancelChoice()
  assert.equal(elements.get('learnerProfileConflictConfirm').dataset.conflictSide, 'cloud')
  gated.setBusy(false)
  assert.equal(controls.every(control => !control.disabled), true)
})

for (const locale of ['en', 'zh-Hant', 'zh-Hans', 'es', 'fr']) {
  test(`conflict language codes have readable ${locale} labels`, () => {
    const dictionary = I18N[locale]
    const { elements, view } = createHarness({ translate: (key, params = {}) =>
      Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), dictionary[key] || key) })
    view.renderConflict({ status: 'open', device: { profile: { learnerProfile: { languages: ['zh-Hant'], level: 'beginner' } } }, cloud: { profile: { learnerProfile: { languages: ['zh-Hans'], level: 'intermediate' } } } })
    const text = elements.get('learnerProfileConflictRows').children[0].children[1].children[1].textContent
    assert.ok(text.includes(dictionary['onboarding.language.mandarin']))
    assert.ok(!text.includes('onboarding.language.'))
  })
}
