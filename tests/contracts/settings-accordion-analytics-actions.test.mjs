import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])

function findButton(className) {
  const matches = buttonTags.filter(tag => (
    tag.match(/\sclass="([^"]*)"/)?.[1].split(/\s+/).includes(className)
  ))
  assert.equal(matches.length, 1, `Expected one Settings control for ${className}`)
  return matches[0]
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('Settings accordion controls lock pre-migration analytics identities', () => {
  const controls = [
    {
      className: 'settings-howto-toggle',
      action: 'settings.howto.title',
      handler: 'toggleSettingsHowTo()'
    },
    {
      className: 'activity-log-toggle',
      action: 'settings.activity.title',
      handler: 'toggleSettingsActivityLog()'
    },
    {
      className: 'backup-toggle',
      action: 'settings.backups.title',
      handler: 'toggleSettingsBackups()'
    }
  ]

  for (const expected of controls) {
    const tag = findButton(expected.className)
    assert.equal(getAttribute(tag, 'data-analytics-action'), expected.action)
    assert.equal(getAttribute(tag, 'onclick'), expected.handler)
  }
})

test('Settings accordion actions retain exact generic click event names', () => {
  const normalize = value => String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)

  assert.deepEqual(
    [
      'settings.howto.title',
      'settings.activity.title',
      'settings.backups.title'
    ].map(action => `${normalize(action)}_clicked`),
    [
      'settings_howto_title_clicked',
      'settings_activity_title_clicked',
      'settings_backups_title_clicked'
    ]
  )
})
