import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lockSql = `
  do $lock$
  begin
    lock table public.learner_profile_heads in row exclusive mode;
    update public.learner_profile_heads
    set updated_at = updated_at;
    perform pg_catalog.pg_sleep(1.2);
  end
  $lock$;
`

const maintenanceSql = `
  select status
  from private.run_learner_profile_maintenance(null, false);
`

const runQueryFile = (filePath, label) => new Promise((resolve, reject) => {
  const child = spawn(
    'supabase',
    ['db', 'query', '--local', '--output', 'csv', '--file', filePath],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  )

  let stderr = ''
  child.stderr.on('data', chunk => {
    stderr += chunk.toString()
  })
  child.on('error', () => reject(new Error(`Supabase ${label} query could not start`)))
  child.on('close', code => {
    if (code === 0) {
      resolve()
      return
    }
    reject(new Error(`Supabase ${label} query failed: ${stderr.trim().slice(0, 300)}`))
  })
})

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const workDirectory = await mkdtemp(join(tmpdir(), 'edenia-profile-concurrency-'))
const writerFile = join(workDirectory, 'writer.sql')
const maintenanceFile = join(workDirectory, 'maintenance.sql')
await writeFile(writerFile, lockSql)
await writeFile(maintenanceFile, maintenanceSql)

const writer = runQueryFile(writerFile, 'writer')
await sleep(250)

try {
  const startedAt = performance.now()
  await runQueryFile(maintenanceFile, 'maintenance')
  const elapsedMilliseconds = performance.now() - startedAt

  if (elapsedMilliseconds < 700) {
    throw new Error('Maintenance did not wait for the concurrent profile write')
  }
} finally {
  try {
    await writer
  } finally {
    await rm(workDirectory, { recursive: true, force: true })
  }
}
