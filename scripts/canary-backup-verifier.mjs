import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

// Read-only archive inspection for the existing disaster-backup workflow.
// Never extracts files to disk or executes SQL. Archive contents stay private.
export function inspectCanaryBackupArchive(file) {
  if (typeof file !== 'string' || !file) throw new Error('A private backup archive is required')
  const archive = resolve(file)
  const options = { timeout: 10000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }
  const readTar = args => {
    try { return execFileSync('tar', args, options) }
    catch { throw new Error('Private backup archive could not be inspected') }
  }
  const members = readTar(['-tzf', archive]).toString('utf8').trim().split('\n').sort()
  if (JSON.stringify(members) !== JSON.stringify(['SHA256SUMS', 'data.sql', 'schema.sql'])) throw new Error('Unexpected backup archive members')
  const checksums = readTar(['-xzOf', archive, 'SHA256SUMS']).toString('utf8').trim().split('\n')
  const expected = new Map()
  for (const line of checksums) {
    const match = line.match(/^([a-f0-9]{64}) [ *](schema\.sql|data\.sql)$/u)
    if (!match || expected.has(match[2])) throw new Error('Invalid backup checksum manifest')
    expected.set(match[2], match[1])
  }
  if (expected.size !== 2) throw new Error('Incomplete backup checksum manifest')
  const hashes = {}
  let data
  for (const name of ['schema.sql', 'data.sql']) {
    const bytes = readTar(['-xzOf', archive, name])
    const hash = createHash('sha256').update(bytes).digest('hex')
    if (expected.get(name) !== hash) throw new Error('Backup checksum mismatch')
    hashes[name] = hash
    if (name === 'data.sql') data = bytes.toString('utf8')
  }
  const counts = {}
  let current = null
  for (const line of data.split('\n')) {
    if (current !== null) {
      if (line === '\\.') current = null
      else counts[current] += 1
      continue
    }
    const match = line.match(/^COPY public\.(learner_profile_heads|learner_profile_versions) \([^]*\) FROM stdin;$/u)
    if (match) {
      if (Object.hasOwn(counts, match[1])) throw new Error('Duplicate profile COPY section')
      current = match[1]
      counts[current] = 0
    }
  }
  if (current !== null || Object.keys(counts).length !== 2) throw new Error('Incomplete profile COPY sections')
  return { schemaSha256: hashes['schema.sql'], dataSha256: hashes['data.sql'], profileHeads: counts.learner_profile_heads, profileVersions: counts.learner_profile_versions }
}
