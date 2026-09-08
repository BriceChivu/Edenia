import test from 'node:test'
import assert from 'node:assert/strict'
import { createNativeOpeningAuthenticationPolicy } from '../../scripts/native-opening-auth-policy.mjs'
const applicationOrigin = 'https://www.edenia.study'
const providerOrigin = 'https://example.supabase.co'
const expectedEmail = 'approved@example.invalid'
const challengeOrigin = 'https://challenges.cloudflare.com'
const create = () => createNativeOpeningAuthenticationPolicy({ applicationOrigin, providerOrigin, expectedEmail })
const otp = () => JSON.stringify({ email: expectedEmail, data: { edenia_auth_locale: 'en' }, create_user: true,
  gotrue_meta_security: { captcha_token: 'synthetic' }, code_challenge: 'a'.repeat(43), code_challenge_method: 's256' })
const request = (origin, path, method = 'GET', destination = 'empty', body = '') => ({ origin, path, method, destination, body })
test('native policy permits only the exact internal document and declared static reads', () => {
  const p = create()
  assert.equal(p.classify(request(applicationOrigin, '/?internal_test=1', 'GET', 'document')).kind, 'static')
  assert.equal(p.classify(request(applicationOrigin, '/', 'GET', 'document')).kind, 'deny')
  assert.equal(p.classify(request(applicationOrigin, '/app.js?v=abc', 'GET', 'script')).kind, 'static')
  for (const destination of ['iframe', 'frame', 'worker', 'sharedworker', 'serviceworker', null, 'unknown'])
    assert.equal(p.classify(request(applicationOrigin, '/app.js', 'GET', destination)).kind, 'deny')
})
test('native email policy retains body restriction and account creation suppression', () => {
  const p = create()
  const allowed = p.classify(request(providerOrigin, '/auth/v1/otp', 'POST', 'empty', otp()))
  assert.equal(allowed.kind, 'email-code-request')
  assert.equal(JSON.parse(allowed.body).create_user, false)
  assert.equal(JSON.parse(allowed.body).gotrue_meta_security.captcha_token, 'synthetic')
  assert.equal(p.classify(request(providerOrigin, '/auth/v1/otp', 'POST', 'empty', otp())).kind, 'deny')
})
test('native policy blocks every profile and undeclared provider route', () => {
  const p = create()
  for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'])
    assert.equal(p.classify(request(providerOrigin, '/rest/v1/rpc/resolve_my_learner_profile', method)).kind, 'deny')
  assert.equal(p.classify(request(providerOrigin, '/auth/v1/signup', 'POST', 'empty', otp())).kind, 'deny')
  assert.equal(p.classify(request(providerOrigin, '/auth/v1/otp', 'POST', 'empty', otp())).kind, 'deny')
})
test('challenge traffic keeps exact host, path, method and 128 request bound', () => {
  const p = create()
  for (let i = 0; i < 128; i++) assert.equal(p.classify(request(challengeOrigin, '/turnstile/v0/api.js?render=explicit', 'GET', 'script')).kind, 'challenge')
  assert.equal(p.classify(request(challengeOrigin, '/turnstile/v0/api.js', 'GET', 'script')).kind, 'deny')
  for (const target of ['https://other.cloudflare.com', 'https://evil.invalid'])
    assert.equal(create().classify(request(target, '/turnstile/v0/api.js', 'GET', 'script')).kind, 'deny')
  assert.equal(create().classify(request(challengeOrigin, '/unknown', 'POST')).kind, 'deny')
  assert.equal(create().classify(request(challengeOrigin, '/turnstile/v0/api.js', 'PUT')).kind, 'deny')
})
test('cross-origin Auth preflight is locally answered only for named owner-bound operations', () => {
  const p = create()
  assert.equal(p.classify({ ...request(providerOrigin, '/auth/v1/otp', 'OPTIONS'), corsOrigin: applicationOrigin,
    corsMethod: 'POST', corsHeaders: 'apikey,content-type,x-client-info' }).kind, 'preflight')
  for (const changed of [{ corsOrigin: 'https://evil.invalid' }, { corsMethod: 'DELETE' }, { corsHeaders: 'x-arbitrary' }])
    assert.equal(p.classify({ ...request(providerOrigin, '/auth/v1/otp', 'OPTIONS'), corsOrigin: applicationOrigin,
      corsMethod: 'POST', corsHeaders: 'apikey,content-type,x-client-info', ...changed }).kind, 'deny')
  assert.equal(p.classify({ ...request(providerOrigin, '/rest/v1/rpc/resolve_my_learner_profile', 'OPTIONS'),
    corsOrigin: applicationOrigin, corsMethod: 'POST', corsHeaders: 'apikey' }).kind, 'deny')
})
test('normalization ambiguities never become allowed paths', () => {
  for (const path of ['https://evil.invalid/auth/v1/otp', '//auth/v1/otp', '/auth/v1/../otp', '/auth/v1/%6ftp', '/auth\\v1\\otp', '/auth/v1/otp#fragment'])
    assert.equal(create().classify(request(providerOrigin, path, 'POST', 'empty', otp())).kind, 'deny')
})

test('local challenge substitution cannot include a real origin', () => {
  const local = createNativeOpeningAuthenticationPolicy({ applicationOrigin: 'https://app.example.invalid', providerOrigin: 'https://provider.example.invalid', expectedEmail: 'approved@example.invalid', localChallengeOrigin: 'https://challenge.example.invalid' })
  assert.equal(local.classify({ origin: 'https://challenge.example.invalid', path: '/turnstile/frame', method: 'GET', destination: 'iframe' }).kind, 'challenge')
  assert.equal(local.classify({ origin: 'https://challenges.cloudflare.com', path: '/turnstile/frame', method: 'GET', destination: 'iframe' }).kind, 'deny')
  assert.throws(() => createNativeOpeningAuthenticationPolicy({ applicationOrigin: 'https://www.edenia.study', providerOrigin: 'https://provider.example.invalid', expectedEmail: 'approved@example.invalid', localChallengeOrigin: 'https://challenge.example.invalid' }), /reserved invalid origins/)
})
