import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])
const controls = buttonTags.filter(tag => (
  tag.match(/\sclass="([^"]*)"/)?.[1]
    .split(/\s+/)
    .includes('activity-log-more')
))

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('Activity Log pagination retains identity without an inline handler', () => {
  assert.equal(controls.length, 1)
  const [control] = controls
  assert.equal(
    getAttribute(control, 'data-activity-log-action'),
    'show-older'
  )
  assert.equal(
    getAttribute(control, 'data-analytics-action'),
    'showOlderActivityLogEntries'
  )
  assert.equal(getAttribute(control, 'onclick'), null)
})

test('Activity Log pagination retains its exact generic event name', () => {
  const eventName = 'showOlderActivityLogEntries'
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)
  assert.equal(
    `${eventName}_clicked`,
    'show_older_activity_log_entries_clicked'
  )
})
