import test from 'node:test'
import assert from 'node:assert/strict'
import { GoTrueClient } from '@supabase/auth-js'
import * as opening from '../../scripts/hosted-profile-opening-smoke.mjs'

const providerOrigin = 'https://example.supabase.co'
const email = 'approved@example.invalid'
const otp = { email, data: { edenia_auth_locale: 'en' }, create_user: true,
  gotrue_meta_security: { captcha_token: 'synthetic-captcha' }, code_challenge: 'a'.repeat(43), code_challenge_method: 's256' }
const verify = { email, token: '123456', type: 'email', gotrue_meta_security: {} }
const request = (path, body) => ({ method: 'POST', url: providerOrigin + '/auth/v1/' + path, body: JSON.stringify(body) })
const policy = () => opening.createOpeningEmailAuthenticationPolicy({ providerOrigin, expectedEmail: email })
const owner = '11111111-1111-1111-1111-111111111111'

test('installed SDK email-code shapes preserve CAPTCHA and suppress account creation', async () => {
  const guard = policy()
  const forwarded = []
  const client = new GoTrueClient({ url: providerOrigin + '/auth/v1', persistSession: false,
    autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce',
    fetch: async (url, options) => {
      const classified = guard.classify({ url, method: options.method, body: options.body })
      assert.notEqual(classified.kind, 'deny')
      forwarded.push(JSON.parse(classified.body))
      return new Response(JSON.stringify({ message: 'Synthetic response', code: 'test_only' }), { status: 400 })
    } })
  await client.signInWithOtp({ email, options: { shouldCreateUser: true,
    data: { edenia_auth_locale: 'en' }, captchaToken: 'synthetic-captcha' } })
  await client.verifyOtp({ email, token: '123456', type: 'email' })
  assert.equal(forwarded.length, 2)
  assert.equal(forwarded[0].create_user, false)
  assert.equal(forwarded[0].gotrue_meta_security.captcha_token, 'synthetic-captcha')
  assert.equal(forwarded[0].code_challenge_method, 's256')
  assert.deepEqual(forwarded[1], verify)
})

test('email authentication forwards constrained requests, blocks profile traffic, and validates the owner', async () => {
  let intercept, closed = false, blocked = 0, forwarded = 0, challenges = 0
  const context = { routeWebSocket: async () => {}, route: async (_, fn) => { intercept = fn },
    newPage: async () => ({ goto: async url => assert.equal(url, opening.OPENING_URL), evaluate: async () => ({ user: { id: owner } }) }),
    close: async () => { closed = true } }
  const args = { browser: { newContext: async () => context }, providerOrigin, expectedOwner: owner,
    expectedEmail: email, method: 'email-code', verifyGateOff: async () => {}, onReady: async () => {
      for (const [path, body] of [['otp', otp], ['verify', verify]]) {
        await intercept({ request: () => ({ url: () => request(path, body).url, method: () => 'POST', postData: () => JSON.stringify(body) }),
          fetch: async options => { forwarded++; assert.equal(options.maxRedirects, 0); assert.equal(options.maxRetries, 0)
            const wire = JSON.parse(options.postData); if (path === 'otp') assert.equal(wire.create_user, false)
            return { status: () => 200 } }, fulfill: async () => {} })
      }
      await intercept({ request: () => ({ url: () => providerOrigin + '/rest/v1/rpc/resolve_my_learner_profile', method: () => 'POST', postData: () => '{}' }),
        abort: async () => { blocked++ }, fetch: () => assert.fail('Profile request forwarded') })
      await intercept({ request: () => ({ url: () => 'https://www.edenia.study/', method: () => 'GET', resourceType: () => 'document' }),
        abort: async () => { blocked++ }, continue: () => assert.fail('Public route forwarded') })
      await intercept({ request: () => ({ url: () => 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', method: () => 'GET', resourceType: () => 'script' }),
        continue: async () => { challenges++ } })
    } }
  await opening.prepareOpeningAuthentication(args)
  assert.deepEqual({ closed, blocked, forwarded, challenges }, { closed: true, blocked: 2, forwarded: 2, challenges: 1 })
  await assert.rejects(opening.prepareOpeningAuthentication({ ...args, onReady: async () => {}, expectedOwner: '22222222-2222-2222-2222-222222222222' }), /Authentication owner mismatch/)
})

test('email authentication never forwards after a lease failure or follows a provider redirect', async () => {
  for (const failure of ['lease', 'redirect']) {
    let intercept, checks = 0, forwarded = 0, closed = false
    const context = { routeWebSocket: async () => {}, route: async (_, fn) => { intercept = fn },
      newPage: async () => ({ goto: async () => {}, evaluate: async () => null }), close: async () => { closed = true } }
    await assert.rejects(opening.prepareOpeningAuthentication({ browser: { newContext: async () => context },
      providerOrigin, expectedOwner: owner, expectedEmail: email, method: 'email-code',
      verifyGateOff: async () => { if (++checks > 1 && failure === 'lease') throw new Error('Lease lost') },
      onReady: async () => intercept({ request: () => ({ url: () => request('otp', otp).url, method: () => 'POST', postData: () => JSON.stringify(otp) }),
        fetch: async options => { forwarded++; assert.equal(options.maxRedirects, 0); return { status: () => 302 } }, abort: async () => {} })
    }), failure === 'lease' ? /Lease lost/ : /Private authentication interaction is required/)
    assert.equal(forwarded, failure === 'lease' ? 0 : 1)
    assert.equal(closed, true)
  }
})

test('email guard limits delivery to one and verification to three attempts', () => {
  const guard = policy()
  assert.equal(guard.classify(request('otp', otp)).kind, 'email-code-request')
  for (let i = 0; i < 3; i++) assert.equal(guard.classify(request('verify', verify)).kind, 'email-code-verify')
  assert.equal(guard.classify(request('verify', verify)).kind, 'deny')
  const duplicate = policy()
  assert.equal(duplicate.classify(request('otp', otp)).kind, 'email-code-request')
  assert.equal(duplicate.classify(request('otp', otp)).kind, 'deny')
  assert.equal(duplicate.classify(request('verify', verify)).kind, 'deny')
})

test('email guard rejects wrong identity, malformed bodies, unknown operations and verification before delivery', () => {
  for (const input of [
    request('verify', verify), request('otp', { ...otp, email: 'other@example.invalid' }),
    request('otp', { ...otp, arbitrary: true }), request('otp', { ...otp, data: { admin: true } }),
    request('otp', { ...otp, gotrue_meta_security: { captcha_token: 'x', extra: true } }),
    request('otp', { ...otp, code_challenge_method: 'plain' }),
    request('signup', otp), { ...request('otp', otp), url: providerOrigin + '/auth/v1/otp?redirect_to=https://example.invalid' },
    { ...request('otp', otp), body: JSON.stringify(otp).replace('{', '{"email":"other@example.invalid",') },
    { ...request('otp', otp), url: providerOrigin + '/rest/v1/rpc/resolve_my_learner_profile' }
  ]) assert.equal(policy().classify(input).kind, 'deny')
  for (const invalid of [{ ...verify, type: 'recovery' }, { ...verify, email: 'other@example.invalid' },
    { ...verify, token: 'not-a-code' }, { ...verify, options: { redirectTo: 'https://example.invalid' } }]) {
    const guard = policy(); guard.classify(request('otp', otp))
    assert.equal(guard.classify(request('verify', invalid)).kind, 'deny')
  }
})
