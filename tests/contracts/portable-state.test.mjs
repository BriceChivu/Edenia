import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canonicalizeJson,
  createPortableProgressEnvelope,
  decodeBase64Url,
  encodeBase64Url,
  isPortableProgressState,
  parsePortableProgressEnvelope,
  sanitizePortableProgressState,
  selectPortableProgressCandidate,
  sha256Base64Url,
  verifyPortableProgressEnvelope
} from '../../src/state/portable-state.js'

function validState(id = 'state') {
  return {
    id,
    config: {
      apiKey: 'legacy-secret',
      ankiDisabledAt: '2026-08-01T00:00:00.000Z',
      ankiResumeBaselines: { today: {} },
      ankiPendingResumeBaseline: { dateKey: '2026-08-01' },
      locale: 'en',
      channels: [{ id: 'channel' }]
    },
    videos: { video: { id: 'video', title: '你好' } },
    anki: {},
    undoStack: [{ id: 'undo' }]
  }
}

function backup(id, createdAt, state = validState(id)) {
  return {
    id,
    createdAt,
    reason: 'automatic backup',
    sandbox: false,
    state
  }
}

test('portable sanitization deep-clones progress and removes device-only config', () => {
  const source = validState()
  const portable = sanitizePortableProgressState(source)
  assert.ok(isPortableProgressState(portable))
  assert.notEqual(portable, source)
  assert.notEqual(portable.config, source.config)
  assert.notEqual(portable.config.channels, source.config.channels)
  assert.deepEqual(portable.config, {
    locale: 'en',
    channels: [{ id: 'channel' }]
  })
  assert.deepEqual(portable.undoStack, [{ id: 'undo' }])
  assert.equal(source.config.apiKey, 'legacy-secret')
  assert.equal(sanitizePortableProgressState({}), null)
  assert.equal(isPortableProgressState({
    config: [],
    videos: {},
    anki: {}
  }), false)
})

test('canonical JSON and SHA-256 ignore object key insertion order only', async () => {
  const left = { z: 1, nested: { b: 2, a: [3, { d: 4, c: 5 }] } }
  const right = { nested: { a: [3, { c: 5, d: 4 }], b: 2 }, z: 1 }
  assert.equal(canonicalizeJson(left), canonicalizeJson(right))
  assert.equal(
    await sha256Base64Url(canonicalizeJson(left)),
    await sha256Base64Url(canonicalizeJson(right))
  )
  assert.notEqual(
    await sha256Base64Url(canonicalizeJson(left)),
    await sha256Base64Url(canonicalizeJson({ ...right, z: 2 }))
  )
})

test('base64url helpers round-trip canonical bytes and reject widened forms', () => {
  const bytes = Uint8Array.from([0, 1, 2, 127, 128, 254, 255])
  const encoded = encodeBase64Url(bytes)
  assert.match(encoded, /^[A-Za-z0-9_-]+$/)
  assert.deepEqual(decodeBase64Url(encoded), bytes)
  for (const invalid of ['', 'abc=', 'a', 'abc+', 'abc/']) {
    assert.throws(() => decodeBase64Url(invalid), /Base64url/)
  }
  assert.throws(() => encodeBase64Url([1, 2]), /requires bytes/)
})

test('source selection prefers a valid primary and excludes private config', () => {
  const primary = validState('primary')
  const result = selectPortableProgressCandidate({
    primaryRaw: JSON.stringify(primary),
    localBackupRaw: JSON.stringify([
      backup('newer-backup', '2026-08-12T00:00:00.000Z')
    ]),
    indexedDbEntries: []
  })
  assert.equal(result.status, 'primary')
  assert.deepEqual(result.source, { kind: 'primary' })
  assert.equal(result.state.id, 'primary')
  assert.equal(Object.hasOwn(result.state.config, 'apiKey'), false)
})

test('source selection recovers the newest deduplicated normal backup', () => {
  const shared = backup('shared', '2026-08-10T00:00:00.000Z')
  const result = selectPortableProgressCandidate({
    primaryRaw: '{corrupt',
    localBackupRaw: JSON.stringify([
      backup('older', '2026-08-09T00:00:00.000Z'),
      shared,
      { ...backup('sandbox', '2026-08-12T00:00:00.000Z'), sandbox: true }
    ]),
    indexedDbEntries: [
      structuredClone(shared),
      backup('newest', '2026-08-11T00:00:00.000Z')
    ]
  })
  assert.equal(result.status, 'backup')
  assert.deepEqual(result.source, {
    kind: 'backup',
    backupId: 'newest',
    createdAt: '2026-08-11T00:00:00.000Z',
    recoveredFromCorruptPrimary: true
  })
  assert.equal(result.corruptEvidence.primary, true)
  assert.equal(result.corruptEvidence.backups, true)
})

