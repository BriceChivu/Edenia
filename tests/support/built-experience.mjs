import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

// Inspect the actual parser entry, including its runtime selection, without
// executing either application's scripts or exposing alternate HTML routes.
export async function readBuiltExperience(url = 'https://www.edenia.study/?internal_test=2') {
  let html
  vm.runInNewContext(await readFile('_site/site-entry.js', 'utf8'), {
    URLSearchParams,
    window: { location: new URL(url) },
    document: { write(value) { html = value } }
  })
  if (!html) throw new Error('Built entry did not select an experience')
  return html
}
