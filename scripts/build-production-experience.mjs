import { readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { build, transform } from 'esbuild'
import { minify } from 'terser'

// Retain the released town's presentation and scoring while the new dashboard
// is tested. Unchanged modules remain shared; the manifest pins each override.
export async function createProductionSourceResolver(projectRoot) {
  const compatibilityRoot = resolve(projectRoot, 'compat/production')
  const manifest = JSON.parse(await readFile(resolve(compatibilityRoot, 'manifest.json'), 'utf8'))
  const overrides = new Set(manifest.files)
  const sourcePath = path => resolve(overrides.has(path) ? compatibilityRoot : projectRoot, path)
  const plugin = { name: 'production-compatibility', setup(builder) {
      builder.onResolve({ filter: /^\./ }, args => {
        if (!args.importer.startsWith(compatibilityRoot + '/')
          && !args.importer.startsWith(resolve(projectRoot, 'src') + '/')) return
        const importer = args.importer.startsWith(compatibilityRoot + '/')
          ? resolve(projectRoot, relative(compatibilityRoot, args.importer))
          : args.importer
        return { path: sourcePath(relative(projectRoot, resolve(dirname(importer), args.path))) }
      })
    } }
  return { sourcePath, plugin }
}

export async function buildProductionExperience(projectRoot, outputDir, assetVersion) {
  const { sourcePath, plugin } = await createProductionSourceResolver(projectRoot)
  const bundle = await build({
    entryPoints: [sourcePath('src/app.js')],
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
    charset: 'utf8', legalComments: 'none', treeShaking: false, write: false,
    plugins: [plugin]
  })
  const app = await minify(bundle.outputFiles[0].text)
  if (!app.code) throw new Error('Production compatibility bundle failed')
  await writeFile(resolve(outputDir, 'production-app.js'), app.code)
  const index = await readFile(sourcePath('src/styles/index.css'), 'utf8')
  const styles = await Promise.all([...index.matchAll(/@import "\.\/([^"\n]+)";/g)]
    .map(match => readFile(sourcePath(`src/styles/${match[1]}`), 'utf8')))
  const css = await transform(styles.join('\n'), { loader: 'css', minify: true, target: 'es2022' })
  await writeFile(resolve(outputDir, 'style-production.css'), css.code)
  await writeFile(resolve(outputDir, 'analytics-production.js'), await readFile(sourcePath('analytics.js')))
  let html = await readFile(sourcePath('index.html'), 'utf8')
  for (const [before, after] of [
    ['app.js', 'production-app.js'], ['style.css', 'style-production.css'],
    ['analytics.js', 'analytics-production.js'], ['config.local.js', 'config.local.js']
  ]) {
    html = html.replace(new RegExp(`${before.replaceAll('.', '\\.')}\\?v=[^"\\s]+|${before.replaceAll('.', '\\.')}(?=")`), `${after}?v=${assetVersion}`)
  }
  return html
}
