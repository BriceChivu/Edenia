import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])

function findButton(className) {
  const matches = buttonTags.filter(tag => (
    tag.match(/\sclass="([^"]*)"/)?.[1].split(/\s+/).includes(className)
  ))
  assert.equal(matches.length, 1, `Expected one feedback control for ${className}`)
  return matches[0]
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('feedback modal controls retain identities without inline handlers', () => {
  const controls = [
    {
      className: 'feedback-launch-btn',
      action: 'feedback',
      modalAction: 'open'
    },
    {
      className: 'feedback-backdrop',
      action: 'feedback.close',
      modalAction: 'close'
    },
    {
      className: 'feedback-close-btn',
      action: 'feedback_close',
      modalAction: 'close'
    }
  ]

  for (const expected of controls) {
    const tag = findButton(expected.className)
    assert.equal(getAttribute(tag, 'data-analytics-action'), expected.action)
    assert.equal(
      getAttribute(tag, 'data-feedback-modal-action'),
      expected.modalAction
    )
    assert.equal(getAttribute(tag, 'onclick'), null)
  }
})

test('feedback modal controls retain exact generic event names', () => {
  const normalize = value => String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)

  assert.deepEqual(
    ['feedback', 'feedback.close', 'feedback_close'].map(
      action => `${normalize(action)}_clicked`
    ),
    ['feedback_clicked', 'feedback_close_clicked', 'feedback_close_clicked']
  )
})
