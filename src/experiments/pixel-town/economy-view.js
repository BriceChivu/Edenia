import { UPGRADES } from './upgrades.js'
const flower = UPGRADES.find(item => item.id === 'garden-flower-1')

export function mountEconomy(wrap, town) {
  const layer = document.createElement('div')
  layer.className = 'pixel-town-economy'
  layer.innerHTML = `
    <output class="town-wallet" aria-label="Town coins"></output>
    <div class="town-world-targets"><button type="button" class="town-flower-outline" aria-label="First flower patch · 15 coins" hidden>
      <svg viewBox="0 0 60 36" aria-hidden="true"><path d="M3 19 30 5 57 19 30 33Z"/><path d="M20 22v-9m-4 1 4-4 4 4-4 4Zm18 12V13m-4 1 4-4 4 4-4 4Z"/></svg>
    </button></div>
    <div class="town-build-panel" hidden>
      <strong>First flower patch</strong>
      <button type="button" class="town-build-confirm btn-primary">Build · 15 coins</button>
      <button type="button" class="town-build-cancel btn-ghost" aria-label="Cancel flower purchase">Cancel</button>
    </div>
    <span class="town-build-status" role="status"></span>`
  wrap.append(layer)
  const wallet = layer.querySelector('.town-wallet')
  const outline = layer.querySelector('.town-flower-outline')
  const panel = layer.querySelector('.town-build-panel')
  const confirm = layer.querySelector('.town-build-confirm')
  const status = layer.querySelector('.town-build-status')
  let purchase = null
  const refresh = () => {
    const economy = town.economy
    layer.hidden = !economy?.available
    const t = town.translate
    if (!t) return
    wallet.textContent = t('townEconomy.coins', { count: economy?.balance || 0 })
    wallet.setAttribute('aria-label', wallet.textContent)
    outline.setAttribute('aria-label', `${t('townEconomy.flower')} · ${t('townEconomy.coins', { count: flower.cost })}`)
    panel.querySelector('strong').textContent = t('townEconomy.flower')
    confirm.textContent = t('townEconomy.build', { count: flower.cost })
    const cancel = layer.querySelector('.town-build-cancel')
    cancel.textContent = t('townEconomy.cancel')
    cancel.setAttribute('aria-label', t('townEconomy.cancel'))
    outline.hidden = !economy?.available || economy.owned || economy.balance < flower.cost
    if (outline.hidden || purchase !== town.buildFlower) panel.hidden = true
  }
  outline.addEventListener('click', () => {
    purchase = town.buildFlower
    panel.hidden = false
    status.textContent = ''
    confirm.focus({ preventScroll: true })
  })
  layer.querySelector('.town-build-cancel').addEventListener('click', () => {
    panel.hidden = true
    outline.focus({ preventScroll: true })
  })
  layer.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      panel.hidden = true
      outline.focus({ preventScroll: true })
    }
  })
  confirm.addEventListener('click', () => {
    if (confirm.disabled) return
    confirm.disabled = true
    const result = purchase?.()
    panel.hidden = true
    status.textContent = town.translate(`townEconomy.${['purchased', 'owned', 'insufficient'].includes(result) ? result : 'saveFailed'}`)
    confirm.disabled = false
    refresh()
  })
  window.addEventListener('pixel-town-economy', refresh)
  refresh()
  return () => {
    window.removeEventListener('pixel-town-economy', refresh)
    layer.remove()
  }
}
