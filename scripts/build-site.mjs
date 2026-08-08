import { execFileSync } from 'node:child_process'
import {
  cp,
  mkdir,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, transform } from 'esbuild'
import { minify } from 'terser'
import { readOrderedStyleSource } from './read-style-source.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const outputDir = resolve(projectRoot, '_site')

if (relative(projectRoot, outputDir) !== '_site') {
  throw new Error(`Refusing to clean unexpected build directory: ${outputDir}`)
}

function getAssetVersion() {
  const configuredVersion = process.env.EDENIA_ASSET_VERSION
    || process.env.GITHUB_SHA

  if (configuredVersion) return configuredVersion.slice(0, 12)

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

function versionAssetReference(html, filename, version) {
  const escapedFilename = filename.replaceAll('.', '\\.')
  const pattern = new RegExp(`${escapedFilename}(?:\\?v=[^"'\\s>]+)?`, 'g')
  const matches = html.match(pattern) || []

  if (matches.length !== 1) {
    throw new Error(`Expected one ${filename} reference in index.html, found ${matches.length}`)
  }

  return html.replace(pattern, `${filename}?v=${version}`)
}

async function copyPath(relativePath) {
  await cp(
    resolve(projectRoot, relativePath),
    resolve(outputDir, relativePath),
    {
      filter: source => basename(source) !== '.DS_Store',
      recursive: true
    }
  )
}

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })

const assetVersion = getAssetVersion()
let html = await readFile(resolve(projectRoot, 'index.html'), 'utf8')
html = versionAssetReference(html, 'style.css', assetVersion)
html = versionAssetReference(html, 'analytics.js', assetVersion)
html = versionAssetReference(html, 'app.js', assetVersion)
await writeFile(resolve(outputDir, 'index.html'), html)

let plusHtml = await readFile(resolve(projectRoot, 'plus', 'index.html'), 'utf8')
plusHtml = versionAssetReference(plusHtml, 'style.css', assetVersion)
plusHtml = versionAssetReference(plusHtml, 'plus.js', assetVersion)
await mkdir(resolve(outputDir, 'plus'), { recursive: true })
await writeFile(resolve(outputDir, 'plus', 'index.html'), plusHtml)

const appBuild = await build({
  bundle: true,
  charset: 'utf8',
  entryPoints: [resolve(projectRoot, 'src', 'app.js')],
  format: 'esm',
  legalComments: 'none',
  logLevel: 'silent',
  platform: 'browser',
  target: 'es2022',
  treeShaking: false,
  write: false
})
if (appBuild.outputFiles.length !== 1) {
  throw new Error(`Expected one bundled app output, found ${appBuild.outputFiles.length}`)
}
const appSource = appBuild.outputFiles[0].text
if (/^\s*(?:import|export)\b/m.test(appSource)) {
  throw new Error('Bundled app output is not compatible with the classic script entry')
}
const plusBuild = await build({
  bundle: true,
  charset: 'utf8',
  entryPoints: [resolve(projectRoot, 'src', 'plus-page.js')],
  format: 'esm',
  legalComments: 'none',
  logLevel: 'silent',
  platform: 'browser',
  target: 'es2022',
  treeShaking: false,
  write: false
})
if (plusBuild.outputFiles.length !== 1) {
  throw new Error(`Expected one bundled Plus output, found ${plusBuild.outputFiles.length}`)
}
const plusSource = plusBuild.outputFiles[0].text
if (/^\s*(?:import|export)\b/m.test(plusSource)) {
  throw new Error('Bundled Plus output is not compatible with the classic script entry')
}
const { source: styleSource } = await readOrderedStyleSource(
  resolve(projectRoot, 'src', 'styles', 'index.css')
)
const minifiedStyle = await transform(styleSource.toString('utf8'), {
  legalComments: 'none',
  loader: 'css',
  minify: true,
  target: 'es2022'
})

const minifiedApp = await minify(appSource, {
  compress: true,
  mangle: true
})
const minifiedPlus = await minify(plusSource, {
  compress: true,
  mangle: true
})
if (!minifiedApp.code) {
  throw new Error('Terser did not produce app.js output')
}
if (!minifiedPlus.code) {
  throw new Error('Terser did not produce plus.js output')
}
await writeFile(resolve(outputDir, 'app.js'), minifiedApp.code)
await writeFile(resolve(outputDir, 'plus', 'plus.js'), minifiedPlus.code)
await writeFile(resolve(outputDir, 'style.css'), minifiedStyle.code)

await copyPath('analytics.js')
await copyPath('Edenia_favicon_round.png')
await copyPath('assets')
await copyPath('images')
await mkdir(resolve(outputDir, 'data'), { recursive: true })
await copyPath('data/channel-catalog.json')
await copyPath('data/channel-catalog.community.json')
await copyPath('data/channel-catalog.discovered.json')

await writeFile(
  resolve(outputDir, 'config.local.js'),
  'window.EDENIA_CONFIG = {\n'
    + '  "youtubeApiKey": "",\n'
    + '  "freePlusEnabled": false,\n'
    + '  "plusCheckoutEnabled": false,\n'
    + '  "videoOrganizationEnabled": false,\n'
    + '  "channelVideoFormatToggleEnabled": false,\n'
    + '  "studyGuidanceEnabled": false,\n'
    + '  "indexedDbBackupsEnabled": false,\n'
    + '  "indexedDbBackupCleanupEnabled": false,\n'
    + '  "supabaseUrl": "",\n'
    + '  "supabasePublishableKey": ""\n'
    + '}\n'
)

console.log(`Built Edenia ${assetVersion} in ${outputDir}`)
