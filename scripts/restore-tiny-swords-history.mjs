import { spawnSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Only successful master deployments can seed the compatibility window. A
// network/auth failure must not silently remove the previous published files.
export async function restorePreviousTinySwordsHistory({
  repository = process.env.GITHUB_REPOSITORY,
  destination = resolve('.cache/previous-tiny-swords'),
  gh = args => spawnSync('gh', args, { encoding: 'utf8' }), log = console.log
} = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Expected the deployment repository')
  function json(args) {
    const response = gh(args)
    if (response.status !== 0) throw new Error('Unable to read previous deployment metadata')
    return JSON.parse(response.stdout)
  }
  const runs = json(['run', 'list', '--repo', repository, '--workflow', 'deploy-pages.yml', '--branch', 'master', '--status', 'success', '--limit', '1', '--json', 'databaseId'])
  const id = runs[0]?.databaseId
  if (!Number.isSafeInteger(id)) { log('No successful previous deployment is available'); return false }
  const artifacts = json(['api', `repos/${repository}/actions/runs/${id}/artifacts?per_page=100`])
  if (!artifacts.artifacts?.some(item => item.name === 'tiny-swords-compatibility' && item.expired === false)) {
    log('Previous deployment predates the game archive or its seven-day window has expired')
    return false
  }
  await mkdir(destination, { recursive: true })
  const downloaded = gh(['run', 'download', String(id), '--repo', repository, '--name', 'tiny-swords-compatibility', '--dir', destination])
  if (downloaded.status !== 0) throw new Error('Game archive download failed; refusing to drop retained releases')
  log(`Restored game compatibility archive from deployment ${id}`)
  return true
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await restorePreviousTinySwordsHistory()
