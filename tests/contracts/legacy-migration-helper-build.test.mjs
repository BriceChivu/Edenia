import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const outputRoot = new URL('_legacy_migration_site/', projectRoot)

test('ordinary build emits a standalone safe-placeholder migration helper', async () => {
  const [html, config, helper, style] = await Promise.all([
    readFile(new URL('index.html', outputRoot), 'utf8'),
    readFile(new URL('config.local.js', outputRoot), 'utf8'),
    readFile(new URL('helper.js', outputRoot), 'utf8'),
    readFile(new URL('style.css', outputRoot), 'utf8')
  ])
  for (const filename of ['index.html', 'config.local.js', 'helper.js', 'style.css']) {
    assert.equal((await stat(new URL(filename, outputRoot))).isFile(), true)
  }
  const versions = [...html.matchAll(
    /(?:style\.css|config\.local\.js|helper\.js)\?v=([a-zA-Z0-9.-]+)/g
  )]
  assert.equal(versions.length, 3)
  assert.equal(new Set(versions.map(match => match[1])).size, 1)
  assert.match(html, /Content-Security-Policy/)
  assert.match(html, /connect-src 'self'/)
  assert.match(html, /name="referrer" content="no-referrer"/)
  assert.doesNotMatch(html, /analytics\.js|posthog|supabase-js|app\.js/i)
  assert.match(config, /"createTransferUrl": ""/)
  assert.match(config, /"supabasePublishableKey": ""/)
  assert.doesNotMatch(config, /service_role|sb_secret_/i)
  assert.match(helper, /edenia_v1/)
  assert.match(helper, /edenia_v1_backups/)
  assert.doesNotMatch(helper, /posthog|identify\(|account-auth/i)
  assert.ok(style.length > 100)
})

test('helper build is wired into normal builds but excluded from Pages upload', async () => {
  const [packageJson, buildScript, deployWorkflow, writer, helperSource] = await Promise.all([
    readFile(new URL('package.json', projectRoot), 'utf8'),
    readFile(new URL('scripts/build-site.mjs', projectRoot), 'utf8'),
    readFile(new URL('.github/workflows/deploy-pages.yml', projectRoot), 'utf8'),
    readFile(new URL(
      'scripts/write-legacy-migration-helper-config.mjs',
      projectRoot
    ), 'utf8'),
    readFile(new URL('src/legacy-migration-helper.js', projectRoot), 'utf8')
  ])
  assert.match(packageJson, /"build:migration-helper"/)
  assert.match(packageJson, /"build:migration-helper:production"/)
  assert.match(buildScript, /build-legacy-migration-helper\.mjs/)
  assert.match(deployWorkflow, /path: _site/)
  assert.doesNotMatch(deployWorkflow, /_legacy_migration_site/)
  assert.match(writer, /--require-supabase/)
  assert.match(writer, /applyLegacyMigrationHelperCsp/)
  const frameGate = helperSource.indexOf(
    'target.top !== target.self'
  )
  const disclosureTimer = helperSource.indexOf(
    'disclosureTimer = target.setTimeout'
  )
  assert.ok(frameGate > 0)
  assert.ok(disclosureTimer > frameGate)
})
