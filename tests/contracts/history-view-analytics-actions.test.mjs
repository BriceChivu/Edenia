import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])

function findButton(view) {
  const matches = buttonTags.filter(tag => (
    tag.includes(`data-history-view="${view}"`)
  ))
  assert.equal(matches.length, 1, `Expected one history view control for ${view}`)
  return matches[0]
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('Study History view controls retain analytics identities without inline handlers', () => {
  const controls = [
    {
      view: 'summary',
      action: 'history.summary'
    },
    {
      view: 'heatmap',
      action: 'history.heatmap'
    }
  ]

  for (const expected of controls) {
    const tag = findButton(expected.view)
    assert.equal(getAttribute(tag, 'data-analytics-action'), expected.action)
    assert.equal(getAttribute(tag, 'onclick'), null)
  }
})

test('Study History view actions retain exact generic click event names', () => {
  const normalize = value => String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)

  assert.deepEqual(
    ['history.summary', 'history.heatmap'].map(
      action => `${normalize(action)}_clicked`
    ),
    ['history_summary_clicked', 'history_heatmap_clicked']
  )
})
