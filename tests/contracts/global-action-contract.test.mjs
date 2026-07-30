import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import test from 'node:test'
import {
  GLOBAL_ACTION_NAMES
} from '../../src/core/global-action-contract.js'

const INLINE_HANDLER_CANDIDATE_PATTERN = /(?<![.\w])\bon[a-z]+\s*=/g
const INLINE_HANDLER_PATTERN =
  /(?<![.\w])\b(on[a-z]+)\s*=\s*(["'])([\s\S]*?)\2/g
const HANDLER_CALL_PATTERN = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g
const TEMPLATE_PLACEHOLDER_PATTERN = /\$\{[^{}]*\}/g
const NON_ACTION_CALLS = new Set(['Boolean', 'Number', 'String'])

async function getJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(entries.map(entry => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory)
    if (entry.isDirectory()) return getJavaScriptFiles(url)
    return extname(entry.name) === '.js' ? [url] : []
  }))
  return nestedFiles.flat()
}

function findInlineActionNames(source) {
  const actionNames = new Set()
  const candidates = [...source.matchAll(INLINE_HANDLER_CANDIDATE_PATTERN)]
  const attributes = [...source.matchAll(INLINE_HANDLER_PATTERN)]
  assert.equal(
    attributes.length,
    candidates.length,
    'Every inline handler assignment must use a quoted, auditable value'
  )

  for (const attributeMatch of attributes) {
    const handlerSource = attributeMatch[3].replace(
      TEMPLATE_PLACEHOLDER_PATTERN,
      ''
    )
    assert.doesNotMatch(
      handlerSource,
      /\$\{/,
      'Every generated handler interpolation must be fully auditable'
    )
    for (const callMatch of handlerSource.matchAll(HANDLER_CALL_PATTERN)) {
      if (!NON_ACTION_CALLS.has(callMatch[1])) actionNames.add(callMatch[1])
    }
  }
  return [...actionNames]
}

test('all static and generated handlers have module ownership', async () => {
  const appSource = await readFile(
    new URL('../../src/app.js', import.meta.url),
    'utf8'
  )
  const sourceFiles = [
    new URL('../../index.html', import.meta.url),
    ...await getJavaScriptFiles(new URL('../../src/', import.meta.url))
  ]
  const discoveredNames = new Set()

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, 'utf8')
    findInlineActionNames(source).forEach(name => discoveredNames.add(name))
  }

  assert.deepEqual([...discoveredNames].sort(), GLOBAL_ACTION_NAMES)
  assert.doesNotMatch(appSource, /\binstallLegacyActions\b|\bEdeniaActions\b/)
})

test('global action contract is frozen and empty', () => {
  assert.equal(Object.isFrozen(GLOBAL_ACTION_NAMES), true)
  assert.deepEqual(GLOBAL_ACTION_NAMES, [])
})
