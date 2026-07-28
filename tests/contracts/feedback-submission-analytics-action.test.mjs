import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const formTags = [...source.matchAll(/<form\b[^>]*>/g)].map(match => match[0])
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('feedback form routes submission without inline ownership', () => {
  const forms = formTags.filter(tag => tag.includes('id="feedbackForm"'))
  assert.equal(forms.length, 1)
  assert.equal(
    getAttribute(forms[0], 'data-feedback-submission-action'),
    'submit'
  )
  assert.equal(getAttribute(forms[0], 'onsubmit'), null)
})

test('feedback submit control retains native and analytics identities', () => {
  const controls = buttonTags.filter(tag => (
    tag.includes('id="feedbackSubmitBtn"')
  ))
  assert.equal(controls.length, 1)
  assert.equal(getAttribute(controls[0], 'type'), 'submit')
  assert.equal(
    getAttribute(controls[0], 'data-analytics-action'),
    'feedback_submit'
  )
  assert.match(
    source,
    /<span data-i18n="feedback\.send">Send feedback<\/span>/
  )

  const eventName = 'feedback_submit'
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)
  assert.equal(`${eventName}_clicked`, 'feedback_submit_clicked')
})

test('feedback message and email retain native constraint boundaries', () => {
  assert.match(
    source,
    /<textarea id="feedbackMessage"[^>]*\srequired(?:\s|>)/
  )
  assert.match(
    source,
    /<input id="feedbackEmail"[^>]*\stype="email"(?:\s|>)/
  )
})
