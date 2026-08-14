import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8')

function getCodeBlock(attribute) {
  const blockMatch = html.match(
    new RegExp(`<div(?=[^>]*\\b${attribute}\\b)[^>]*>([\\s\\S]*?)<\\/div>`)
  )
  assert.ok(blockMatch, `missing ${attribute} code block`)

  const lines = [...blockMatch[1].matchAll(/<code>([\s\S]*?)<\/code>/g)]
    .map(match => match[1])
  assert.ok(lines.length, `missing code in ${attribute}`)
  return lines.join('\n')
}

test('Anki preference follows its explanation inside How to', () => {
  const howToStart = html.indexOf('id="settingsHowToContent"')
  const explanation = html.indexOf('data-i18n="settings.anki.whatIntro"')
  const preference = html.indexOf('id="settingsAnkiEnabled"')
  const connectHeading = html.indexOf('class="settings-anki-connect-heading"')

  assert.ok(howToStart >= 0)
  assert.ok(howToStart < explanation)
  assert.ok(explanation < preference)
  assert.ok(preference < connectHeading)
  assert.match(
    html,
    /data-i18n="settings\.anki\.enabled">Enable Anki<\/span>/
  )
  assert.doesNotMatch(html, /settings\.anki\.toggleHint/)
})

test('Anki setup copy fragment extends the existing origin as valid JSON', () => {
  const existingOrigin = getCodeBlock('data-anki-config-existing-origin')
  const insertion = getCodeBlock('data-anki-config-insert')

  assert.equal(existingOrigin, '"http://localhost"')
  assert.equal(insertion, ',"https://www.edenia.study"')
  assert.deepEqual(
    JSON.parse(`[${existingOrigin}${insertion}]`),
    ['http://localhost', 'https://www.edenia.study']
  )
})

test('Anki setup configuration example is valid and preserves expected settings', () => {
  const example = getCodeBlock('data-anki-config-example')
  const config = JSON.parse(example)

  assert.deepEqual(config, {
    apiKey: null,
    apiLogPath: null,
    ignoreOriginList: [],
    webBindAddress: '127.0.0.1',
    webBindPort: 8765,
    webCorsOriginList: [
      'http://localhost',
      'https://www.edenia.study'
    ]
  })
})
