import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
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

function createHarness() {
  let translationPrefix = ''
  const elements = new Map([
    ['learnerProfileConflict', element(['hidden'])],
    ['learnerProfileConflictRows', element()],
    ['learnerProfileConflictEmpty', element(['hidden'])],
    ['learnerProfileConflictConfirmation', element(['hidden'])],
    ['learnerProfileConflictConfirmationText', element()],
    ['learnerProfileConflictConfirm', element()],
    ['learnerProfileConflictFeedback', element()],
    ['learnerProfileConflictRecovery', element(['hidden'])],
    ['learnerProfileConflictRecoveryList', element()]
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
      root,
      translate: (key, params = {}) => translationPrefix
        + Object.entries(params).reduce(
          (text, [name, value]) => `${text}|${name}=${value}`,
          key
        )
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

test('resolved conflict view keeps every unchosen version downloadable', () => {
  const { elements, view } = createHarness()

  assert.equal(view.showProtected([
    {
      id: 'conflict-1',
      protectedUntil: 1_789_574_400_000,
      selectedSide: 'device',
      status: 'resolved'
    },
    {
      id: 'conflict-2',
      protectedUntil: 1_789_660_800_000,
      selectedSide: 'cloud',
      status: 'resolved'
    }
  ]), true)
  assert.equal(
    elements.get('learnerProfileConflictRecovery').classList.contains('hidden'),
    false
  )
  const items = elements.get('learnerProfileConflictRecoveryList').children
  assert.equal(items.length, 2)
  assert.deepEqual(items.map(item => ({
    id: item.children[1].dataset.conflictId,
    side: item.children[1].dataset.conflictSide
  })), [
    { id: 'conflict-1', side: 'cloud' },
    { id: 'conflict-2', side: 'device' }
  ])
  for (const item of items) {
    assert.ok(item.children[0].id)
    assert.equal(
      item.children[1].getAttribute('aria-describedby'),
      item.children[0].id
    )
  }
})

test('protected conflict copy refreshes when the active locale changes', () => {
  const { elements, setTranslationPrefix, view } = createHarness()
  const conflict = {
    id: 'conflict-1',
    protectedUntil: 1_789_574_400_000,
    selectedSide: 'device',
    status: 'resolved'
  }

  assert.equal(view.showProtected([conflict]), true)
  setTranslationPrefix('next-locale:')
  view.refreshTranslations()

  const [item] = elements.get('learnerProfileConflictRecoveryList').children
  assert.match(item.children[0].textContent, /^next-locale:/u)
  assert.match(item.children[1].textContent, /^next-locale:/u)
})

test('conflict markup names both versions and offers no automatic merge action', () => {
  assert.match(
    html,
    /data-i18n="profileConflict\.thisDevice">This device</
  )
  assert.match(html, /data-i18n="profileConflict\.cloud">Cloud</)
  assert.match(html, /data-profile-conflict-action="export-both"/)
  assert.match(html, /data-profile-conflict-action="confirm-choice"/)
  assert.doesNotMatch(html, />\s*Combine\s*</i)
  assert.doesNotMatch(html, /data-profile-conflict-action="merge/i)
})
