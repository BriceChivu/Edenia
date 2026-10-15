import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// These checks stay in every selected frontend run, even when its feature suite
// is narrow. Browser-specific storage projects are selected by Playwright too.
export const DATA_SMOKE = ['profile-recovery-journal', 'learner-profile-import', 'indexed-db-backups']
export const UI_SUITES = {
  feed: ['video-organization', 'channel-video-format-toggle', 'video-card-ribbons', 'feed-update-focus', 'large-video-library', 'manual-video-reveal'],
  channels: ['channel-removal-persistence', 'channel-upload-history', 'channel-hourly-pagination', 'manual-channel-entry', 'channel-video-format-toggle'],
  history: ['history-chart', 'history-heatmap-layout', 'large-video-library'],
  guidance: ['study-guidance'],
  reminders: ['reminder-destination', 'reminder-unsubscribe-page'],
  plus: ['plus-upgrade', 'account-settings'],
}

export function selectCiScope(files, { full = false } = {}) {
  const scope = { contracts: false, browser: false, game: false, catalogs: false,
    supabase: false, supabase_db: false, discovery_catalog: false,
    community_catalog: false, full_matrix: full, browser_files: [] }
  const selected = new Set([...DATA_SMOKE, 'preservation-smoke'])
  let broad = full
  const all = () => {
    scope.contracts = scope.browser = scope.game = scope.supabase = scope.supabase_db = true
    broad = true
  }
  if (full) { all(); scope.catalogs = true }
  for (const file of files) {
    // CI/build infrastructure must prove the complete new graph before merging.
    if (/^(?:\.github\/workflows\/(?:ci|deploy-pages)\.yml|\.github\/actions\/setup-godot\/|scripts\/(?:ci-|run-ci-|build-|setup-godot)|playwright\.config\.mjs|package(?:-lock)?\.json|\.nvmrc)/.test(file)) {
      all()
    } else if (/^(?:\.github\/workflows\/(?:learner-profile-disaster-backup|auth-health-monitor)\.yml|scripts\/(?:canary-|rehearse-canary-|watch-canary-execution|generate-owned-profile-contract-fixtures)|tests\/fixtures\/)/.test(file)) {
      all()
    } else if (/^supabase\//.test(file)) {
      scope.contracts = scope.supabase = true
      if (/^supabase\/(?:migrations|tests)\/|^supabase\/config\.toml$/.test(file)) scope.supabase_db = true
      // Profile protocol and backend changes are also exercised by browser clients.
      scope.browser = scope.game = true
      broad = true
    } else if (/^(?:godot\/|tests\/godot\/|assets\/tiny-swords\/|scripts\/tiny-swords)/.test(file)) {
      scope.contracts = scope.browser = scope.game = true
      broad = true
    } else if (/^tests\/contracts\//.test(file)) {
      scope.contracts = true
    } else if (/^tests\/e2e\/.*\.spec\.mjs$/.test(file)) {
      scope.contracts = scope.browser = true
      selected.add(file.split('/').at(-1).replace('.spec.mjs', ''))
      if (/(?:tiny-swords|public-island|auth-trial|profile|storage|migration|handoff)/.test(file)) scope.game = true
    } else if (/^tests\/support\//.test(file)) {
      all()
    } else if (/^(?:data\/channel-catalog|images\/channel-avatars\/)/.test(file)) {
      scope.catalogs = true
      if (file === 'data/channel-catalog.discovered.json') scope.discovery_catalog = true
      if (/data\/channel-catalog\.(?:community|candidates)\.json/.test(file)) scope.community_catalog = true
    } else if (/(?:discover-language-channels|validate-.*channel|community-channel-catalog-policy|reminder-discovery-channels)/.test(file)) {
      scope.catalogs = scope.contracts = true
    } else if (/^\.github\/workflows\/(?:import-community|merge-checked)/.test(file)) {
      scope.contracts = scope.supabase = true
    } else if (/\.md$|^docs\//.test(file)) {
      continue
    } else {
      scope.contracts = scope.browser = true
      // Persistence, ownership and shared entry points deliberately fail broad.
      // Only the explicitly mapped UI surfaces below may omit game acceptance.
      let suites
      if (/^src\/styles\/70-video-feed\.css$|^src\/features\/videos\//.test(file)) suites = UI_SUITES.feed
      else if (/^src\/features\/channels\//.test(file)) suites = [...UI_SUITES.feed, ...UI_SUITES.channels]
      else if (/^src\/features\/study-history\/|^src\/styles\/(?:60-study-history|61-study-history-chart)\.css$/.test(file)) suites = UI_SUITES.history
      else if (/^src\/features\/study-guidance\//.test(file)) suites = UI_SUITES.guidance
      if (suites) suites.forEach(suite => selected.add(suite))
      else { scope.game = true; broad = true }
      if (/^src\/(?:state|domain|integrations)\//.test(file) || file === 'src/app.js') scope.supabase = scope.supabase_db = true
    }
  }
  scope.browser_files = broad ? [] : [...selected].sort().map(name => `${name}.spec.mjs`)
  scope.build = scope.contracts || scope.browser || scope.game
  return scope
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const benchmark = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.CI_BENCHMARK === 'feed-css'
  const full = !benchmark && ['schedule', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)
  const files = benchmark ? ['src/styles/70-video-feed.css'] : full ? []
    : execFileSync('git', ['diff', '--name-only', '-z', process.env.BASE_SHA, 'HEAD'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  const scope = selectCiScope(files, { full })
  console.log(JSON.stringify({ files, scope }, null, 2))
  for (const [key, value] of Object.entries(scope)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${JSON.stringify(value)}\n`)
}
