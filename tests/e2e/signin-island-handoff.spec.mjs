import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, relative, extname } from 'node:path'
import { build } from 'esbuild'
import { test, expect } from '@playwright/test'
import { createPortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'

test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true', 'Uses the real integrated Godot build')

// A local module seam: real adapter, serializer, browser storage and Godot;
// RPC/provider responses are fixtures. Full auth-trial product acceptance is later.
async function localHost() {
  const root = resolve('_site')
  const [release] = await readdir(resolve(root, 'tiny-swords-game'))
  const { outputFiles } = await build({ stdin: {
    contents: `export { createLearnerProfileCloudPersistenceAdapter } from './src/integrations/learner-profile-cloud-persistence.js';
      export { createLearnerProfileConflictComparison } from './src/features/profile-access/conflict-comparison.js';
      export { preparePortableLearnerProfileEnvelope, finalizePortableLearnerProfileEnvelope, verifyPortableLearnerProfileEnvelope } from './src/state/portable-learner-profile.js';`,
    resolveDir: resolve('.')
  }, bundle: true, format: 'esm', write: false })
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname
      if (path === '/probe') {
        res.setHeader('Content-Type', 'text/html')
        res.end('<!doctype html><title>Local signed-in island handoff</title><style>iframe{width:1054px;height:454px;border:0}</style>')
        return
      }
      if (path === '/modules.js') {
        res.setHeader('Content-Type', 'text/javascript')
        res.end(outputFiles[0].text)
        return
      }
      const file = resolve(root, '.' + path)
      if (relative(root, file).startsWith('..')) { res.writeHead(403).end(); return }
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.wasm': 'application/wasm' })[extname(file)] || 'application/octet-stream')
      res.end(await readFile(file))
    } catch { res.writeHead(404).end() }
  })
  await new Promise(accept => server.listen(0, '127.0.0.1', accept))
  return { url: `http://127.0.0.1:${server.address().port}`, game: `/tiny-swords-game/${release}/index.html`,
    close: () => new Promise(accept => server.close(accept)) }
}

const owner = '123e4567-e89b-42d3-a456-426614174000'
const profile = '223e4567-e89b-42d3-a456-426614174001'
const conflict = '323e4567-e89b-42d3-a456-426614174002'
const operation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

