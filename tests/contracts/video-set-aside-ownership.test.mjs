import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import test from 'node:test'
import { GLOBAL_ACTION_NAMES } from '../../src/core/global-action-contract.js'

const indexSource = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')

const migratedActionNames = [
  'requestVideoSetAside',
  'cancelVideoSetAsidePrompt',
  'confirmVideoSetAsidePrompt',
  'handleVideoSetAsidePromptKeydown'
]

function bindingSource(rootName) {
  return new RegExp(
    `bindVideoSetAsideActions\\(${rootName},\\s*\\{([\\s\\S]*?)\\}\\)`,
    'g'
  )
}

function bindingMap(source, rootName) {
  return [...source.matchAll(bindingSource(rootName))].map(match => Object.fromEntries(
    [...match[1].matchAll(/\b(\w+):\s*(\w+)/g)]
      .map(binding => [binding[1], binding[2]])
  ))
}

async function getJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(entries.map(entry => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory)
    if (entry.isDirectory()) return getJavaScriptFiles(url)
    return extname(entry.name) === '.js' ? [url] : []
  }))
  return nestedFiles.flat()
}

test('static and generated Set aside controls keep their dialog and surface markup', () => {
  assert.match(
    indexSource,
    /id="setAsidePrompt"[\s\S]*?data-video-set-aside-action="prompt"[\s\S]*?role="dialog"/
  )
  assert.match(appSource, /data-video-set-aside-surface="continue_watching"/)
  assert.match(appSource, /data-video-set-aside-surface="video_card"/)
  assert.match(appSource, /import \{ bindVideoSetAsideActions \} from '\.\/features\/videos\/set-aside-actions\.js'/)
})

test('app composition binds every Set aside surface behind the legacy branch', () => {
  const expectedActions = {
    request: 'requestVideoSetAside',
    cancel: 'cancelVideoSetAsidePrompt',
    confirm: 'confirmVideoSetAsidePrompt',
    handlePromptKeydown: 'handleVideoSetAsidePromptKeydown'
  }
  assert.deepEqual(bindingMap(appSource, 'document'), [expectedActions])
  assert.deepEqual(bindingMap(appSource, 'container'), [expectedActions])
  assert.deepEqual(bindingMap(appSource, 'grid'), [expectedActions])
  assert.match(
    appSource,
    /if \(VIDEO_ORGANIZATION_ENABLED\) \{[\s\S]*?\}\s*else \{\s*bindVideoSetAsideActions\(document,/
  )
})

test('Set aside owners do not leak through inline handlers or the global bridge', async () => {
  const sourceFiles = [
    new URL('../../index.html', import.meta.url),
    ...await getJavaScriptFiles(new URL('../../src/', import.meta.url))
  ]
  const inlineHandlerPattern = /(?<![.\w])\bon[a-z]+\s*=\s*(["'])([\s\S]*?)\1/g
  const inlineHandlers = []
  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, 'utf8')
    for (const match of source.matchAll(inlineHandlerPattern)) {
      inlineHandlers.push(match[2])
    }
  }

  for (const actionName of migratedActionNames) {
    const actionPattern = new RegExp(`\\b${actionName}\\b`)
    assert.equal(inlineHandlers.some(handler => actionPattern.test(handler)), false)
    assert.equal(GLOBAL_ACTION_NAMES.includes(actionName), false)
  }
})
