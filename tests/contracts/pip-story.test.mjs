import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { initial, story, transition } from '../../src/features/pip-story/story.js'
import { readingPages, replay, restoreSession, saveSession, sceneVisual } from '../../src/features/pip-story/session.js'
import { createBrowserStoryStore } from '../../src/features/pip-story/persistence.js'

test('easy-English story and transitions preserve the authored prototype exactly', async () => {
  const module = await readFile(new URL('../../src/features/pip-story/story.js', import.meta.url), 'utf8')
  const source = module.slice(module.indexOf('export const initial =')).replace(/^export /gm, '')
  // Captured from the original easy.html engine before presentation changes.
  assert.equal(createHash('sha256').update(source).digest('hex'), 'd9e3dd06d558682077353852563178290393867bcb4d43d7165c13a6c390195a')
})

test('every authored route survives compact save/reload without losing narration', () => {
  const visited = new Set()
  for (let seed = 1; seed <= 600; seed++) {
    let rng = seed
    let state = initial()
    const actions = []
    for (let step = 0; step < 150; step++) {
      visited.add(state.scene)
      const pages = readingPages(state)
      assert.equal(pages.join(' ').replace(/\s+/g, ' '), (state.outcome?.text || story(state).text).join(' ').replace(/\s+/g, ' '))
      const visual = sceneVisual(state)
      assert.ok(visual.environment)
      if (!['opening', 'willow'].includes(state.scene)) assert.ok(!visual.actors.includes('Mama'))
      if (state.scene === 'ending') break
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0
      const action = state.outcome ? 'next' : rng % story(state).choices.length
      actions.push(action)
      state = action === 'next' ? transition(state, { type: 'continue' }) : transition(state, { choice: story(state).choices[action] })
    }
    const restored = restoreSession({ version: 1, actions, page: 1 })
    assert.deepEqual(restored.state, state)
    assert.deepEqual(replay(saveSession(restored).actions).state, state)
    assert.ok(JSON.stringify(saveSession(restored)).length < 3000)
  }
  assert.equal(visited.size, 43)
})

test('damaged saves stop at the last valid decision and never execute arbitrary data', () => {
  assert.deepEqual(restoreSession({ version: 4, actions: [0] }).state, initial())
  assert.equal(replay([0, 999, 1]).state.scene, 'willow')
  assert.deepEqual(replay(['next', { scene: 'ending' }]).state, initial())
  assert.deepEqual(replay([0, 1]).actions, [0, 1])
})

test('scene illustration reflects independent travel, rescue damage, and completed nursery', () => {
  const state = { ...initial(), first: 'Moss', scene: 's3', bram: 'Damaged boat', cargo: 'Most things lost' }
  assert.ok(sceneVisual(state).props.includes('broken-boat'))
  assert.ok(!sceneVisual(state).actors.includes('Moss'))
  const nursery = { ...state, scene: 's14', nursery: 'New channel', nurseryDone: true, nurseryAction: 'Cleared sticks' }
  assert.equal(sceneVisual(nursery).nurseryDone, true)
  assert.equal(sceneVisual(nursery).nursery, 'New channel')
})

test('browser resume survives a cloud profile refresh and stays bound to owner and generation', () => {
  const storage = new Map()
  const adapter = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) }
  let current = { profile: {}, identity: ['owner-a', 'profile-a', 1] }
  const store = createBrowserStoryStore({ storage: adapter, namespace: 'test', context: () => current, saveProfile: () => true })
  const saved = { version: 1, actions: [0, 1], page: 1, choosing: false }
  assert.equal(store.write(saved), true)
  current = { ...current, profile: {} }
  assert.deepEqual(store.read(), saved)
  current = { profile: {}, identity: ['owner-b', 'profile-b', 1] }
  assert.equal(store.read(), undefined)
  current = { profile: {}, identity: ['owner-a', 'profile-a', 2] }
  assert.equal(store.read(), undefined)
  current = null
  assert.equal(store.read(), undefined)
  assert.equal(store.write(saved), false)
  assert.equal(storage.size, 1)
})

test('rejected profile saves neither create a story cache nor mutate learner state', () => {
  const profile = { pipStory: { version: 1, actions: [] } }
  const store = createBrowserStoryStore({
    storage: { setItem() { assert.fail('must not cache a rejected write') } }, namespace: 'test',
    context: () => ({ profile, identity: ['owner', 'profile', 1] }), saveProfile: () => false
  })
  assert.equal(store.write({ version: 1, actions: [0] }), false)
  assert.deepEqual(profile.pipStory.actions, [])
})
