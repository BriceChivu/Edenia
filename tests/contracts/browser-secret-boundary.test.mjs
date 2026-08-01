import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const browserDeliveryFiles = [
  '.github/workflows/deploy-pages.yml',
  'config.example.js',
  'scripts/build-site.mjs',
  'scripts/local-runtime-config.mjs',
  'scripts/write-runtime-config.mjs',
  'src/integrations/runtime-config.js',
  '_site/app.js',
  '_site/config.local.js'
]

test('browser delivery never includes Supabase or Stripe server secrets', async () => {
  for (const relativePath of browserDeliveryFiles) {
    const source = await readFile(new URL(relativePath, projectRoot), 'utf8')
    assert.doesNotMatch(
      source,
      /SUPABASE_(?:SECRET|SERVICE_ROLE)|STRIPE_(?:SECRET|WEBHOOK_SECRET)|service_role/i,
      `${relativePath} must contain public browser configuration only`
    )
  }
})
