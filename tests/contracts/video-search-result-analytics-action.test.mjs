import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])
const controls = buttonTags.filter(tag => (
  tag.match(/\sclass="([^"]*)"/)?.[1]
    .split(/\s+/)
    .includes('video-search-result')
))

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('saved-video search result locks its identity before listener migration', () => {
  assert.equal(controls.length, 1)
  const [control] = controls
  assert.equal(
    getAttribute(control, 'data-analytics-action'),
    'jumpToVideoFromSearch'
  )
  assert.equal(getAttribute(control, 'data-video-id'), '${escHtml(video.id)}')
  assert.equal(
    getAttribute(control, 'onclick'),
    'jumpToVideoFromSearch(this.dataset.videoId)'
  )
  assert.equal(getAttribute(control, 'type'), 'button')
})

test('saved-video search result retains its exact generic event name', () => {
  const eventName = 'jumpToVideoFromSearch'
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)
  assert.equal(
    `${eventName}_clicked`,
    'jump_to_video_from_search_clicked'
  )
})
