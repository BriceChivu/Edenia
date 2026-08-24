import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'

export const RELEASE_MANIFEST_SCHEMA_VERSION = 1
export const RELEASE_MANIFEST_FILE = 'release.json'

const COMMIT_PATTERN = /^[0-9a-f]{40,64}$/u
const SHA256_PATTERN = /^[0-9a-f]{64}$/u
const ASSET_VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/u

export function normalizeReleaseCommit(value, label = 'Release commit') {
  const commit = String(value || '').trim().toLowerCase()
  if (!COMMIT_PATTERN.test(commit)) {
    throw new Error(`${label} must be a full lowercase Git commit SHA`)
  }
  return commit
}

export function normalizeAssetVersion(value, label = 'Asset version') {
  const version = String(value || '').trim()
  if (!ASSET_VERSION_PATTERN.test(version)) {
    throw new Error(`${label} is invalid`)
  }
  return version
}

export function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex')
}

export function getReleaseCommit({
  environment = process.env,
  runGit = () => execFileSync(
    'git',
    ['rev-parse', 'HEAD'],
    { encoding: 'utf8' }
  )
} = {}) {
  const configured = environment.EDENIA_RELEASE_COMMIT
    || environment.GITHUB_SHA
  if (configured) return normalizeReleaseCommit(configured)

  try {
    return normalizeReleaseCommit(runGit())
  } catch {
    throw new Error('A full Git commit SHA is required for the release manifest')
  }
}

export function getReleaseAssetVersion({
  releaseCommit,
  environment = process.env
} = {}) {
  const configured = environment.EDENIA_ASSET_VERSION
  return normalizeAssetVersion(
    configured || normalizeReleaseCommit(releaseCommit).slice(0, 12)
  )
}

export function createReleaseManifest({
  deployedCommit,
  assetVersion,
  runtimeConfigSource
} = {}) {
  const manifest = {
    schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
    deployedCommit: normalizeReleaseCommit(deployedCommit),
    assetVersion: normalizeAssetVersion(assetVersion),
    runtimeConfigSha256: sha256Hex(runtimeConfigSource)
  }
  return manifest
}

export function validateReleaseManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Release manifest must be an object')
  }
  if (manifest.schemaVersion !== RELEASE_MANIFEST_SCHEMA_VERSION) {
    throw new Error('Release manifest schema version is unsupported')
  }
  const deployedCommit = normalizeReleaseCommit(manifest.deployedCommit)
  const assetVersion = normalizeAssetVersion(manifest.assetVersion)
  const runtimeConfigSha256 = String(manifest.runtimeConfigSha256 || '').trim()
  if (!SHA256_PATTERN.test(runtimeConfigSha256)) {
    throw new Error('Release manifest runtime config hash is invalid')
  }
  return {
    schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
    deployedCommit,
    assetVersion,
    runtimeConfigSha256
  }
}

export function serializeReleaseManifest(manifest) {
  return `${JSON.stringify(validateReleaseManifest(manifest), null, 2)}\n`
}

export async function readReleaseManifest(path) {
  const source = await readFile(path, 'utf8')
  try {
    return validateReleaseManifest(JSON.parse(source))
  } catch (error) {
    throw new Error(`Could not read release manifest: ${error.message}`)
  }
}

export async function writeReleaseManifest(path, manifest) {
  await writeFile(path, serializeReleaseManifest(manifest))
}
