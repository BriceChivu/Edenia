import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
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
  const available = name => artifacts.artifacts?.some(item => item.name === name && item.expired === false)
  if (!available('tiny-swords-compatibility') && available('github-pages')) {
    await mkdir(resolve(destination, '..'), { recursive: true })
    const temporary = await mkdtemp(resolve(destination, '..', '.previous-pages-'))
    try {
      const download = resolve(temporary, 'download'), game = resolve(temporary, 'game')
      await mkdir(download)
      const result = gh(['run', 'download', String(id), '--repo', repository, '--name', 'github-pages', '--dir', download])
      if (result.status !== 0) throw new Error('Previous Pages game archive download failed')
      const extracted = spawnSync('python3', [fileURLToPath(new URL('./extract-tiny-swords-pages.py', import.meta.url)),
        resolve(download, 'artifact.tar'), game], { encoding: 'utf8' })
      if (extracted.status !== 0) throw new Error('Previous Pages game archive is invalid')
      if (JSON.parse(extracted.stdout).releases === 0) { log('Previous Pages artifact contains no game'); return false }
      await mkdir(destination, { recursive: true })
      if ((await readdir(destination)).length) throw new Error('Previous Pages game archive destination must be empty')
      for (const name of await readdir(game)) {
        await cp(resolve(game, name), resolve(destination, name), { recursive: true, errorOnExist: true, force: false })
      }
      log(`Restored initial game compatibility archive from Pages deployment ${id}`)
      return true
    } finally { await rm(temporary, { recursive: true, force: true }) }
  }
  if (!available('tiny-swords-compatibility')) {
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
