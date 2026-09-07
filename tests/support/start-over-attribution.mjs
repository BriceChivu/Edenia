import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

// Disposable browser diagnosis: splice observations into the original functions,
// preserving all return values, RPC arguments and safety predicates.
export async function installStartOverAttribution(page) {
  const result = await build({
    bundle: true,
    entryPoints: ['src/app.js'],
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    treeShaking: false,
    write: false,
    plugins: [{
      name: 'start-over-observation',
      setup(builder) {
        builder.onLoad({ filter: /(?:app|learner-profile-cloud-persistence)\.js$/ }, async ({ path }) => {
          let contents = await readFile(path, 'utf8')
          const marker = path.endsWith('/src/app.js')
            ? 'async function resetApp() {'
            : 'function canReplaceSynchronizedHead({ activation, isCurrent }) {'
          if (contents.split(marker).length !== 2) throw new Error(`Missing unique diagnostic seam: ${marker}`)
          const observation = path.endsWith('/src/app.js')
            ? 'window.__startOverAttribution.handlerCalls += 1;'
            : `window.__startOverAttribution.boundaries.push({
              bound: Boolean(activeBinding),
              activationMatches: activeBinding?.activation === activation,
              current: typeof isCurrent === 'function' && isCurrent(),
              bindingCurrent: Boolean(activeBinding?.isCurrent()),
              cloudHeadKnown, online: isOnline(),
              ownerMatches: readSyncRecord()?.ownerId === activation?.ownerId,
              profileMatches: readSyncRecord()?.profileId === activation?.profileId,
              syncPresentation: document.querySelector('#learnerProfileSyncStatus')?.textContent,
              generation: readSyncRecord()?.generation,
              acceptedRevision: readSyncRecord()?.acceptedRevision,
              bindingRevision: activeBinding?.revision,
              pending: readSyncRecord()?.pending !== null,
              queued: readSyncRecord()?.queued !== null,
              dirty: readDirtyRecord().present
            });`
          contents = contents.replace(marker, `${marker}\n${observation}`)
          return { contents, loader: 'js' }
        })
      }
    }]
  })
  await page.addInitScript(() => {
    window.__startOverAttribution = { handlerCalls: 0, boundaries: [] }
  })
  await page.route('**/app.js*', route => route.fulfill({
    body: result.outputFiles[0].text,
    contentType: 'text/javascript'
  }))
}
