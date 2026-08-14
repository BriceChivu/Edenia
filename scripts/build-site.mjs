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

function getAuthConfirmConnectSource() {
  const configuredUrl = String(process.env.SUPABASE_URL || '').trim()
  if (!configuredUrl) return "'none'"
  let url
  try {
    url = new URL(configuredUrl)
  } catch {
    throw new Error('SUPABASE_URL must be a valid hosted project URL')
  }
  if (
    url.protocol !== 'https:'
    || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)
    || url.pathname !== '/'
    || url.search
    || url.hash
    || url.username
    || url.password
  ) throw new Error('SUPABASE_URL must be a valid hosted project URL')
  return url.origin
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

let unsubscribeHtml = await readFile(
  resolve(projectRoot, 'unsubscribe', 'index.html'),
  'utf8'
)
unsubscribeHtml = versionAssetReference(
  unsubscribeHtml,
  'style.css',
  assetVersion
)
unsubscribeHtml = versionAssetReference(
  unsubscribeHtml,
  'unsubscribe.js',
  assetVersion
)
await mkdir(resolve(outputDir, 'unsubscribe'), { recursive: true })
await writeFile(
  resolve(outputDir, 'unsubscribe', 'index.html'),
  unsubscribeHtml
)

let authConfirmHtml = await readFile(
  resolve(projectRoot, 'auth', 'confirm', 'index.html'),
  'utf8'
)
authConfirmHtml = authConfirmHtml.replace(
  '__EDENIA_AUTH_CONFIRM_CONNECT_SRC__',
  getAuthConfirmConnectSource()
)
authConfirmHtml = versionAssetReference(
  authConfirmHtml,
  'style.css',
  assetVersion
)
authConfirmHtml = versionAssetReference(
  authConfirmHtml,
  'fragment-scrubber.js',
  assetVersion
)
authConfirmHtml = versionAssetReference(
  authConfirmHtml,
  'confirm.js',
  assetVersion
)
await mkdir(resolve(outputDir, 'auth', 'confirm'), { recursive: true })
await writeFile(
  resolve(outputDir, 'auth', 'confirm', 'index.html'),
  authConfirmHtml
)

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
const unsubscribeBuild = await build({
  bundle: true,
  charset: 'utf8',
  entryPoints: [resolve(projectRoot, 'src', 'reminder-unsubscribe-page.js')],
  format: 'esm',
  legalComments: 'none',
  logLevel: 'silent',
  platform: 'browser',
  target: 'es2022',
  treeShaking: false,
  write: false
})
if (unsubscribeBuild.outputFiles.length !== 1) {
  throw new Error(
    `Expected one bundled unsubscribe output, found ${unsubscribeBuild.outputFiles.length}`
  )
}
const unsubscribeSource = unsubscribeBuild.outputFiles[0].text
if (/^\s*(?:import|export)\b/m.test(unsubscribeSource)) {
  throw new Error(
    'Bundled unsubscribe output is not compatible with the classic script entry'
  )
}
const authConfirmBuild = await build({
  bundle: true,
  charset: 'utf8',
  entryPoints: [resolve(projectRoot, 'src', 'account-auth-confirm-page.js')],
  format: 'esm',
  legalComments: 'none',
  logLevel: 'silent',
  platform: 'browser',
  target: 'es2022',
  treeShaking: false,
  write: false
})
if (authConfirmBuild.outputFiles.length !== 1) {
  throw new Error(
    `Expected one bundled auth confirmation output, found ${authConfirmBuild.outputFiles.length}`
  )
}
const authConfirmSource = authConfirmBuild.outputFiles[0].text
if (/^\s*(?:import|export)\b/m.test(authConfirmSource)) {
  throw new Error(
    'Bundled auth confirmation output is not compatible with the classic script entry'
  )
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
const minifiedUnsubscribe = await minify(unsubscribeSource, {
  compress: true,
  mangle: true
})
const minifiedAuthConfirm = await minify(authConfirmSource, {
  compress: true,
  mangle: true
})
if (!minifiedApp.code) {
  throw new Error('Terser did not produce app.js output')
}
if (!minifiedPlus.code) {
  throw new Error('Terser did not produce plus.js output')
}
if (!minifiedUnsubscribe.code) {
  throw new Error('Terser did not produce unsubscribe.js output')
}
if (!minifiedAuthConfirm.code) {
  throw new Error('Terser did not produce auth confirmation output')
}
const unsubscribeStyle = await readFile(
  resolve(projectRoot, 'unsubscribe', 'style.css'),
  'utf8'
)
const minifiedUnsubscribeStyle = await transform(unsubscribeStyle, {
  legalComments: 'none',
  loader: 'css',
  minify: true,
  target: 'es2022'
})
const authConfirmStyle = await readFile(
  resolve(projectRoot, 'auth', 'confirm', 'style.css'),
  'utf8'
)
const minifiedAuthConfirmStyle = await transform(authConfirmStyle, {
  legalComments: 'none',
  loader: 'css',
  minify: true,
  target: 'es2022'
})
const minifiedAuthConfirmFragmentScrubber = await minify(
  await readFile(
    resolve(projectRoot, 'auth', 'confirm', 'fragment-scrubber.js'),
    'utf8'
  ),
  { compress: true, mangle: true }
)
if (!minifiedAuthConfirmFragmentScrubber.code) {
  throw new Error('Terser did not produce auth fragment scrubber output')
}
await writeFile(resolve(outputDir, 'app.js'), minifiedApp.code)
await writeFile(resolve(outputDir, 'plus', 'plus.js'), minifiedPlus.code)
await writeFile(
  resolve(outputDir, 'unsubscribe', 'unsubscribe.js'),
  minifiedUnsubscribe.code
)
await writeFile(
  resolve(outputDir, 'unsubscribe', 'style.css'),
  minifiedUnsubscribeStyle.code
)
await writeFile(
  resolve(outputDir, 'auth', 'confirm', 'confirm.js'),
  minifiedAuthConfirm.code
)
await writeFile(
  resolve(outputDir, 'auth', 'confirm', 'fragment-scrubber.js'),
  minifiedAuthConfirmFragmentScrubber.code
)
await writeFile(
  resolve(outputDir, 'auth', 'confirm', 'style.css'),
  minifiedAuthConfirmStyle.code
)
await writeFile(resolve(outputDir, 'style.css'), minifiedStyle.code)

await copyPath('analytics.js')
await copyPath('Edenia_favicon_round.png')
await copyPath('assets')
await copyPath('images')
await mkdir(resolve(outputDir, 'data'), { recursive: true })
await copyPath('data/channel-catalog.json')
await copyPath('data/channel-catalog.community.json')
await copyPath('data/channel-catalog.discovered.json')

// Keep compatibility markers true until cached pre-retirement assets expire.
await writeFile(
  resolve(outputDir, 'config.local.js'),
  'window.EDENIA_CONFIG = {\n'
    + '  "youtubeApiKey": "",\n'
    + '  "freePlusEnabled": false,\n'
    + '  "plusCheckoutEnabled": false,\n'
    + '  "accountFeaturesRollout": "off",\n'
    + '  "googleSignInMode": "oauth_redirect",\n'
    + '  "googleOneTapEnabled": false,\n'
    + '  "googleIdentityClientId": "",\n'
    + '  "turnstileSiteKey": "",\n'
    + '  "videoOrganizationEnabled": true,\n'
    + '  "channelVideoFormatToggleEnabled": true,\n'
    + '  "studyGuidanceEnabled": false,\n'
    + '  "indexedDbBackupsEnabled": false,\n'
    + '  "indexedDbBackupCleanupEnabled": false,\n'
    + '  "legacyProgressMigrationEnabled": false,\n'
    + '  "supabaseUrl": "",\n'
    + '  "supabasePublishableKey": ""\n'
    + '}\n'
)

console.log(`Built Edenia ${assetVersion} in ${outputDir}`)

await import('./build-legacy-migration-helper.mjs')
