import assert from 'node:assert/strict'
import test from 'node:test'
import { createImportedStateReader } from '../../src/state/imported-state.js'

function createHarness() {
  const calls = []
  const readImportedState = createImportedStateReader({
    createDefaultState(...args) {
      calls.push(['default', args])
      return {
        config: { locale: 'en', weeklyGoalHours: 4, baseOnly: true },
        videos: {},
        anki: {},
        baseTopLevel: true
      }
    },
    removeLegacyVideoWatchReminderState(state) {
      calls.push(['cleanup', state])
      delete state.legacyReminder
    }
  })
  return { calls, readImportedState }
}

test('imported state reader preserves the existing envelope and overlay contract', () => {
  const harness = createHarness()
  const state = {
    config: {
      weeklyGoalHours: 7,
      channels: [{ id: 'one' }],
      theme: 'dark',
      removedDefaultChannelIds: ['removed'],
      locale: 'fr',
      importedOnly: true
    },
    videos: { video: { id: 'video' } },
    anki: { '2026-08-01': { reviewed: 1 } },
    legacyReminder: true,
    importedTopLevel: true
  }
  const result = harness.readImportedState({ app: 'edenia', state })

  assert.deepEqual(harness.calls[0], ['default', [
    7,
    state.config.channels,
    'dark',
    ['removed'],
    'fr'
  ]])
  assert.equal(harness.calls[1][0], 'cleanup')
  assert.equal(harness.calls[1][1], result)
  assert.deepEqual(result.config, {
    locale: 'fr',
    weeklyGoalHours: 7,
    baseOnly: true,
    channels: [{ id: 'one' }],
    theme: 'dark',
    removedDefaultChannelIds: ['removed'],
    importedOnly: true
  })
  assert.equal(result.baseTopLevel, true)
  assert.equal(result.importedTopLevel, true)
  assert.equal(Object.hasOwn(result, 'legacyReminder'), false)
})

test('imported state reader accepts direct state and preserves invalid gates', () => {
  const harness = createHarness()
  const valid = { config: {}, videos: {}, anki: {} }
  assert.ok(harness.readImportedState(valid))

  for (const invalid of [
    null,
    {},
    { config: null, videos: {}, anki: {} },
    { config: {}, videos: [], anki: {} },
    { config: {}, videos: {}, anki: [] }
  ]) {
    assert.equal(harness.readImportedState(invalid), null)
  }
})

test('imported state reader validates its two deep dependencies', () => {
  assert.throws(
    () => createImportedStateReader({
      removeLegacyVideoWatchReminderState() {}
    }),
    /default-state factory/
  )
  assert.throws(
    () => createImportedStateReader({ createDefaultState() {} }),
    /legacy-state cleanup/
  )
})

for (const wrapped of [false, true]) {
  test(`normalizing a ${wrapped ? 'wrapped' : 'direct'} import cannot mutate its verified source or opaque island`, () => {
    const source = { config: { channels: [{ id: 'one', name: 'Source' }] },
      videos: { video: { id: 'video', watchProgress: [{ seconds: 4 }] } },
      anki: { day: { reviewed: 2 } }, cityProgress: { maxLevelIndex: 3 },
      onboarding: { setupCompleted: true }, tinySwordsIsland: { version: 23, tiles: [[1, 2, 3]] } }
    const original = structuredClone(source)
    const read = createImportedStateReader({ createDefaultState: () => ({ config: {}, videos: {}, anki: {} }),
      removeLegacyVideoWatchReminderState(state) {
        state.videos.video.watchProgress[0].seconds = 8
        state.anki.day.reviewed = 3
        state.cityProgress.scoringVersion = 7
      } })
    const imported = read(wrapped ? { app: 'edenia', state: source } : source)
    imported.config.channels[0].name = 'Local'
    imported.onboarding.setupCompleted = false
    imported.tinySwordsIsland.tiles[0][0] = 9
    assert.deepEqual(source, original)
    assert.equal(imported.videos.video.watchProgress[0].seconds, 8)
    assert.equal(imported.anki.day.reviewed, 3)
    assert.equal(imported.cityProgress.scoringVersion, 7)
    assert.notEqual(imported.tinySwordsIsland, source.tinySwordsIsland)
  })
}
