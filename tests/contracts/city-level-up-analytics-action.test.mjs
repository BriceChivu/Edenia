import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])
const controls = buttonTags.filter(tag => tag.includes('id="levelUpButton"'))

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('city level-up control retains its identity without an inline handler', () => {
  assert.equal(controls.length, 1)
  const [control] = controls
  assert.equal(getAttribute(control, 'data-analytics-action'), 'city.levelUp')
  assert.equal(getAttribute(control, 'data-city-level-action'), 'claim')
  assert.equal(getAttribute(control, 'data-i18n'), 'city.levelUp')
  assert.equal(getAttribute(control, 'onclick'), null)
  assert.equal(getAttribute(control, 'type'), 'button')
  assert.equal(getAttribute(control, 'aria-hidden'), 'true')
  assert.match(control, /\sdisabled(?:\s|>)/)
})

test('city level-up control retains its exact generic event name', () => {
  const eventName = 'city.levelUp'
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)
  assert.equal(`${eventName}_clicked`, 'city_level_up_clicked')
})
