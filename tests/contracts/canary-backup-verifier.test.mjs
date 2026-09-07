import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { inspectCanaryBackupArchive } from '../../scripts/canary-backup-verifier.mjs'

test('backup verifier checks actual archive bytes and COPY counts without executing SQL', t => {
  const dir = mkdtempSync(join(tmpdir(), 'edenia-archive-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const schema = '-- synthetic schema only\n'
  const data = 'COPY public.learner_profile_heads (id) FROM stdin;\nfixture-head\n\\.\nCOPY public.learner_profile_versions (id) FROM stdin;\nfixture-one\nfixture-two\n\\.\n'
  const digest = value => createHash('sha256').update(value).digest('hex')
  writeFileSync(join(dir, 'schema.sql'), schema)
  writeFileSync(join(dir, 'data.sql'), data)
  writeFileSync(join(dir, 'SHA256SUMS'), `${digest(schema)}  schema.sql\n${digest(data)}  data.sql\n`)
  const file = join(dir, 'backup.tar.gz')
  const pack = () => execFileSync('tar', ['-czf', file, '-C', dir, 'schema.sql', 'data.sql', 'SHA256SUMS'])
  pack()
  assert.deepEqual(inspectCanaryBackupArchive(file), { schemaSha256: digest(schema), dataSha256: digest(data), profileHeads: 1, profileVersions: 2 })
  writeFileSync(join(dir, 'data.sql'), data + '-- changed\n')
  pack()
  assert.throws(() => inspectCanaryBackupArchive(file), /checksum mismatch/)
})
