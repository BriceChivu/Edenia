import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  GLOBAL_ACTION_NAMES
} from '../../src/core/global-action-contract.js'

const indexSource = await readFile(
  new URL('../../index.html', import.meta.url),
  'utf8'
)
const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)

const removedHandlerNames = [
  'applyHistoryAction',
  'closeHistoryActionPopovers',
  'handleHistoryActionScrollHover',
  'stopHistoryActionAutoScroll',
  'toggleHistoryActionPopover'
]

function getElements(source, tagName) {
  return [...source.matchAll(
    new RegExp(`(<${tagName}\\b[^>]*>)([\\s\\S]*?)<\\/${tagName}>`, 'g')
  )].map(match => ({
    content: match[2],
    tag: match[1]
  }))
}

function getOpeningTags(source, tagName) {
  return [...source.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'g'))]
    .map(match => match[0])
}

function getAttribute(tag, name) {
  return tag.match(
    new RegExp(`\\s${name}=(["'])([\\s\\S]*?)\\1`)
  )?.[2] ?? null
}

function hasAttribute(tag, name) {
  return new RegExp(`\\s${name}(?=\\s|=|>)`).test(tag)
}

function findSingle(items, predicate, description) {
  const matches = items.filter(predicate)
  assert.equal(matches.length, 1, `Expected one ${description}`)
  return matches[0]
}

test('static Undo and Redo controls retain their complete contracts', () => {
  const controls = getElements(indexSource, 'button')
  const expectedControls = [
    {
      analyticsAction: 'undoBtn',
      className: 'btn-secondary undo-btn',
      describedBy: 'undoTooltip',
      direction: 'undo',
      id: 'undoBtn',
      label: 'Undo',
      translationKey: 'videos.undo'
    },
    {
      analyticsAction: 'redoBtn',
      className: 'btn-secondary undo-btn redo-btn',
      describedBy: 'redoTooltip',
      direction: 'redo',
      id: 'redoBtn',
      label: 'Redo',
      translationKey: 'videos.redo'
    }
  ]

  for (const expected of expectedControls) {
    const control = findSingle(
      controls,
      element => getAttribute(element.tag, 'id') === expected.id,
      `#${expected.id} control`
    )
    assert.equal(getAttribute(control.tag, 'type'), 'button')
    assert.equal(getAttribute(control.tag, 'class'), expected.className)
    assert.equal(
      getAttribute(control.tag, 'data-undo-redo-action'),
      'toggle'
    )
    assert.equal(
      getAttribute(control.tag, 'data-undo-redo-direction'),
      expected.direction
    )
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      expected.analyticsAction
    )
    assert.equal(getAttribute(control.tag, 'aria-haspopup'), 'true')
    assert.equal(getAttribute(control.tag, 'aria-expanded'), 'false')
    assert.equal(
      getAttribute(control.tag, 'aria-describedby'),
      expected.describedBy
    )
    assert.equal(
      getAttribute(control.tag, 'data-i18n'),
      expected.translationKey
    )
    assert.equal(hasAttribute(control.tag, 'disabled'), true)
    assert.equal(getAttribute(control.tag, 'onclick'), null)
    assert.equal(control.content.trim(), expected.label)
  }
})

test('generated close and scroll controls retain scoped ownership', () => {
  const closeControl = findSingle(
    getElements(appSource, 'button'),
    element => (
      getAttribute(element.tag, 'data-undo-redo-action') === 'close'
    ),
    'generated Undo/Redo close control'
  )
  assert.equal(getAttribute(closeControl.tag, 'type'), 'button')
  assert.equal(
    getAttribute(closeControl.tag, 'class'),
    'mobile-popover-close'
  )
  assert.equal(
    getAttribute(closeControl.tag, 'data-analytics-action'),
    'closeHistoryActionPopovers'
  )
  assert.equal(
    getAttribute(closeControl.tag, 'title'),
    '${escHtml(t(\'settings.close\'))}'
  )
  assert.equal(
    getAttribute(closeControl.tag, 'aria-label'),
    '${escHtml(t(\'settings.close\'))}'
  )
  assert.equal(getAttribute(closeControl.tag, 'onclick'), null)
  assert.equal(closeControl.content.trim(), '×')

  const scrollControl = findSingle(
    getOpeningTags(appSource, 'div'),
    tag => getAttribute(tag, 'data-undo-redo-action') === 'scroll',
    'generated Undo/Redo scroll control'
  )
  assert.equal(
    getAttribute(scrollControl, 'class'),
    'undo-tooltip-scroll'
  )
  assert.equal(getAttribute(scrollControl, 'onmousemove'), null)
  assert.equal(getAttribute(scrollControl, 'onmouseleave'), null)
  assert.equal(getAttribute(scrollControl, 'data-analytics-action'), null)
})

test('all generated history-action buttons retain live identity and content', () => {
  const controls = getElements(appSource, 'button').filter(element => (
    getAttribute(element.tag, 'data-undo-redo-action') === 'apply'
  ))
  assert.equal(controls.length, 7)

  controls.forEach((control, index) => {
    assert.equal(getAttribute(control.tag, 'type'), 'button')
    assert.equal(
      getAttribute(control.tag, 'class'),
      'undo-tooltip-item undo-tooltip-action-btn'
    )
    assert.equal(
      getAttribute(control.tag, 'data-undo-redo-direction'),
      '${direction}'
    )
    assert.equal(
      getAttribute(control.tag, 'data-undo-redo-index'),
      '${index}'
    )
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      'applyHistoryAction'
    )
    assert.equal(getAttribute(control.tag, 'onclick'), null)
    assert.equal(
      control.content.includes(
        `<span class="undo-tooltip-video">\${escHtml(${index === 0 ? 'channelName' : 'title'})}</span>`
      ),
      true
    )
    assert.equal(
      control.content.includes(
        '<span class="undo-tooltip-action">${escHtml(actionText)}</span>'
      ),
      true
    )
    assert.equal(
      control.content.includes(
        `<span class="undo-tooltip-time">\${escHtml(${index === 0 ? 'formatHistoryActionTimestamp(action)' : 'timestamp'})}</span>`
      ),
      true
    )
  })
})

test('migrated Undo and Redo handlers have no inline or legacy ownership', () => {
  const inlineHandlerValues = [indexSource, appSource]
    .flatMap(source => [...source.matchAll(
      /(?<![.\w])\bon[a-z]+\s*=\s*(["'])([\s\S]*?)\1/g
    )].map(match => match[2]))
    .join('\n')
  const globalActionAudit =
    GLOBAL_ACTION_NAMES.join('\n') || 'global action bridge removed'
  assert.notEqual(globalActionAudit, undefined)

  for (const handlerName of removedHandlerNames) {
    const handlerPattern = new RegExp(`\\b${handlerName}\\b`)
    assert.doesNotMatch(inlineHandlerValues, handlerPattern)
    assert.equal(GLOBAL_ACTION_NAMES.includes(handlerName), false)
    assert.doesNotMatch(globalActionAudit, handlerPattern)
  }
})
