import './story.css'
import { story } from './story.js'
import { readingPages, restoreSession, saveSession, sceneVisual } from './session.js'
import { createSceneRenderer } from './renderer.js'
export { createBrowserStoryStore } from './persistence.js'

const el = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
function button(label, className, action) {
  const node = el('button', className, label)
  node.type = 'button'; node.addEventListener('click', action)
  return node
}

export function createPipStory({ host, read, write }) {
  let session = restoreSession(read())
  let lastSaved = JSON.stringify(read() || null)
  let overlay = ''
  let saveFailed = false
  const root = el('section', 'pip-story')
  root.setAttribute('aria-label', 'Pip — Just One Little Look')
  root.lang = 'en'
  const canvas = el('canvas')
  canvas.setAttribute('role', 'img')
  const renderer = createSceneRenderer(canvas)
  const top = el('div', 'pip-top')
  const place = el('div', 'pip-place')
  const tools = el('div', 'pip-tools')
  const back = button('← Back', 'pip-tool', goBack)
  back.setAttribute('aria-label', 'Back in Pip’s story')
  const notebook = button('Notebook', 'pip-tool', () => { overlay = overlay ? '' : 'notebook'; render(true) })
  tools.append(back, notebook); top.append(place, tools)
  const dialogue = el('div', 'pip-dialogue')
  dialogue.setAttribute('aria-live', 'polite')
  root.append(canvas, top, dialogue)
  host.classList.add('pip-story-host')
  host.append(root)

  function persist() {
    const snapshot = saveSession(session)
    try { saveFailed = write(snapshot) !== true } catch { saveFailed = true }
    if (!saveFailed) lastSaved = JSON.stringify(snapshot)
  }
  function move(action) {
    session = restoreSession({ version: 1, actions: [...session.actions, action] })
    persist(); render(true)
  }
  function advance() {
    const pages = readingPages(session.state)
    if (session.page < pages.length - 1) session.page++
    else if (session.state.outcome) { move('next'); return }
    else session.choosing = true
    persist(); render(true)
  }
  function goBack() {
    if (overlay) { overlay = ''; render(true); return }
    if (session.choosing) session.choosing = false
    else if (session.page > 0) session.page--
    else if (session.actions.length) {
      session = restoreSession({ version: 1, actions: session.actions.slice(0, -1) })
      session.page = readingPages(session.state).length - 1
      session.choosing = !session.state.outcome
    }
    persist(); render(true)
  }
  function renderNotebook() {
    const s = session.state
    const body = el('div', 'pip-notebook')
    const fields = [
      ['Destination', 'The big willow tree, farther along the river'],
      ['First friend', s.first || 'Not met yet'],
      ['How they met', s.openingReply || 'Not met yet'],
      ['Traveling with', ['opening', 'willow'].includes(s.scene) ? 'Mama and Papa' : s.companion || (['meeting', 'bank', 's1', 's2', 's2bye'].includes(s.scene) ? s.first + ' is nearby' : 'Pip is traveling by herself')],
      ['How they travel', s.arrangement || 'Finding a way onward'],
      ['Route', s.route || 'Not chosen yet'], ['Pip’s things', s.suppliesScattered ? 'Spread along the edge; helpers will find them' : s.items.join(' · ') || 'Nothing yet'],
      ['What Pip learned', s.knowledge.join(' · ') || 'Nothing yet'],
      ['Friends', s.friendships.join(' · ') || 'Not met yet'],
      ['Bram’s rescue', [s.bram, s.cargo].filter(Boolean).join(' · ') || 'Not met yet'],
      ['Baby frog pool', [s.nursery, s.nurseryAction, s.nurseryDetail].filter(Boolean).join(' · ') || 'Not reached yet'],
      ['Pip’s help', s.nurseryRole || 'Not chosen yet'],
      ['Crossing', [s.approach, s.plan, s.crossed ? 'Crossed safely' : 'Not crossed yet'].filter(Boolean).join(' · ')],
      ['The goose', s.goose || 'Not met yet'], ['Promises', s.promises.join(' · ') || 'None'],
      ['The fast water', s.riskTaken ? s.suppliesScattered ? 'Safe and resting' : 'Safe; will not try again' : 'Not tried'],
      ['A helpful note', s.introduction || 'No note yet'],
      ['Memories', s.memories.join(' · ') || 'None'], ['Parents’ note', s.reading || 'Not received yet'],
      ['Pip’s note', s.reply ? (s.sent ? 'Sent: ' : 'Draft: ') + s.reply : 'Not written yet'],
      ['Resting place', s.rest || 'Not chosen yet'], ['Next journey', s.nextRoute || 'Not chosen yet']
    ]
    const dl = el('dl')
    fields.forEach(([key, value]) => dl.append(el('dt', '', key), el('dd', '', value)))
    body.append(dl, el('h3', '', 'The trip so far'))
    const journal = el('ol')
    s.journal.forEach(entry => journal.append(el('li', '', entry)))
    body.append(journal, button('Restart story', 'pip-tool', () => { overlay = 'restart'; render(true) }))
    return body
  }
  function render(focus = false) {
    const s = session.state, scene = story(s), pages = readingPages(s)
    session.page = Math.min(session.page, pages.length - 1)
    root.dataset.scene = s.scene
    root.dataset.outcome = String(Boolean(s.outcome))
    root.dataset.mode = overlay || (session.choosing ? 'choices' : 'reading')
    const visual = sceneVisual(s)
    if (!s.outcome && /splash|ACHOO/.test(pages[session.page])) visual.effect = 'splash'
    canvas.setAttribute('aria-label', `${scene.area}. ${visual.actors.join(', ')}. ${scene.title}.`)
    place.textContent = scene.area
    notebook.textContent = overlay ? 'Close ×' : 'Notebook'
    notebook.setAttribute('aria-expanded', String(Boolean(overlay)))
    back.disabled = !overlay && !session.page && !session.choosing && !session.actions.length
    dialogue.replaceChildren()
    const heading = el('h2', 'pip-heading', overlay === 'notebook' ? 'Pip’s notebook' : overlay === 'restart' ? 'Start a new adventure?' : s.outcome?.title || scene.title)
    dialogue.append(heading)
    let primary
    if (overlay === 'notebook') {
      dialogue.append(renderNotebook())
    } else if (overlay === 'restart') {
      dialogue.append(el('p', 'pip-copy', 'Start Chapter 1 again? This replaces only Pip’s story in this browser.'))
      const actions = el('div', 'pip-choices')
      actions.append(button('Keep my story', 'pip-choice', () => { overlay = 'notebook'; render(true) }),
        button('Start again', 'pip-choice', () => { session = restoreSession(); overlay = ''; persist(); render(true) }))
      dialogue.append(actions)
    } else if (session.choosing && !s.outcome) {
      heading.textContent = s.scene === 'ending' ? 'Safe for tonight · Chapter complete' : 'What will Pip do?'
      const choices = el('div', 'pip-choices')
      scene.choices.forEach((choice, index) => {
        const b = button(choice.label, 'pip-choice', () => {
          if (choice.change?.notebook) { overlay = 'notebook'; render(true) }
          else move(index)
        })
        if (choice.risk) b.dataset.risk = 'true'
        choices.append(b)
      })
      dialogue.append(choices)
      primary = choices.firstElementChild
    } else {
      const copy = el('p', 'pip-copy', pages[session.page])
      copy.tabIndex = -1
      dialogue.append(copy)
      const footer = el('footer')
      const progress = scene.step === 0 ? 'Chapter 1' : scene.step === 'Optional' ? 'A little detour' : `Part ${scene.step} / 20`
      const position = el('span', 'pip-position', `${progress} · ${session.page + 1} / ${pages.length}`)
      const label = session.page < pages.length - 1 ? 'Next →' : s.outcome ? 'Continue →' : s.scene === 'ending' ? 'Finish →' : 'Choose →'
      primary = button(label, 'pip-next', advance)
      footer.append(position, primary); dialogue.append(footer)
    }
    if (saveFailed) dialogue.append(el('small', 'pip-save-error', 'Couldn’t save here. Keep this page open to continue.'))
    renderer.show(visual)
    renderer.refresh()
    if (focus) (primary || notebook).focus({ preventScroll: true })
  }
  render()
  return {
    update(saved) {
      const signature = JSON.stringify(saved || null)
      if (signature === lastSaved) return
      lastSaved = signature; session = restoreSession(saved); overlay = ''; saveFailed = false; render()
    },
    destroy() { renderer.destroy(); root.remove(); host.classList.remove('pip-story-host') }
  }
}
