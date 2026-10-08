import { deriveRuntimeEnvironment, deriveTinySwordsExperience } from '../src/core/runtime-environment.js'

// Select before parsing either page. Public availability is compiled into this
// versioned entry; engine availability remains a separate runtime control.
// The parser-blocking entry keeps the selected app on the original document's
// load lifecycle. No intermediate navigation or asynchronous document reset.
const environment = deriveRuntimeEnvironment(window.location)
let currentHtml = __EDENIA_TESTER_HTML__
if (environment.isAuthTrial && !environment.isSandbox) {
  const parent = currentHtml.match(/<script src="([^"]*\/parent\.js)" defer><\/script>/)
  if (!parent) throw new Error('Auth trial requires the current game adapter')
  currentHtml = currentHtml.replace(parent[0], '')
    .replace(/src="app\.js(\?[^"]*)?"/, `src="auth-trial-entry.js$1" data-game-parent="${parent[1]}"`)
}
document.write(deriveTinySwordsExperience(window.location, __EDENIA_TINY_SWORDS_PUBLIC_ENABLED__)
  ? currentHtml : __EDENIA_PRODUCTION_HTML__)
