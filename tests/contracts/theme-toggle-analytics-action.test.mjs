import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])
const themeButtons = buttonTags.filter(tag => tag.includes('id="themeToggle"'))

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('theme toggle locks its pre-migration analytics identity', () => {
  assert.equal(themeButtons.length, 1)
  const [button] = themeButtons
  assert.equal(getAttribute(button, 'data-analytics-action'), 'themeToggle')
  assert.equal(getAttribute(button, 'onclick'), 'toggleTheme()')
})

test('theme toggle retains its exact generic click event name', () => {
  const eventName = 'themeToggle'
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)
  assert.equal(`${eventName}_clicked`, 'theme_toggle_clicked')
})
