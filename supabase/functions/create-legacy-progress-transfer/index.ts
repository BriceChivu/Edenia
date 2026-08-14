import { withSupabase } from '@supabase/server'
import {
  handleLegacyProgressTransferRequest,
  legacyProgressTransferUnavailableResponse,
} from '../_shared/legacy-progress-transfer.ts'
import type {
  LegacyProgressTransferClient,
} from '../_shared/legacy-progress-transfer.ts'

Deno.serve(withSupabase(
  { auth: 'publishable:default', cors: false },
  async (request, context) => {
    try {
      return await handleLegacyProgressTransferRequest(
        request,
        'create',
        context.supabaseAdmin as unknown as LegacyProgressTransferClient,
      )
    } catch {
      console.error(JSON.stringify({
        event: 'legacy_progress_transfer_create_failed',
        reason: 'unexpected_error',
      }))
      return legacyProgressTransferUnavailableResponse(request, 'create')
    }
  },
))
