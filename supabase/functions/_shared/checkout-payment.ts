export const EDENIA_PLUS_PLANS = ['monthly', 'annual', 'founding'] as const

export type EdeniaPlusPlan = typeof EDENIA_PLUS_PLANS[number]

type StripeReference = string | { id?: string | null } | null | undefined

export type CheckoutPaymentState = {
  mode?: string | null
  status?: string | null
  payment_status?: string | null
  customer?: StripeReference
  subscription?: StripeReference
  metadata?: Record<string, string> | null
}

export function getStripeReferenceId(reference: StripeReference) {
  if (typeof reference === 'string') return reference
  return typeof reference?.id === 'string' ? reference.id : null
}

export function isEdeniaPlusPlan(plan: unknown): plan is EdeniaPlusPlan {
  return typeof plan === 'string'
    && (EDENIA_PLUS_PLANS as readonly string[]).includes(plan)
}

export function isPaidEdeniaPlusCheckoutSession(session: CheckoutPaymentState) {
  return session.mode === 'subscription'
    && session.status === 'complete'
    && session.payment_status === 'paid'
    && Boolean(getStripeReferenceId(session.customer))
    && Boolean(getStripeReferenceId(session.subscription))
    && isEdeniaPlusPlan(session.metadata?.plan)
}
