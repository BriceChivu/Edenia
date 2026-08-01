import { createClient } from '@supabase/supabase-js'

export function createEdeniaSupabaseClient({
  url,
  publishableKey,
  storageKey
}) {
  if (!url || !publishableKey || !storageKey) {
    throw new TypeError('Supabase client requires public runtime configuration')
  }

  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      persistSession: true,
      storageKey
    }
  })
}
