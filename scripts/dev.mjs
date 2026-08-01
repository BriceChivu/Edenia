import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  readLocalRuntimeConfig,
  writeLocalRuntimeConfig
} from './local-runtime-config.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const localConfigPath = resolve(projectRoot, 'config.local.js')
const outputConfigPath = resolve(projectRoot, '_site', 'config.local.js')
const buildScriptPath = resolve(scriptDir, 'build-site.mjs')
const serverScriptPath = resolve(scriptDir, 'serve-static.mjs')
const host = 'localhost'
const port = 8000

function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      ...options
    })
    child.once('error', rejectPromise)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      const result = signal ? `signal ${signal}` : `exit code ${code}`
      rejectPromise(new Error(`${command} failed with ${result}.`))
    })
  })
}

async function main() {
  const runtimeConfig = await readLocalRuntimeConfig(localConfigPath)

  await run(process.execPath, [buildScriptPath])
  await writeLocalRuntimeConfig(outputConfigPath, runtimeConfig)

  console.log('Prepared local YouTube configuration (key hidden).')
  console.log(`Edenia is available at http://localhost:${port}/`)
  await run(process.execPath, [
    serverScriptPath,
    '--host',
    host,
    '--port',
    String(port),
    '--root',
    resolve(projectRoot, '_site')
  ])
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