for (const side of ['device', 'cloud']) {
  test(`stale island choice ${side} restores in Godot before saves across isolated contexts`, async ({ browser }) => {
    test.setTimeout(90000)
    const host = await localHost()
    const contexts = [await browser.newContext(), await browser.newContext()]
    try {
      const island = JSON.parse(await readFile(new URL('../fixtures/tiny-swords-populated-island.json', import.meta.url)))
      const nextIsland = structuredClone(island)
      nextIsland.resources.wood += 2
      const state = layout => ({ config: {}, videos: {}, anki: {}, onboarding: { setupCompleted: true },
        cityProgress: { maxLevelIndex: 6, experienceVersion: 1 }, tinySwordsIsland: layout })
      const device = (await createPortableLearnerProfileEnvelope(state(island))).envelope
      const cloud = (await createPortableLearnerProfileEnvelope(state(nextIsland))).envelope
      let selected = null
      const until = new Date(Date.now() + 30 * 86400000).toISOString()
      const conflictRow = () => ({ status: selected ? 'resolved' : 'open', conflict_id: conflict,
        operation_id: operation, profile_id: profile, device_generation: 1, device_revision: 7,
        cloud_generation: 3, cloud_revision: 1, device_envelope: device, cloud_envelope: cloud,
        protected_until: selected ? until : null, selected_side: selected })
      const page = await contexts[0].newPage()
      const observer = await contexts[1].newPage()
      const calls = []
      await page.exposeFunction('rpc', async (name, args) => {
        calls.push(name)
        if (name === 'resolve_my_learner_profile') return { data: [{ status: 'profile_ready', created: false,
          generation: 3, revision: 1, profile_id: profile, envelope: cloud }], error: null }
        if (name === 'commit_my_learner_profile') {
          expect(args.p_generation).toBe(1)
          expect(args.p_envelope.profile.tinySwordsIsland).toEqual(island)
          return { data: [{ status: 'conflict', conflict_id: conflict, generation: 3, revision: 1,
            profile_id: profile, payload_sha256: cloud.integrity.payloadSha256 }], error: null }
        }
        if (name === 'read_my_learner_profile_conflict') return { data: [conflictRow()], error: null }
        expect(name).toBe('choose_my_learner_profile_conflict')
        expect(args.p_confirmed).toBe(true)
        selected = args.p_selected_side
        return { data: [{ status: 'chosen', selected_side: selected, conflict_id: conflict, profile_id: profile,
          generation: selected === 'device' ? 1 : 3, revision: selected === 'device' ? 8 : 2,
          envelope: selected === 'device' ? device : cloud, protected_until: until }], error: null }
      })
      await page.goto(host.url + '/probe')
      await observer.goto(host.url + '/probe')
      await observer.evaluate(() => localStorage.setItem('sentinel', 'independent-profile'))
      const result = await page.evaluate(async ({ owner, profile, operation, device, side }) => {
        const m = await import('/modules.js')
        const key = 'probe-sync'
        localStorage.setItem(key, JSON.stringify({ version: 1, ownerId: owner, profileId: profile,
          generation: 1, acceptedRevision: 6, pending: null, queued: null }))
        localStorage.setItem(key + '_dirty', JSON.stringify({ version: 1, ownerId: owner, profileId: profile, generation: 1 }))
        const adapter = m.createLearnerProfileCloudPersistenceAdapter({ getClient: () => ({ rpc: window.rpc }),
          clearOnboardingDraft: () => true, createOnboardingEnvelope: async () => null,
          eventTarget: window, isOnline: () => true, now: Date.now,
          readOnboardingState: () => null, setTimer: setTimeout,
          storage: localStorage, syncStorageKey: key, createOperationId: () => operation,
          prepareEnvelope: state => m.preparePortableLearnerProfileEnvelope(state, { now: () => new Date(device.exportedAt) }),
          finalizeEnvelope: m.finalizePortableLearnerProfileEnvelope,
          verifyEnvelope: m.verifyPortableLearnerProfileEnvelope, importEnvelope: envelope => envelope.profile })
        const opened = await adapter.resolve({ authentication: { userId: owner }, connectivity: { status: 'online' },
          purpose: 'resolve-signed-in-profile', localProfile: { status: 'ready', ownerId: owner, profileId: profile,
            generation: 1, revision: 6, profile: device.profile } })
        if (opened.status !== 'conflicting') return { status: opened.status }
        const rows = m.createLearnerProfileConflictComparison(opened.conflict.device.profile, opened.conflict.cloud.profile)
        const unconfirmed = await adapter.chooseConflict({ conflict: opened.conflict, selectedSide: side })
        const chosen = await adapter.chooseConflict({ confirmed: true, conflict: opened.conflict, selectedSide: side })
        window.chosen = chosen
        return { status: chosen.status, rows, unconfirmed: unconfirmed.status, island: chosen.profile?.tinySwordsIsland }
      }, { owner, profile, operation, device, side })
      expect(result.status).toBe('chosen')
      expect(result.unconfirmed).toBe('confirmation-required')
      expect(result.rows.map(row => row.key)).toContain('island')
      expect(result.island).toEqual(side === 'device' ? island : nextIsland)
      expect(calls.filter(name => name === 'choose_my_learner_profile_conflict')).toHaveLength(1)
      await page.evaluate(game => {
        window.events = []
        window.savedBeforeRestore = false
        window.accepted = false
        const frame = document.createElement('iframe')
        window.addEventListener('message', event => {
          if (event.origin !== location.origin || event.source !== frame.contentWindow) return
          const data = event.data
          if (data.type === 'edenia-game-progression') event.source.postMessage({ type: 'edenia-study-level', session: 1,
            level: 7, layout: window.chosen.profile.tinySwordsIsland }, location.origin)
          if (data.type === 'edenia-tiny-restored') { window.accepted = data.accepted; window.events.push(data.type) }
          if (data.type === 'edenia-tiny-layout') {
            if (!window.accepted) window.savedBeforeRestore = true
            window.firstSaved ||= data.layout
            window.lastSaved = data.layout
            window.events.push(data.type)
            event.source.postMessage({ type: 'edenia-tiny-saved', session: 1, id: data.id, persisted: window.accepted }, location.origin)
          }
        })
        frame.src = game
        document.body.append(frame)
      }, host.game)
      await page.waitForFunction(() => window.accepted === true)
      await page.waitForFunction(() => window.lastSaved !== undefined)
      const restored = await page.evaluate(() => ({ early: window.savedBeforeRestore, events: window.events, layout: window.firstSaved }))
      expect(restored.early).toBe(false)
      expect(restored.events.slice(0, 2)).toEqual(['edenia-tiny-restored', 'edenia-tiny-layout'])
      const game = page.frames().find(frame => frame.url().endsWith('/index.html'))
      expect(await game.evaluate(() => window.edeniaStudyLayout)).toEqual(result.island)
      // Godot upgrades old fixture versions and supplies new gameplay fields.
      // The browser passes the exact chosen input; Godot owns that migration.
      expect(restored.layout.resources).toEqual(result.island.resources)
      expect(restored.layout.tiles).toEqual(result.island.tiles)
      expect(restored.layout.houses).toEqual(result.island.houses)
      expect(await observer.evaluate(() => ({ sentinel: localStorage.getItem('sentinel'), sync: localStorage.getItem('probe-sync') })))
        .toEqual({ sentinel: 'independent-profile', sync: null })
      await observer.exposeFunction('rpc', async name => {
        if (name === 'read_my_latest_learner_profile_reset') return { data: [{ status: 'none' }], error: null }
        expect(name).toBe('resolve_my_learner_profile')
        return { data: [{ status: 'profile_ready', created: false, profile_id: profile,
          generation: side === 'device' ? 1 : 3, revision: side === 'device' ? 8 : 2,
          envelope: side === 'device' ? device : cloud }], error: null }
      })
      const otherOpened = await observer.evaluate(async owner => {
        const m = await import('/modules.js')
        const adapter = m.createLearnerProfileCloudPersistenceAdapter({ getClient: () => ({ rpc: window.rpc }),
          clearOnboardingDraft: () => true, createOnboardingEnvelope: async () => null,
          eventTarget: window, isOnline: () => true, now: Date.now,
          readOnboardingState: () => null, setTimer: setTimeout, storage: localStorage,
          syncStorageKey: 'probe-sync', createOperationId: () => crypto.randomUUID(),
          prepareEnvelope: m.preparePortableLearnerProfileEnvelope, finalizeEnvelope: m.finalizePortableLearnerProfileEnvelope,
          verifyEnvelope: m.verifyPortableLearnerProfileEnvelope, importEnvelope: envelope => envelope.profile })
        return adapter.resolve({ authentication: { userId: owner }, connectivity: { status: 'online' },
          localProfile: { status: 'empty' }, purpose: 'resolve-signed-in-profile' })
      }, owner)
      expect(otherOpened.status).toBe('activate')
      expect(otherOpened.profile.tinySwordsIsland).toEqual(result.island)
    } finally {
      await Promise.all(contexts.map(context => context.close()))
      await host.close()
    }
  })
}
