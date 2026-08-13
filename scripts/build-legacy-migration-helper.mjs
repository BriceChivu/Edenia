import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, transform } from 'esbuild'
import { minify } from 'terser'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const outputDir = resolve(projectRoot, '_legacy_migration_site')

if (relative(projectRoot, outputDir) !== '_legacy_migration_site') {
  throw new Error(`Refusing to clean unexpected build directory: ${outputDir}`)
}

function assetVersion() {
  const configured = process.env.EDENIA_ASSET_VERSION
    || process.env.GITHUB_SHA
  if (configured) return configured.slice(0, 12)
  try {
    return execFileSync(
      'git',
      ['rev-parse', '--short=12', 'HEAD'],
      { cwd: projectRoot, encoding: 'utf8' }
    ).trim()
  } catch {
    return '1.0.0'
  }
}

function versionReference(html, filename, version) {
  const pattern = new RegExp(
    `${filename.replaceAll('.', '\\.')}\(?:\\?v=[^"'\\s>]+\)?`,
    'g'
  )
  const matches = html.match(pattern) || []
  if (matches.length !== 1) {
    throw new Error(
      `Expected one helper ${filename} reference, found ${matches.length}`
    )
  }
  return html.replace(pattern, `${filename}?v=${version}`)
}

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })

const version = assetVersion()
let html = await readFile(
  resolve(projectRoot, 'legacy-migration-helper', 'index.html'),
  'utf8'
)
for (const filename of ['style.css', 'config.local.js', 'helper.js']) {
  html = versionReference(html, filename, version)
}

const helperBuild = await build({
  bundle: true,
  charset: 'utf8',
  entryPoints: [resolve(projectRoot, 'src', 'legacy-migration-helper.js')],
  format: 'iife',
  legalComments: 'none',
  logLevel: 'silent',
  platform: 'browser',
  target: 'es2022',
  treeShaking: true,
  write: false
})
if (helperBuild.outputFiles.length !== 1) {
  throw new Error(
    `Expected one bundled helper output, found ${helperBuild.outputFiles.length}`
  )
}
const helperSource = helperBuild.outputFiles[0].text
if (/^\s*(?:import|export)\b/m.test(helperSource)) {
  throw new Error('Bundled helper output is not a classic script')
}
const minifiedHelper = await minify(helperSource, {
  compress: true,
  mangle: true
})
if (!minifiedHelper.code) throw new Error('Terser did not produce helper.js')

const styleSource = await readFile(
  resolve(projectRoot, 'legacy-migration-helper', 'style.css'),
  'utf8'
)
const minifiedStyle = await transform(styleSource, {
  legalComments: 'none',
  loader: 'css',
  minify: true,
  target: 'es2022'
})
const safeConfig = {
  createTransferUrl: '',
  returnUrl: '',
  supabasePublishableKey: '',
  supabaseUrl: ''
}

await Promise.all([
  writeFile(resolve(outputDir, 'index.html'), html),
  writeFile(resolve(outputDir, 'helper.js'), minifiedHelper.code),
  writeFile(resolve(outputDir, 'style.css'), minifiedStyle.code),
  writeFile(
    resolve(outputDir, 'config.local.js'),
    `window.EDENIA_LEGACY_MIGRATION_CONFIG = ${JSON.stringify(
      safeConfig,
      null,
      2
    )}\n`
  )
])

console.log(`Built Edenia migration helper ${version} in ${outputDir}`)
