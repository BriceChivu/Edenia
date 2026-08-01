export type StripeMode = 'test' | 'live'
export type BillingPlan = 'monthly' | 'annual' | 'founding'

type ReadEnvironment = (name: string) => string | undefined

export type StripeRuntimeConfig = {
  mode: StripeMode
  secretKey: string
}

export type StripeOfferConfig = StripeRuntimeConfig & {
  monthlyPriceId: string
  annualPriceId: string
}

export type StripeCheckoutConfig = StripeOfferConfig & {
  appUrl: string
  foundingCouponId: string
}

export type StripePortalConfig = StripeRuntimeConfig & {
  appUrl: string
}

export type StripeWebhookConfig = StripeRuntimeConfig & {
  webhookSecret: string
}

function requireEnvironment(readEnvironment: ReadEnvironment, name: string) {
  const value = readEnvironment(name)?.trim()
  if (!value) throw new Error(`Missing required billing configuration: ${name}`)
  return value
}

function getStripeMode(readEnvironment: ReadEnvironment): StripeMode {
  const mode = requireEnvironment(readEnvironment, 'STRIPE_MODE')
  if (mode !== 'test' && mode !== 'live') {
    throw new Error('STRIPE_MODE must be either test or live')
  }
  return mode
}

export function readStripeRuntimeConfig(
  readEnvironment: ReadEnvironment,
): StripeRuntimeConfig {
  const mode = getStripeMode(readEnvironment)
  const secretKey = requireEnvironment(readEnvironment, 'STRIPE_SECRET_KEY')
  const expectedPrefix = mode === 'live' ? 'sk_live_' : 'sk_test_'

  if (!secretKey.startsWith(expectedPrefix)) {
    throw new Error(`STRIPE_SECRET_KEY does not match STRIPE_MODE=${mode}`)
  }

  return { mode, secretKey }
}

function requireStripeIdentifier(
  readEnvironment: ReadEnvironment,
  name: string,
) {
  const value = requireEnvironment(readEnvironment, name)
  if (value.length > 255 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${name} must be a valid Stripe identifier`)
  }
  return value
}

function requireStripeResource(
  readEnvironment: ReadEnvironment,
  name: string,
  prefix: string,
) {
  const value = requireEnvironment(readEnvironment, name)
  if (!value.startsWith(prefix)) {
    throw new Error(`${name} must start with ${prefix}`)
  }
  return value
}

function requireAppUrl(readEnvironment: ReadEnvironment, mode: StripeMode) {
  const value = requireEnvironment(readEnvironment, 'APP_URL')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('APP_URL must be an absolute URL')
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('APP_URL must use http or https')
  }
  if (mode === 'live' && url.protocol !== 'https:') {
    throw new Error('APP_URL must use https in live mode')
  }

  return url.toString().replace(/\/$/, '')
}

export function readStripeCheckoutConfig(
  readEnvironment: ReadEnvironment,
): StripeCheckoutConfig {
  const offer = readStripeOfferConfig(readEnvironment)
  return {
    ...offer,
    appUrl: requireAppUrl(readEnvironment, offer.mode),
    foundingCouponId: requireStripeIdentifier(
      readEnvironment,
      'STRIPE_FOUNDING_COUPON_ID',
    ),
  }
}

export function readStripeOfferConfig(
  readEnvironment: ReadEnvironment,
): StripeOfferConfig {
  const runtime = readStripeRuntimeConfig(readEnvironment)
  return {
    ...runtime,
    monthlyPriceId: requireStripeResource(
      readEnvironment,
      'STRIPE_MONTHLY_PRICE_ID',
      'price_',
    ),
    annualPriceId: requireStripeResource(
      readEnvironment,
      'STRIPE_ANNUAL_PRICE_ID',
      'price_',
    ),
  }
}

export function readStripePortalConfig(
  readEnvironment: ReadEnvironment,
): StripePortalConfig {
  const runtime = readStripeRuntimeConfig(readEnvironment)
  return {
    ...runtime,
    appUrl: requireAppUrl(readEnvironment, runtime.mode),
  }
}

export function readStripeWebhookConfig(
  readEnvironment: ReadEnvironment,
): StripeWebhookConfig {
  const runtime = readStripeRuntimeConfig(readEnvironment)
  return {
    ...runtime,
    webhookSecret: requireStripeResource(
      readEnvironment,
      'STRIPE_WEBHOOK_SECRET',
      'whsec_',
    ),
  }
}

export function getStripePriceId(
  config: StripeOfferConfig,
  plan: BillingPlan,
) {
  return plan === 'monthly' ? config.monthlyPriceId : config.annualPriceId
}

export function isStripeEventModeAllowed(
  mode: StripeMode,
  eventLivemode: boolean,
) {
  return eventLivemode === (mode === 'live')
}