test('conflicting backup IDs are rejected instead of choosing arbitrary bytes', () => {
  const first = backup('conflict', '2026-08-10T00:00:00.000Z')
  const second = structuredClone(first)
  second.state.id = 'different'
  const result = selectPortableProgressCandidate({
    localBackupRaw: JSON.stringify([first]),
    indexedDbEntries: [second]
  })
  assert.equal(result.status, 'corrupt')
  assert.equal(result.corruptEvidence.backups, true)
})

test('backup provenance requires canonical ISO timestamps', () => {
  const result = selectPortableProgressCandidate({
    localBackupRaw: JSON.stringify([
      backup('ambiguous-date', '1')
    ])
  })
  assert.equal(result.status, 'corrupt')
  assert.equal(result.corruptEvidence.backups, true)
})

test('absence, corruption, and oversized current progress stay distinct', () => {
  assert.equal(selectPortableProgressCandidate().status, 'none')
  assert.equal(selectPortableProgressCandidate({
    localBackupRaw: '[]',
    indexedDbEntries: []
  }).status, 'none')
  assert.equal(selectPortableProgressCandidate({
    primaryRaw: '{bad',
    localBackupRaw: '{bad'
  }).status, 'corrupt')

  const oversized = selectPortableProgressCandidate({
    primaryRaw: JSON.stringify(validState('current')),
    localBackupRaw: JSON.stringify([
      backup('small-old', '2026-08-01T00:00:00.000Z')
    ]),
    maxBytes: 1
  })
  assert.equal(oversized.status, 'too_large')
  assert.deepEqual(oversized.source, { kind: 'primary' })
})

test('versioned envelopes preserve source provenance and verify state integrity', async () => {
  const created = await createPortableProgressEnvelope({
    state: validState('transfer'),
    source: {
      kind: 'backup',
      backupId: 'backup-one',
      createdAt: '2026-08-01T00:00:00.000Z',
      recoveredFromCorruptPrimary: true
    },
    now: () => new Date('2026-08-13T00:00:00.000Z')
  })
  assert.equal(created.byteLength, new TextEncoder().encode(
    created.serialized
  ).byteLength)
  assert.deepEqual(
    await verifyPortableProgressEnvelope(created.serialized),
    created.envelope
  )
  assert.deepEqual(
    parsePortableProgressEnvelope(created.envelope),
    created.envelope
  )

  const tampered = structuredClone(created.envelope)
  tampered.state.id = 'tampered'
  assert.equal(await verifyPortableProgressEnvelope(tampered), null)
  assert.equal(parsePortableProgressEnvelope({ ...created.envelope, schema: 'unknown' }), null)

  const privateConfig = structuredClone(created.envelope)
  privateConfig.state.config.apiKey = 'must-not-transfer'
  privateConfig.stateSha256 = await sha256Base64Url(
    canonicalizeJson(privateConfig.state)
  )
  assert.equal(parsePortableProgressEnvelope(privateConfig), null)

  assert.equal(parsePortableProgressEnvelope({
    ...created.envelope,
    unexpected: true
  }), null)
  assert.equal(parsePortableProgressEnvelope(created.envelope, {
    maxBytes: 1
  }), null)
})

test('envelope creation fails closed for invalid provenance and byte ceilings', async () => {
  await assert.rejects(
    createPortableProgressEnvelope({
      state: validState(),
      source: { kind: 'unknown' }
    }),
    /input is invalid/
  )
  await assert.rejects(
    createPortableProgressEnvelope({
      state: validState(),
      source: {
        kind: 'backup',
        backupId: 'backup-one',
        createdAt: '1'
      }
    }),
    /input is invalid/
  )
  await assert.rejects(
    createPortableProgressEnvelope({
      state: validState(),
      source: { kind: 'primary' },
      maxBytes: 1
    }),
    /too large/
  )
})
