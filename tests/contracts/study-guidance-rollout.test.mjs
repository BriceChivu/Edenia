import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { I18N, SUPPORTED_LOCALES } from '../../src/i18n/index.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const indexSource = await readFile(
  new URL('../../index.html', import.meta.url),
  'utf8'
)

function getFunctionSource(name, nextName) {
  const start = appSource.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `Missing ${name}`)
  const end = appSource.indexOf(`\nfunction ${nextName}(`, start)
  assert.notEqual(end, -1, `Missing ${nextName}`)
  return appSource.slice(start, end)
}

test('goal-independent guidance stays behind the internal-or-release gate', () => {
  assert.match(
    appSource,
    /const STUDY_GUIDANCE_ENABLED = deriveStudyGuidanceEnabled\([\s\S]*?getStudyGuidanceEnabled\(\)/
  )
  const liveSource = getFunctionSource(
    'getLiveStudyGuidance',
    'getStudyGuidanceViewModel'
  )
  assert.match(liveSource, /if \(!STUDY_GUIDANCE_ENABLED \|\| !state\) return null/)
  assert.doesNotMatch(liveSource, /weeklyGoal|goalHours|remainingSeconds/)
})

test('live guidance is not recorded in the durable insight archive', () => {
  const source = getFunctionSource(
    'renderStudyInsight',
    'setStudyInsightsCollapsed'
  )
  assert.match(source, /const usingGuidance = Boolean\(guidance\)/)
  assert.match(source, /const currentKey = !usingGuidance && insight && viewModel/)
  assert.match(source, /recordStudyInsight\(state, insight\)/)
  assert.match(source, /history: state\.config\.studyInsights\.history/)
})

test('guidance action is semantic and has no inline handler', () => {
  const match = indexSource.match(
    /<button\b[^>]*id="studyGuidanceNextAction"[^>]*>/
  )
  assert.ok(match)
  assert.match(match[0], /data-study-guidance-action="next-video"/)
  assert.match(match[0], /data-i18n="guidance.nextVideo"/)
  assert.doesNotMatch(match[0], /onclick=/)
})

test('new guidance wording stays simple in every locale', () => {
  const keys = [
    'guidance.extraDay.title',
    'guidance.extraDay.body',
    'guidance.extraDay.evidence',
    'guidance.week.above.title',
    'guidance.week.above.body',
    'guidance.week.below.title',
    'guidance.week.below.body',
    'guidance.week.similar.title',
    'guidance.week.similar.body',
    'guidance.week.evidence',
    'guidance.nextVideo',
    'guidance.nextVideo.unavailable'
  ]
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of keys) {
      const value = I18N[locale][key]
      assert.equal(typeof value, 'string', `${locale}:${key}`)
      assert.ok(value.trim(), `${locale}:${key} is blank`)
      assert.ok(value.length <= 180, `${locale}:${key} is too long`)
    }
  }

  const english = keys.map(key => I18N.en[key]).join(' ').toLowerCase()
  for (const word of ['baseline', 'trajectory', 'optimize', 'deficit', 'goal']) {
    assert.equal(english.includes(word), false, word)
  }
})
