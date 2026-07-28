import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const appBuild = await build({
  bundle: true,
  charset: 'utf8',
  entryPoints: [new URL('../../src/app.js', import.meta.url).pathname],
  format: 'esm',
  legalComments: 'none',
  logLevel: 'silent',
  platform: 'browser',
  target: 'es2022',
  treeShaking: false,
  write: false
})
assert.equal(appBuild.outputFiles.length, 1)
const bundledSource = appBuild.outputFiles[0].text

test('classic app bundle does not declare over analytics-owned globals', () => {
  const analyticsGlobalNames = [
    'getEdeniaSessionReplayUrl',
    'setEdeniaPersonProperties',
    'syncEdeniaAnalyticsState',
    'trackEdeniaEvent'
  ]

  analyticsGlobalNames.forEach(globalName => {
    assert.doesNotMatch(
      bundledSource,
      new RegExp(`\\b(?:function|const|let|var)\\s+${globalName}\\b`)
    )
    assert.match(bundledSource, new RegExp(`window\\.${globalName}\\b`))
  })
})
