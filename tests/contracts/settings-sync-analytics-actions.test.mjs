import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

const controls = Object.fromEntries(
  ['settings.sync.export', 'settings.sync.import'].map(key => [
    key,
    buttonTags.filter(tag => getAttribute(tag, 'data-i18n') === key)
  ])
)

test('Settings sync controls lock identities before listener migration', () => {
  assert.equal(controls['settings.sync.export'].length, 1)
  assert.equal(controls['settings.sync.import'].length, 1)
  const [exportControl] = controls['settings.sync.export']
  const [importControl] = controls['settings.sync.import']

  assert.equal(
    getAttribute(exportControl, 'data-analytics-action'),
    'settings.sync.export'
  )
  assert.equal(getAttribute(exportControl, 'onclick'), 'exportSyncFile()')
  assert.equal(getAttribute(exportControl, 'type'), 'button')

  assert.equal(
    getAttribute(importControl, 'data-analytics-action'),
    'settings.sync.import'
  )
  assert.equal(
    getAttribute(importControl, 'onclick'),
    "document.getElementById('syncFileInput').click()"
  )
  assert.equal(getAttribute(importControl, 'type'), 'button')
})

test('Settings sync controls retain exact generic event names', () => {
  const normalize = action => String(action)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)

  assert.equal(
    `${normalize('settings.sync.export')}_clicked`,
    'settings_sync_export_clicked'
  )
  assert.equal(
    `${normalize('settings.sync.import')}_clicked`,
    'settings_sync_import_clicked'
  )
})
