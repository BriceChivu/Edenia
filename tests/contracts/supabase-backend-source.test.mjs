import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const migrationsRoot = new URL('supabase/migrations/', projectRoot)
const functionsRoot = new URL('supabase/functions/', projectRoot)

const APPLIED_MIGRATION_HASHES = Object.freeze({
  '20260724083801_add_checkout_session_redemptions.sql':
    '4e32cf150af1f1f8131891487b62988f6813eee4f95c8b48c68a0f3f1ed30cc7',
  '20260724100505_add_plus_schema.sql':
    'ace32c5bcda6a136251f163746476588cc2054135f25fcac3f7ed450e55ba6ae',
  '20260724110044_enforce_plus_backup_access.sql':
    '06917713d08654c4a02d75f6baecb46eb7510dfbd14a8a3158c3e6ce4695fce6',
  '20260724111513_enforce_atomic_founding_member_limit.sql':
    'dd2df121f71db5171fa33b1b7c60bef1a1e4ce872fc869795079705f587ffa36',
  '20260724112256_keep_state_backup_history.sql':
    '678fdb88532213cf3034e0851c7a635468e0c381de5e12ba07aa7351c6629d97',
  '20260724115832_reserve_founding_checkout_slots.sql':
    '2242d15329ecebcc446f710de98533b772e02d0c13e6971986037c0231c35b13',
  '20260724120318_index_founding_checkout_reservation_user.sql':
    '9d4df46ad6e40efcb785199665f6be2df90642d7b459e7945ccc8605d691bcb6'
})

test('applied Supabase migrations preserve their exact identities and bytes', async () => {
  const migrationFiles = (await readdir(migrationsRoot)).sort()
  assert.deepEqual(migrationFiles, Object.keys(APPLIED_MIGRATION_HASHES).sort())

  for (const migrationFile of migrationFiles) {
    const source = await readFile(new URL(migrationFile, migrationsRoot))
    const hash = createHash('sha256').update(source).digest('hex')
    assert.equal(
      hash,
      APPLIED_MIGRATION_HASHES[migrationFile],
      `${migrationFile} must remain byte-identical to the applied migration`
    )
  }
})

test('Supabase source contains exactly the three deployed Edge Functions', async () => {
  const entries = await readdir(functionsRoot, { withFileTypes: true })
  const functionNames = entries
    .filter(entry => entry.isDirectory() && entry.name !== '_shared')
    .map(entry => entry.name)
    .sort()
  assert.deepEqual(functionNames, [
    'create-checkout-session',
    'link-checkout-session',
    'stripe-webhook'
  ])

  const config = await readFile(
    new URL('supabase/config.toml', projectRoot),
    'utf8'
  )
  for (const functionName of functionNames) {
    assert.match(config, new RegExp(`\\[functions\\.${functionName}\\]`))
    assert.match(
      config,
      new RegExp(`entrypoint = "\\./functions/${functionName}/index\\.ts"`)
    )

    const denoConfig = JSON.parse(await readFile(
      new URL(`${functionName}/deno.json`, functionsRoot),
      'utf8'
    ))
    assert.equal(
      denoConfig.imports['@supabase/supabase-js'],
      'npm:@supabase/supabase-js@2.110.7'
    )

    const functionSource = await readFile(
      new URL(`${functionName}/index.ts`, functionsRoot),
      'utf8'
    )
    assert.match(
      functionSource,
      /https:\/\/esm\.sh\/stripe@14\.25\.0\?target=deno/
    )
    assert.doesNotMatch(functionSource, /stripe@14\?target=deno/)
  }
})

test('shared backend tests remain connected to package scripts and CI', async () => {
  const packageJson = JSON.parse(await readFile(
    new URL('package.json', projectRoot),
    'utf8'
  ))
  assert.equal(
    packageJson.scripts['test:supabase'],
    'node --test supabase/functions/_shared/*.test.ts'
  )
  assert.match(packageJson.scripts.test, /npm run test:supabase/)
  assert.match(packageJson.scripts['test:ci'], /npm run test:supabase/)

  const workflow = await readFile(
    new URL('.github/workflows/ci.yml', projectRoot),
    'utf8'
  )
  assert.match(workflow, /supabase\/\*\)/)
  assert.match(workflow, /name: Run Supabase backend tests/)
  assert.match(workflow, /run: npm run test:supabase/)
})
