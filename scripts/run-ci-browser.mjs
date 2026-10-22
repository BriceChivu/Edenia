import { spawnSync } from 'node:child_process'

const lane = process.env.EDENIA_CI_LANE || 'browser'
const gameFiles = ['learner-profile-conflict', 'auth-trial', 'profile-handoff', 'signin-island-handoff',
  'experience-tiny-swords', 'tiny-swords-release', 'tiny-swords-delivery', 'tiny-swords-preload', 'tiny-swords-tester-mode',
  'tiny-swords-dashboard', 'tiny-swords-copy', 'tiny-swords-page-scroll', 'tiny-swords-acceptance',
  'tiny-swords-replay', 'tiny-swords-frame-rate']
const files = lane === 'chromium' ? gameFiles.map(name => `${name}.spec.mjs`)
  : lane === 'webkit' ? ['auth-trial.spec.mjs', 'profile-handoff.spec.mjs', 'tiny-swords-preload.spec.mjs']
  : lane === 'public' ? ['public-island.spec.mjs']
  : JSON.parse(process.env.EDENIA_CI_BROWSER_FILES || '[]')
const projects = lane === 'webkit' ? ['webkit-trial-desktop', 'webkit-trial-phone']
  : lane === 'browser' ? [] : ['desktop-standard', 'phone-standard']
const args = ['playwright', 'test', ...files, ...projects.map(name => `--project=${name}`),
  `--shard=${process.env.EDENIA_CI_SHARD || '1'}/${process.env.EDENIA_CI_SHARDS || '1'}`,
  '--reporter=dot,html,json']
const result = spawnSync('npx', args, { stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)
