import { cp, mkdir, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve('.cache/ci-sites')
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })
function build(env) {
  const result = spawnSync(process.execPath, ['scripts/build-site.mjs'], {
    stdio: 'inherit', env: { ...process.env, ...env }
  })
  if (result.error || result.status !== 0) throw result.error || new Error('CI site build failed')
}
build({ EDENIA_TINY_SWORDS_ENABLED: 'false', EDENIA_TINY_SWORDS_PUBLIC_ENABLED: 'false' })
await cp('_site', `${root}/normal`, { recursive: true })
await cp('_legacy_migration_site', `${root}/migration-helper`, { recursive: true })
if (process.env.EDENIA_CI_GAME === 'true') {
  // Reuse only this job's freshly exported game; configurations vary in the host.
  for (const [name, publicEnabled] of [['integrated', 'false'], ['public', 'true']]) {
    build({ EDENIA_GAME_ARTIFACT_DIR: `${root}/normal`, EDENIA_TINY_SWORDS_ENABLED: 'true', EDENIA_TINY_SWORDS_PUBLIC_ENABLED: publicEnabled })
    await cp('_site', `${root}/${name}`, { recursive: true })
  }
}
