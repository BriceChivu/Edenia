import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatPlusPrice,
  normalizePlusFeatureId,
  normalizePlusOffer,
  normalizePlusPlanId,
  PLUS_BENEFITS,
  PLUS_PLAN_IDS,
  PLUS_PLANS
} from '../../src/domain/plus-offer.js'

test('Plus offer exposes only the three approved launch benefits and two plans', () => {
  assert.equal(PLUS_BENEFITS.length, 3)
  assert.deepEqual(PLUS_PLANS.map(plan => plan.id), ['monthly', 'annual'])
  assert.equal(PLUS_PLANS.find(plan => plan.recommended)?.id, 'annual')
  assert.equal(normalizePlusPlanId('monthly'), PLUS_PLAN_IDS.MONTHLY)
  assert.equal(normalizePlusPlanId('unknown'), PLUS_PLAN_IDS.ANNUAL)
  assert.equal(normalizePlusFeatureId(PLUS_BENEFITS[0].id), PLUS_BENEFITS[0].id)
  assert.equal(normalizePlusFeatureId('cloud-backup'), null)
})

test('Plus offer accepts only complete, unique, cadence-correct public prices', () => {
  const plans = normalizePlusOffer({ plans: [
    { id: 'monthly', currency: 'usd', unit_amount: 500, interval: 'month', interval_count: 1 },
    { id: 'annual', currency: 'usd', unit_amount: 4800, interval: 'year', interval_count: 1 },
    { id: 'annual', currency: 'usd', unit_amount: 1, interval: 'year', interval_count: 1 },
    { id: 'founding', currency: 'usd', unit_amount: 1, interval: 'year', interval_count: 1 },
    { id: 'monthly', currency: 'usd', unit_amount: 1, interval: 'year', interval_count: 1 }
  ] })
  assert.deepEqual(plans.map(plan => plan.id), ['monthly', 'annual'])
  assert.equal(formatPlusPrice(plans[0], 'en-US'), '$5')
  assert.deepEqual(normalizePlusOffer(null), [])
})
