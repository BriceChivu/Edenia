import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const waveform = source.match(
  /<div class="city-time-waveform" id="cityTimeWaveform"[^>]*>/
)?.[0] || ''

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('static city waveform has scoped mouse ownership without inline handlers', () => {
  assert.notEqual(waveform, '')
  assert.equal(getAttribute(
    waveform,
    'data-city-waveform-action'
  ), 'mouse-preview')
  assert.equal(getAttribute(waveform, 'data-i18n-aria-label'), 'city.timeline')
  assert.equal(getAttribute(waveform, 'onmouseenter'), null)
  assert.equal(getAttribute(waveform, 'onmousemove'), null)
  assert.equal(getAttribute(waveform, 'onmouseleave'), null)
  assert.equal(getAttribute(waveform, 'data-analytics-action'), null)
})
