import { initial, story, transition } from './story.js'

// Save the small sequence of decisions, rather than hundreds of copies of the
// notebook. Replaying also validates saved choices against the authored story.
export function replay(actions = []) {
  let state = initial()
  const history = []
  const accepted = []
  for (const action of actions.slice(0, 250)) {
    const scene = story(state)
    if (!scene) break
    if (action === 'next' && state.outcome) {
      history.push(state)
      state = transition(state, { type: 'continue' })
    } else if (Number.isInteger(action) && !state.outcome && scene.choices[action]
      && !scene.choices[action].change?.notebook) {
      history.push(state)
      state = transition(state, { choice: scene.choices[action] })
    } else break
    accepted.push(action)
  }
  return { state, history, actions: accepted }
}

export function restoreSession(saved) {
  const restored = replay(saved?.version === 1 && Array.isArray(saved.actions) ? saved.actions : [])
  return {
    ...restored,
    page: Number.isInteger(saved?.page) ? Math.max(0, Math.min(99, saved.page)) : 0,
    choosing: saved?.choosing === true
  }
}

export function saveSession(session) {
  return { version: 1, actions: [...session.actions], page: session.page, choosing: session.choosing }
}

// Preserve every word and paragraph; pages are only a presentation boundary.
export function readingPages(state) {
  const paragraphs = state.outcome?.text || story(state).text
  const pages = []
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
  for (const paragraph of paragraphs) {
    let page = ''
    for (const { segment } of segmenter.segment(paragraph)) {
      const sentence = segment.trim().replace(/\s+/g, ' ')
      if (sentence.length <= 80) {
        if (page && (page + ' ' + sentence).length > 80) { pages.push(page); page = '' }
        page += (page ? ' ' : '') + sentence
      } else {
        for (const word of sentence.split(' ')) {
          if (page && (page + ' ' + word).length > 80) { pages.push(page); page = '' }
          page += (page ? ' ' : '') + word
        }
      }
    }
    if (page) pages.push(page)
  }
  return pages
}

export function sceneVisual(state) {
  const { scene, first, route } = state
  const part = Number(story(state).step) || 0
  let environment = 'pond'
  if (part >= 19) environment = 'landing'
  else if (part >= 16) environment = 'crossing'
  else if (part >= 10 || scene === 'evening') environment = 'village'
  else if (part >= 6 || ['detour'].includes(scene)) environment = route === 'Garden bank' ? 'garden' : 'lilies'
  else if (['meeting', 's2', 's2bye'].includes(scene)) environment = first === 'Luma' ? 'garden' : 'lilies'
  else if (scene === 's4') environment = 'lilies'

  const family = ['opening', 'willow'].includes(scene)
  const friend = ['meeting', 'bank', 's1', 's2', 's2bye'].includes(scene) ? first
    : scene === 'separation' ? '' : state.companion
  const actors = ['Pip', ...(family ? ['Mama', 'Papa'] : friend ? [friend] : [])]
  if (['s3', 's9'].includes(scene) || scene === 's13' && state.nursery === 'Moved baby frog pool') actors.push('Bram')
  if (['nellNote'].includes(scene) || scene === 's7' && route === 'Garden bank') actors.push('Nell')
  if (environment === 'village') actors.push('Sedge')
  if (environment === 'crossing' && !['recovery', 'warning', 'crossingOthers'].includes(scene)) actors.push('Goose')
  if (environment === 'landing') actors.push('Keeper')
  if (scene === 's6') actors.push(route === 'Garden bank' ? 'Ants' : 'Dragonflies')
  if (scene === 's7' && route !== 'Garden bank') actors.push('Beetle')
  if (['s8', 's8after', 'detour'].includes(scene)) actors.push(route === 'Garden bank' ? 'Resident' : 'Map frog')
  const props = []
  if (['s3', 's9'].includes(scene)) props.push(state.bram === 'Damaged boat' ? 'broken-boat' : scene === 's3' && !state.outcome ? 'upturned-boat' : 'boat')
  if (['s12', 's13', 's14', 's14after', 'evening'].includes(scene)) props.push('nursery')
  if (scene === 's13' && state.nursery === 'Moved baby frog pool') props.push(state.bram === 'Unbroken boat' ? 'boat' : 'cups')
  if (['s10', 's11', 's11home'].includes(scene)) props.push('table')
  if (scene === 's6' && route === 'Garden bank') props.push('bread')
  if (scene === 's7' && route !== 'Garden bank') props.push('marker')
  if (['s8', 's8after', 'detour'].includes(scene)) props.push(route === 'Garden bank' ? 'basket' : 'bottle')
  if (['s20', 'letter', 'reply', 'confirmReply', 'rest', 'nextRoute', 'ending'].includes(scene)) props.push('letter')
  if (scene === 's1' && first === 'Moss' && !state.outcome) props.push('root')
  if (scene === 's2' && first === 'Tumble') props.push('toys')
  if (['s2', 's2bye'].includes(scene) && first === 'Moss') props.push('stones')
  if (scene === 's5') props.push('fork')
  if (environment === 'crossing' && !['warning', 'recovery'].includes(scene)) props.push('sign')
  if (['warning', 'recovery'].includes(scene)) props.push('bars')
  const action = state.outcome ? (state.outcome.title + ' ' + state.outcome.text.join(' ')).toLowerCase() : ''
  const effect = action.includes('cross') || action.includes('across') ? 'cross'
    : action.includes('bram') && scene === 's3' ? 'rescue'
    : /splash|sneeze|bubble|water/.test(action) ? 'splash' : ''
  return { environment, actors: [...new Set(actors)], props, family, effect, scene, part,
    evening: ['evening', 'rest', 'ending'].includes(scene), nursery: state.nursery,
    nurseryDone: state.nurseryDone, nurseryAction: state.nurseryAction, cargo: state.cargo,
    leafHat: family, sent: state.sent, crossed: state.crossed }
}
