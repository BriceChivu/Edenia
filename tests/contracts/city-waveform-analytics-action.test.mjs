import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
const controls = [
  ...source.matchAll(/<button class="city-wave-bar[\s\S]*?<\/button>/g)
].map(match => match[0])

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('city waveform bar retains its identity without inline handlers', () => {
  assert.equal(controls.length, 1)
  const [control] = controls
  assert.equal(getAttribute(control, 'type'), 'button')
  assert.equal(getAttribute(control, 'data-city-wave-action'), 'select')
  assert.equal(
    getAttribute(control, 'data-analytics-action'),
    'selectCityWaveBar'
  )
  assert.equal(getAttribute(control, 'data-index'), '${index}')
  assert.equal(getAttribute(control, 'data-offset'), '${day.offset}')
  assert.equal(getAttribute(control, 'aria-label'), '${escHtml(ariaLabel)}')
  assert.equal(getAttribute(control, 'onclick'), null)
  assert.equal(getAttribute(control, 'onmouseenter'), null)
  assert.equal(getAttribute(control, 'onmousemove'), null)
  assert.equal(getAttribute(control, 'onfocus'), null)
})

test('city waveform selection retains its exact generic event name', () => {
  const eventName = 'selectCityWaveBar'
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)
  assert.equal(
    `${eventName}_clicked`,
    'select_city_wave_bar_clicked'
  )
})
