import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createEdeniaSupabaseClient
} from '../../src/integrations/supabase-client.js'

test('Supabase browser client uses isolated persistent PKCE sessions', () => {
  const client = createEdeniaSupabaseClient({
    url: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_test',
    storageKey: 'edenia_test_plus_auth'
  })

  assert.equal(client.auth.storageKey, 'edenia_test_plus_auth')
  assert.equal(client.auth.flowType, 'pkce')
  assert.equal(client.auth.persistSession, true)
  assert.equal(client.auth.autoRefreshToken, true)
  assert.equal(client.auth.detectSessionInUrl, true)
  client.auth.dispose()
})

test('Supabase browser client rejects incomplete public configuration', () => {
  assert.throws(
    () => createEdeniaSupabaseClient({
      url: '',
      publishableKey: 'sb_publishable_test',
      storageKey: 'edenia_test_plus_auth'
    }),
    /public runtime configuration/
  )
})
