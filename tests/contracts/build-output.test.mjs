import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import test from 'node:test'

const siteRoot = new URL('../../_site/', import.meta.url)

async function isFile(relativePath) {
  return (await stat(new URL(relativePath, siteRoot))).isFile()
}

test('build emits the stable public entrypoint contract', async () => {
  const expectedFiles = [
    'index.html',
    'app.js',
    'analytics.js',
    'style.css',
    'config.local.js',
    'Edenia_favicon_round.png',
    'assets/audio/intro-trailer-rainy-10pm.mp4',
    'assets/fonts/space-grotesk-latin.woff2',
    'images/city/level%201.webp',
    'data/channel-catalog.json',
    'data/channel-catalog.community.json',
    'data/channel-catalog.discovered.json'
  ]

  for (const relativePath of expectedFiles) {
    assert.equal(await isFile(relativePath), true, `${relativePath} must be emitted`)
  }

  const dataFiles = (await readdir(new URL('data/', siteRoot))).sort()
  assert.deepEqual(dataFiles, [
    'channel-catalog.community.json',
    'channel-catalog.discovered.json',
    'channel-catalog.json'
  ])
})

test('built index preserves the classic deferred script order and one cache version', async () => {
  const html = await readFile(new URL('index.html', siteRoot), 'utf8')
  const styleMatch = html.match(/style\.css\?v=([^"'&\s>]+)/)
  const analyticsMatch = html.match(/analytics\.js\?v=([^"'&\s>]+)/)
  const appMatch = html.match(/app\.js\?v=([^"'&\s>]+)/)

  assert.ok(styleMatch)
  assert.ok(analyticsMatch)
  assert.ok(appMatch)
  assert.equal(styleMatch[1], analyticsMatch[1])
  assert.equal(styleMatch[1], appMatch[1])

  const configPosition = html.indexOf('<script src="config.local.js" defer></script>')
  const analyticsPosition = html.indexOf('<script src="analytics.js?')
  const appPosition = html.indexOf('<script src="app.js?')
  assert.ok(configPosition > 0)
  assert.ok(configPosition < analyticsPosition)
  assert.ok(analyticsPosition < appPosition)
  assert.ok(html.indexOf('window.EDENIA_ANALYTICS_ENABLED') < configPosition)
})

test('test build contains an empty non-placeholder runtime key', async () => {
  const source = await readFile(new URL('config.local.js', siteRoot), 'utf8')
  assert.match(source, /^window\.EDENIA_CONFIG = /)
  assert.match(source, /"youtubeApiKey": ""/)
  assert.doesNotMatch(source, /PASTE_|AIza/i)
})
