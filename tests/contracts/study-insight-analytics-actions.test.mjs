import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])

function findButton(fragment) {
  const matches = buttonTags.filter(tag => tag.includes(fragment))
  assert.equal(matches.length, 1, `Expected one Study Insight control for ${fragment}`)
  return matches[0]
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('Study Insight controls retain explicit analytics identities without inline handlers', () => {
  const controls = [
    {
      tag: findButton('id="studyInsightCurrentTab"'),
      action: 'insights.tab.current'
    },
    {
      tag: findButton('id="studyInsightPreviousTab"'),
      action: 'insights.tab.previous'
    },
    {
      tag: findButton('class="study-insight-collapse"'),
      action: 'insights.collapse'
    },
    {
      tag: findButton('id="studyInsightReopen"'),
      action: 'insights.reopen'
    },
    {
      tag: findButton('id="studyGuidanceNextAction"'),
      action: 'insights.guidance.next-video'
    }
  ]

  for (const control of controls) {
    assert.equal(getAttribute(control.tag, 'data-analytics-action'), control.action)
    assert.equal(getAttribute(control.tag, 'onclick'), null)
  }
})

test('Study Insight action names normalize to the exact existing click events', () => {
  const normalize = value => String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)

  assert.deepEqual(
    [
      'insights.tab.current',
      'insights.tab.previous',
      'insights.collapse',
      'insights.reopen',
      'insights.guidance.next-video'
    ].map(action => `${normalize(action)}_clicked`),
    [
      'insights_tab_current_clicked',
      'insights_tab_previous_clicked',
      'insights_collapse_clicked',
      'insights_reopen_clicked',
      'insights_guidance_next_video_clicked'
    ]
  )
})
