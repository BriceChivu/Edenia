import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import test from 'node:test'
import {
  installLegacyActions,
  LEGACY_ACTION_NAMES
} from '../../src/compat/legacy-actions.js'

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

test('legacy action manifest exactly covers static and generated inline handlers', async () => {
  const sourceFiles = [
    new URL('../../index.html', import.meta.url),
    ...await getJavaScriptFiles(new URL('../../src/', import.meta.url))
  ]
  const discoveredNames = new Set()

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, 'utf8')
    findInlineActionNames(source).forEach(name => discoveredNames.add(name))
  }

  assert.deepEqual([...discoveredNames].sort(), LEGACY_ACTION_NAMES)
})

test('legacy action installer publishes one frozen namespace and matching aliases', () => {
  const actions = Object.fromEntries(
    LEGACY_ACTION_NAMES.map(actionName => [actionName, () => actionName])
  )
  const target = {}
  const installed = installLegacyActions(target, actions)

  assert.equal(Object.isFrozen(installed), true)
  assert.equal(target.EdeniaActions, installed)
  for (const actionName of LEGACY_ACTION_NAMES) {
    assert.equal(target[actionName], installed[actionName])
  }
  assert.throws(
    () => installLegacyActions(target, actions),
    /existing EdeniaActions namespace/
  )
})

test('legacy action installer fails closed on missing, invalid, or conflicting actions', () => {
  const actions = Object.fromEntries(
    LEGACY_ACTION_NAMES.map(actionName => [actionName, () => actionName])
  )
  const [firstAction] = LEGACY_ACTION_NAMES

  const missingActionMap = { ...actions }
  delete missingActionMap[firstAction]
  assert.throws(
    () => installLegacyActions({}, missingActionMap),
    /differs from its manifest/
  )

  assert.throws(
    () => installLegacyActions({}, { ...actions, [firstAction]: null }),
    new RegExp(`${firstAction} must be a function`)
  )

  assert.throws(
    () => installLegacyActions({ [firstAction]: () => 'conflict' }, actions),
    new RegExp(`existing global action ${firstAction}`)
  )
})
