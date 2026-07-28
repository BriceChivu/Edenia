import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('Settings replay controls lock identities and retain inline handlers', () => {
  const controls = buttonTags.filter(tag => (
    tag.match(/\sclass="([^"]*)"/)?.[1]
      .split(/\s+/)
      .includes('walkthrough-replay-btn')
  ))
  assert.equal(controls.length, 2)
  assert.deepEqual(controls.map(control => ({
    action: getAttribute(control, 'data-analytics-action'),
    handler: getAttribute(control, 'onclick')
  })), [
    {
      action: 'settings.walkthroughAgain',
      handler: 'showWalkthroughAgain()'
    },
    {
      action: 'settings.trailerAgain',
      handler: 'showTrailerAgain()'
    }
  ])
})

test('Settings replay controls retain exact generic event names', () => {
  const normalize = value => String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)

  assert.deepEqual(
    ['settings.walkthroughAgain', 'settings.trailerAgain'].map(
      action => `${normalize(action)}_clicked`
    ),
    [
      'settings_walkthrough_again_clicked',
      'settings_trailer_again_clicked'
    ]
  )
})
