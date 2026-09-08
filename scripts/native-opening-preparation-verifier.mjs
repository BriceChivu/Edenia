import { readFile, readdir, lstat, realpath } from 'node:fs/promises'
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { join, relative, isAbsolute } from 'node:path'
import { validateNativeAuthLeaf } from './native-auth-leaf-certificate.mjs'

export const nativePreparationSources = Object.freeze([
  'native-opening-auth-diagnostics.mjs', 'native-auth-leaf-certificate.mjs', 'native-opening-auth-policy.mjs',
  'native-opening-auth-proxy.mjs', 'native-opening-auth-worker.mjs',
  'native-opening-authentication.mjs', 'native-opening-preparation-verifier.mjs',
  'hosted-profile-opening-smoke.mjs', 'run-live-profile-opening.mjs'
])
const hash = value => createHash('sha256').update(value).digest('hex')
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
const fail = () => { throw new Error('Native preparation acceptance is missing, stale or changed') }

// Hash only a dedicated stopped preparation profile. The digest is not proof
// of how it was created: that provenance must be independently reviewed before
// the coordinator receives the acceptance record's digest. No contents escape.
export async function hashNativePreparationProfile(directory) {
  const root = await realpath(directory), entries = []; let count = 0, bytes = 0
  if ((await lstat(directory)).isSymbolicLink()) fail()
  async function walk(path) {
    for (const name of (await readdir(path)).sort()) {
      const file = join(path, name), stat = await lstat(file)
      if (++count > 10000 || stat.isSymbolicLink()) fail()
      if (stat.isDirectory()) await walk(file)
      else {
        if (!stat.isFile() || (bytes += stat.size) > 128 * 1024 * 1024) fail()
        entries.push([relative(root, file), hash(await readFile(file))])
      }
    }
  }
  await walk(root)
  if (!entries.length) fail()
  return hash(JSON.stringify(entries))
}

export function readNativeChromeIdentity() {
  const bundle = '/Applications/Google Chrome.app/Contents'
  const version = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(bundle, 'Info.plist')], { encoding: 'utf8' }).trim()
  if (!/^\d+\.\d+\.\d+\.\d+$/u.test(version)) fail()
  return { version, executable: join(bundle, 'MacOS/Google Chrome'), framework: join(bundle, 'Frameworks/Google Chrome Framework.framework/Versions', version, 'Google Chrome Framework') }
}

// Acceptance is an explicit reviewed capability, pinned outside the untrusted
// manifest in coordinator configuration. Merely declaring booleans in a profile
// manifest never enables this transport. Omission still denies before launch.
export function createNativePreparationVerifier({ acceptanceFile, acceptanceSha256, manifestSha256, candidate, reviewed, invocation }, dependencies = {}) {
  return async manifest => {
    if (!isAbsolute(acceptanceFile || '') || !digest(acceptanceSha256) || !digest(manifestSha256)
      || !/^[a-f0-9]{40}$/u.test(candidate || '') || !/^[a-f0-9]{40}$/u.test(reviewed || '') || typeof invocation !== 'string' || !invocation) fail()
    const bytes = await readFile(acceptanceFile)
    if (hash(bytes) !== acceptanceSha256 || (await lstat(acceptanceFile)).isSymbolicLink()) fail()
    const record = JSON.parse(bytes), now = dependencies.now?.() ?? Date.now()
    const created = Date.parse(record.createdUtc), expires = Date.parse(record.expiresUtc)
    if (record.procedure !== 'reviewed-native-preparation-v1' || record.candidate !== candidate || record.reviewed !== reviewed
      || record.invocation !== invocation || record.manifestSha256 !== manifestSha256
      || !Number.isFinite(created) || !Number.isFinite(expires) || created > now || expires <= now + 300000
      || expires - created > 24 * 60 * 60 * 1000 || record.review?.approved !== true
      || !digest(record.review?.sha256) || record.cleanupOwner !== 'packet-1-coordinator'
      || record.recoveryProcedure !== 'native-opening-authentication.md#cleanup-and-recovery') fail()
    for (const name of nativePreparationSources) {
      if (!digest(record.sources?.[name]) || record.sources[name] !== hash(await readFile(new URL(name, import.meta.url)))) fail()
    }
    if (Object.keys(record.sources).length !== nativePreparationSources.length) fail()
    if (record.cleanupRunbookSha256 !== hash(await readFile(new URL('../docs/runbooks/native-opening-authentication.md', import.meta.url)))) fail()
    const chrome = (dependencies.readChromeIdentity || readNativeChromeIdentity)()
    if (record.chrome?.version !== chrome.version
      || record.chrome.executableSha256 !== hash(await readFile(chrome.executable))
      || record.chrome.frameworkSha256 !== hash(await readFile(chrome.framework))) fail()
    for (const name of ['trust', 'egress', 'transport', 'review', 'preparation']) {
      const evidence = record.evidence?.[name]
      if (!evidence || !isAbsolute(evidence.file || '') || !digest(evidence.sha256)
        || (await lstat(evidence.file)).isSymbolicLink() || hash(await readFile(evidence.file)) !== evidence.sha256) fail()
    }
    if (record.evidence.review.sha256 !== record.review.sha256) fail()
    const egress = JSON.parse(await readFile(record.evidence.egress.file))
    if (egress.sourceKind !== 'native-local-egress' || !egress.complete || !egress.cleanupVerified
      || egress.hostedUpstreamRequests !== 0 || !egress.directControlCompleted
      || egress.beforeReport?.ok !== true || egress.beforeReport.checks !== 18
      || egress.afterReport?.ok !== true || egress.afterReport.attempts !== 20 || egress.afterReport.failedProbes !== 20
      || ['turnTcp', 'turnTls', 'directTls', 'forwarded', 'udp', 'forbidden'].some(name => egress.crashCounts?.[name] !== 0)) fail()
    const proof = JSON.parse(await readFile(record.evidence.preparation.file))
    if (proof.procedure !== 'native-real-origin-preparation-v1' || proof.startedEmpty !== true
      || proof.hostedRequests !== 0 || proof.browserStopped !== true || proof.cleanupRequired !== true
      || proof.profileDirectory !== manifest.profileDirectory || proof.manifestSha256 !== manifestSha256
      || proof.chromeVersion !== chrome.version || !Array.isArray(proof.acceptedLeaves)) fail()
    if (!digest(record.profileSha256) || record.profileSha256 !== await hashNativePreparationProfile(manifest.profileDirectory)) fail()
    if (manifest.certificates.length !== 3 || proof.acceptedLeaves.length !== 3) fail()
    // Existing wrapper separately confines certificate paths to preparationRoot.
    // Validate public/private correspondence here without persisting key bytes.
    for (const row of manifest.certificates) {
      const cert = await readFile(row.certificateFile), key = await readFile(row.keyFile)
      const leaf = validateNativeAuthLeaf({ cert, sha256: row.sha256 }, new URL(row.origin).hostname)
      if (Date.parse(leaf.validTo) < expires) fail()
      const certPublic = createPublicKey(cert).export({ type: 'spki', format: 'der' })
      const keyPublic = createPublicKey(createPrivateKey(key)).export({ type: 'spki', format: 'der' })
      if (!certPublic.equals(keyPublic) || proof.acceptedLeaves.filter(leaf => leaf.origin === row.origin && leaf.sha256 === row.sha256 && leaf.connections > 0).length !== 1) fail()
    }
    return true
  }
}
