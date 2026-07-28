import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])

function findButton(filter) {
  const matches = buttonTags.filter(tag => (
    tag.includes(`data-activity-log-filter="${filter}"`)
  ))
  assert.equal(matches.length, 1, `Expected one Activity Log filter for ${filter}`)
  return matches[0]
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('Activity Log filters retain analytics identities without inline handlers', () => {
  const filters = ['all', 'user', 'auto', 'issues', 'points']
  for (const filter of filters) {
    const tag = findButton(filter)
    assert.equal(
      getAttribute(tag, 'data-analytics-action'),
      `settings.activity.${filter}`
    )
    assert.equal(getAttribute(tag, 'onclick'), null)
  }
})

test('Activity Log filters retain exact generic click event names', () => {
  const normalize = value => String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)

  assert.deepEqual(
    ['all', 'user', 'auto', 'issues', 'points'].map(
      filter => `${normalize(`settings.activity.${filter}`)}_clicked`
    ),
    [
      'settings_activity_all_clicked',
      'settings_activity_user_clicked',
      'settings_activity_auto_clicked',
      'settings_activity_issues_clicked',
      'settings_activity_points_clicked'
    ]
  )
})
