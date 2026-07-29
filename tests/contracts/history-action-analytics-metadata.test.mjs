import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const indexSource = await readFile(
  new URL('../../index.html', import.meta.url),
  'utf8'
)
const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)

function getButtonTags(source) {
  return [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

function findSingleButton(tags, predicate, description) {
  const matches = tags.filter(predicate)
  assert.equal(matches.length, 1, `Expected one ${description}`)
  return matches[0]
}

test('static Undo and Redo controls lock analytics identities before listener migration', () => {
  const buttonTags = getButtonTags(indexSource)
  const expectedControls = [
    {
      id: 'undoBtn',
      analyticsAction: 'undoBtn',
      inlineHandler: "toggleHistoryActionPopover(event, 'undo')"
    },
    {
      id: 'redoBtn',
      analyticsAction: 'redoBtn',
      inlineHandler: "toggleHistoryActionPopover(event, 'redo')"
    }
  ]

  for (const expected of expectedControls) {
    const tag = findSingleButton(
      buttonTags,
      button => getAttribute(button, 'id') === expected.id,
      `#${expected.id} control`
    )
    assert.equal(
      getAttribute(tag, 'data-analytics-action'),
      expected.analyticsAction
    )
    assert.equal(getAttribute(tag, 'onclick'), expected.inlineHandler)
  }
})

test('generated history-action controls lock analytics identities before listener migration', () => {
  const buttonTags = getButtonTags(appSource)
  const closeControl = findSingleButton(
    buttonTags,
    button => (
      getAttribute(button, 'class') === 'mobile-popover-close'
      && getAttribute(button, 'onclick')
        === 'closeHistoryActionPopovers(null, true)'
    ),
    'generated history-action close control'
  )
  assert.equal(
    getAttribute(closeControl, 'data-analytics-action'),
    'closeHistoryActionPopovers'
  )
  assert.equal(
    getAttribute(closeControl, 'onclick'),
    'closeHistoryActionPopovers(null, true)'
  )

  const actionControls = buttonTags.filter(button => (
    getAttribute(button, 'class')
      === 'undo-tooltip-item undo-tooltip-action-btn'
  ))
  assert.equal(actionControls.length, 6)
  for (const control of actionControls) {
    assert.equal(
      getAttribute(control, 'data-analytics-action'),
      'applyHistoryAction'
    )
    assert.equal(
      getAttribute(control, 'onclick'),
      "applyHistoryAction('${direction}', ${index})"
    )
  }
})
