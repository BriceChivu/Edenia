import { createClient } from '@supabase/supabase-js'
import { handleAccountExportRequest } from '../_shared/account-export.ts'
import { consumeBillingRateLimit } from '../_shared/billing-rate-limit.ts'
import { getBearerToken } from '../_shared/billing-request.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(request => handleAccountExportRequest(request, {
  async authenticate(authRequest) {
    const token = getBearerToken(authRequest.headers.get('authorization'))
    if (!token) return null
    const { data, error } = await supabase.auth.getUser(token)
    return error || !data.user?.id ? null : { id: data.user.id }
  },
  async consumeRateLimit(userId) {
    return await consumeBillingRateLimit(supabase, {
      scope: 'account-export-user',
      subject: userId,
      windowSeconds: 10 * 60,
      maximumRequests: 5,
    })
  },
  async loadExport(userId) {
    const { data, error } = await supabase.rpc(
      'export_account_server_data_for_service',
      { p_verified_user_id: userId },
    )
    if (error) throw error
    return data
  },
}))
