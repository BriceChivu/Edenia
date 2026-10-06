import { build } from 'esbuild'
import { resolve } from 'node:path'
import { createProductionSourceResolver } from '../../scripts/build-production-experience.mjs'

export async function loadProductionModule(path) {
  const { sourcePath, plugin } = await createProductionSourceResolver(resolve('.'))
  const result = await build({
    entryPoints: [sourcePath(path)], bundle: true, format: 'esm', write: false,
    plugins: [plugin]
  })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
