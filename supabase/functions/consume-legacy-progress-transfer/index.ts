import { withSupabase } from '@supabase/server'
import {
  handleLegacyProgressTransferRequest,
  legacyProgressTransferPreflightResponse,
  legacyProgressTransferUnavailableResponse,
} from '../_shared/legacy-progress-transfer.ts'
import type {
  LegacyProgressTransferClient,
} from '../_shared/legacy-progress-transfer.ts'

const handleAuthenticatedRequest = withSupabase(
  { auth: 'publishable:default', cors: false },
  async (request, context) => {
    try {
      return await handleLegacyProgressTransferRequest(
        request,
        'consume',
        context.supabaseAdmin as unknown as LegacyProgressTransferClient,
      )
    } catch {
      console.error(JSON.stringify({
        event: 'legacy_progress_transfer_consume_failed',
        reason: 'unexpected_error',
      }))
      return legacyProgressTransferUnavailableResponse(request, 'consume')
    }
  },
)

Deno.serve(request => request.method === 'OPTIONS'
  ? legacyProgressTransferPreflightResponse(request, 'consume')
  : handleAuthenticatedRequest(request))
