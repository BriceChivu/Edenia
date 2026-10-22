import {
  chartDateKey, clampHistoryChartRange,
  groupHistoryChartDays, visibleHistoryChartBuckets
} from './chart-data.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const DAY_MS = 86_400_000
const DEFAULT_SPAN = 30
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

function svgElement(name, attrs, parent) {
  const node = document.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, value)
  parent?.append(node)
  return node
}

// Owns its drawing and ephemeral viewport. Pointer events never read/save a
// profile, regroup history, replace the interaction surface, or start a fetch.
export function createHistoryChart(container, { t, locale, formatTime, requestAccess }) {
  const abort = new AbortController()
  const signal = abort.signal
  let data, groups = [], viewport, access
  const unit = 'day'
  let mode = 'bar', frame = 0, inertia = 0, hover = null, gesture = null
  let visible = { video: true, anki: true }
  let width = 0, geometry, buckets = [], yMaximum = 10
  const pointers = new Map()
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const labels = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
  const tickLabels = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', day: 'numeric' })
  const monthLabels = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', year: 'numeric' })
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const date = day => labels.format(new Date(Math.floor(day) * DAY_MS))
  const text = (selector, value) => { container.querySelector(selector).textContent = value }
  const button = (key, value, label) => {
    const node = document.createElement('button')
    node.type = 'button'
    node.dataset[key] = value
    node.textContent = label
    return node
  }
  // All translated copy is textContent; study data never becomes HTML.
  container.innerHTML = `<div class="history-chart-heading"><span class="history-chart-range" aria-live="polite"></span><div class="history-chart-heading-controls"><div class="history-chart-segment" data-chart-modes></div><div class="history-chart-legend"></div></div></div>
    <div class="history-chart-plot" tabindex="0"><svg class="history-chart-svg" role="img"></svg><div class="history-chart-tooltip" role="tooltip" hidden></div></div>
    <div class="history-chart-summary"><span class="history-chart-span"></span><div class="history-chart-detail" aria-live="polite"></div></div>
    <button type="button" class="history-chart-access hidden"></button>`
  container.setAttribute('aria-label', t('history.chart.title'))
  const modeControls = container.querySelector('[data-chart-modes]')
  modeControls.setAttribute('role', 'group')
  modeControls.setAttribute('aria-label', t('history.chart.display'))
  for (const name of ['bar', 'line']) {
    const node = button('chartMode', name, '')
    node.setAttribute('aria-label', t(`history.chart.${name}`))
    node.title = t(`history.chart.${name}`)
    const icon = svgElement('svg', { viewBox: '0 0 24 24', width: 23, height: 23, 'aria-hidden': 'true' }, node)
    if (name === 'bar') {
      for (const [x, y, h] of [[3, 12, 9], [10, 3, 18], [17, 8, 13]]) {
        svgElement('rect', { x, y, width: 4, height: h, rx: 1, fill: 'currentColor' }, icon)
      }
    } else {
      svgElement('path', { d: 'M3 18L9 11L14 14L21 5', fill: 'none', stroke: 'currentColor', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, icon)
    }
    modeControls.append(node)
  }
  const legend = container.querySelector('.history-chart-legend')
  for (const key of ['video', 'anki']) {
    const node = button('chartSeries', key, '')
    const swatch = document.createElement('span')
    swatch.className = `history-chart-swatch history-chart-${key}`
    swatch.setAttribute('aria-hidden', 'true')
    node.append(swatch, document.createTextNode(t(`history.chart.${key}`)))
    legend.append(node)
  }
  const plot = container.querySelector('.history-chart-plot')
  const svg = container.querySelector('.history-chart-svg')
  const tooltip = container.querySelector('.history-chart-tooltip')
  const accessButton = container.querySelector('.history-chart-access')
  accessButton.addEventListener('click', () => requestAccess(access.state), { signal })
  svg.setAttribute('aria-label', t('history.chart.description'))
  svgElement('desc', {}, svg).textContent = t('history.chart.description')
  const grid = svgElement('g', {}, svg)
  const marks = svgElement('g', {}, svg)
  const videoPath = svgElement('path', { class: 'history-chart-video-marks', 'data-chart-series': 'video' }, marks)
  const ankiPath = svgElement('path', { class: 'history-chart-anki-marks', 'data-chart-series': 'anki' }, marks)
  const axes = svgElement('g', {}, svg)
  const timeAxis = svgElement('rect', { fill: 'transparent', 'data-chart-axis': '', class: 'history-chart-axis-drag' }, svg)
  const guide = svgElement('line', { class: 'history-chart-guide', visibility: 'hidden' }, svg)
  const markers = ['video', 'anki'].map(key => svgElement('circle', { r: 4, class: `history-chart-${key}-dot`, visibility: 'hidden' }, svg))

  function queue() {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw() })
  }
  function stopInertia() { cancelAnimationFrame(inertia); inertia = 0 }
  function setRange(start, end) {
    viewport = clampHistoryChartRange(start, end, data)
    hover = null
    queue()
  }
  function zoom(factor, anchor = .5) {
    const span = viewport.end - viewport.start
    const next = clamp(span * factor, 3, data.end - data.start)
    const at = viewport.start + span * anchor
    setRange(at - next * anchor, at + next * (1 - anchor))
  }
  function position(event, element = plot) {
    const rect = element.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  function cancelGesture() {
    pointers.clear()
    gesture = null
    stopInertia()
    plot.classList.remove('is-dragging')
  }
  container.addEventListener('click', event => {
    const control = event.target.closest('button')
    if (!control || !data) return
    stopInertia()
    if (control.dataset.chartMode) {
      mode = control.dataset.chartMode
      queue()
    } else if (control.dataset.chartSeries) {
      const key = control.dataset.chartSeries
      visible[key] = !visible[key]
      queue()
    }
  }, { signal })

  plot.addEventListener('pointerdown', event => {
    if (!data || !geometry || event.button !== 0) return
    // Native SVG dragging in WebKit can steal the remaining pointer stream.
    if (event.pointerType === 'mouse') event.preventDefault()
    stopInertia()
    const point = position(event)
    pointers.set(event.pointerId, point)
    plot.setPointerCapture(event.pointerId)
    hover = null
    plot.classList.add('is-dragging')
    if (pointers.size === 1) {
      gesture = { kind: event.target.closest('[data-chart-axis]') ? 'axis' : 'pan',
        origin: point, range: { ...viewport }, previous: point, time: performance.now(), velocity: 0, moved: 0 }
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      const fraction = clamp(((a.x + b.x) / 2 - geometry.left) / geometry.innerWidth, 0, 1)
      gesture = { kind: 'pinch', distance: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
        span: viewport.end - viewport.start, anchor: viewport.start + fraction * (viewport.end - viewport.start) }
    }
  }, { signal })
  plot.addEventListener('pointermove', event => {
    if (!data || !geometry) return
    const point = position(event)
    if (!pointers.has(event.pointerId)) {
      if (event.pointerType !== 'touch') { hover = point; queue() }
      return
    }
    pointers.set(event.pointerId, point)
    if (gesture?.kind === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      const distance = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y))
      const span = clamp(gesture.span * gesture.distance / distance, 3, data.end - data.start)
      const fraction = clamp(((a.x + b.x) / 2 - geometry.left) / geometry.innerWidth, 0, 1)
      setRange(gesture.anchor - fraction * span, gesture.anchor + (1 - fraction) * span)
    } else if (gesture?.kind === 'axis') {
      const span = clamp((gesture.range.end - gesture.range.start) * Math.exp(-(point.x - gesture.origin.x) / 180), 3, data.end - data.start)
      setRange(gesture.range.end - span, gesture.range.end)
    } else if (gesture?.kind === 'pan') {
      const span = gesture.range.end - gesture.range.start
      const delta = (point.x - gesture.origin.x) / geometry.innerWidth * span
      const now = performance.now()
      gesture.velocity = -(point.x - gesture.previous.x) / geometry.innerWidth * span / Math.max(8, now - gesture.time)
      gesture.time = now
      gesture.previous = point
      gesture.moved = Math.max(gesture.moved, Math.abs(point.x - gesture.origin.x))
      setRange(gesture.range.start - delta, gesture.range.end - delta)
    }
  }, { signal })
  function releasePointer(event, cancelled = false) {
    if (!pointers.has(event.pointerId)) return
    pointers.delete(event.pointerId)
    const ended = gesture
    const recent = ended && performance.now() - ended.time < 90
    gesture = null
    pointers.clear()
    plot.classList.remove('is-dragging')
    if (!cancelled && ended?.kind === 'pan' && ended.moved < 5) {
      hover = position(event)
      queue()
    } else if (!cancelled && event.pointerType === 'touch' && ended?.kind === 'pan' && recent && !reducedMotion.matches) {
      let velocity = ended.velocity, previousTime = performance.now()
      function coast(now) {
        const dt = Math.min(32, now - previousTime)
        previousTime = now
        velocity *= Math.exp(-dt / 110)
        const before = viewport.start
        setRange(viewport.start + velocity * dt, viewport.end + velocity * dt)
        if (Math.abs(velocity) > (viewport.end - viewport.start) / 20000 && Math.abs(viewport.start - before) > .0001) inertia = requestAnimationFrame(coast)
        else inertia = 0
      }
      inertia = requestAnimationFrame(coast)
    }
  }
  plot.addEventListener('pointerup', event => releasePointer(event), { signal })
  plot.addEventListener('pointercancel', event => releasePointer(event, true), { signal })
  plot.addEventListener('lostpointercapture', event => releasePointer(event, true), { signal })
  plot.addEventListener('pointerleave', event => {
    // Touch sends pointerleave immediately after pointerup; retain the tapped day.
    if (!gesture && event.pointerType !== 'touch') { hover = null; queue() }
  }, { signal })
  plot.addEventListener('wheel', event => {
    if (!data || !geometry) return
    event.preventDefault()
    stopInertia()
    const point = position(event)
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? geometry.height : 1
    const anchor = clamp((point.x - geometry.left) / geometry.innerWidth, 0, 1)
    if (!event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      const delta = event.deltaX * multiplier / geometry.innerWidth * (viewport.end - viewport.start)
      setRange(viewport.start + delta, viewport.end + delta)
    } else zoom(Math.exp(clamp(event.deltaY * multiplier, -160, 160) * (event.ctrlKey ? .008 : .003)), anchor)
  }, { signal, passive: false })

  // Keep pan/zoom available to keyboard users after removing the navigator.
  plot.addEventListener('keydown', event => {
    if (!data) return
    const span = viewport.end - viewport.start
    const amount = event.shiftKey ? 7 : 1
    if (!['ArrowLeft', 'ArrowRight', '+', '=', '-', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    stopInertia()
    if (event.key === 'Home') setRange(data.start, data.start + span)
    else if (event.key === 'End') setRange(data.end - span, data.end)
    else if (event.key === '+' || event.key === '=') zoom(.8)
    else if (event.key === '-') zoom(1.25)
    else {
      const delta = event.key === 'ArrowLeft' ? -amount : amount
      setRange(viewport.start + delta, viewport.end + delta)
    }
  }, { signal })
  const observer = new ResizeObserver(() => queue())
  observer.observe(plot)

  function draw() {
    if (!data || container.classList.contains('hidden')) return
    width = plot.clientWidth
    if (width < 10) return
    const height = plot.clientHeight, left = 0, right = width - 13, top = 24, bottom = height - 47
    geometry = { width, height, left, right, top, bottom, innerWidth: right - left }
    const span = viewport.end - viewport.start
    const x = day => left + (day - viewport.start) / span * (right - left)
    buckets = visibleHistoryChartBuckets(groups, data, viewport.start, viewport.end)
    const series = ['video', 'anki'].filter(key => visible[key])
    let peak = 1
    for (const row of buckets) for (const key of series) peak = Math.max(peak, row[key])
    const step = 10 ** Math.floor(Math.log10(peak / 4))
    const niceStep = [1, 2, 5, 10].map(n => n * step).find(n => n >= peak / 4)
    yMaximum = Math.ceil(peak / niceStep) * niceStep
    const y = value => bottom - value / yMaximum * (bottom - top)
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    grid.replaceChildren()
    for (let value = 0; value <= yMaximum + niceStep / 2; value += niceStep) {
      svgElement('line', { x1: left, x2: right, y1: y(value), y2: y(value), class: 'history-chart-grid-line' }, grid)
    }
    axes.replaceChildren()
    const tickCount = width < 380 ? 3 : width < 600 ? 4 : 6
    const lastTick = { right: -Infinity, label: null }
    for (let i = 0; i < tickCount; i++) {
      const day = viewport.start + span * (i + .35) / tickCount
      const label = span > 730 ? String(new Date(day * DAY_MS).getUTCFullYear())
        : span > 120 ? monthLabels.format(new Date(day * DAY_MS)) : tickLabels.format(new Date(day * DAY_MS))
      if (label === lastTick.label) continue
      const node = svgElement('text', { class: 'history-chart-time-tick', x: x(day), y: bottom + 20, 'text-anchor': 'middle' }, axes)
      node.textContent = label
      const box = node.getBBox()
      if (box.x < left || box.x + box.width > right || box.x < lastTick.right + 6) node.remove()
      else { lastTick.right = box.x + box.width; lastTick.label = label }
    }
    timeAxis.setAttribute('x', left)
    timeAxis.setAttribute('y', bottom + 1)
    timeAxis.setAttribute('width', right - left)
    timeAxis.setAttribute('height', height - bottom - 1)
    for (const [key, node] of [['video', videoPath], ['anki', ankiPath]]) {
      const index = series.indexOf(key)
      let path = ''
      if (index >= 0 && mode === 'bar') {
        for (const row of buckets) {
          const { bx, w } = barGeometry(row, index, series.length, x)
          const h = bottom - y(row[key])
          path += `M${bx.toFixed(2)},${bottom}v${(-h).toFixed(2)}h${w.toFixed(2)}v${h.toFixed(2)}Z`
        }
      } else if (index >= 0) {
        path = buckets.map((row, i) => `${i ? 'L' : 'M'}${clamp(x((row.start + row.end) / 2), left, right).toFixed(2)},${y(row[key]).toFixed(2)}`).join('')
        if (buckets.length === 1) {
          const row = buckets[0], center = clamp(x((row.start + row.end) / 2), left + 3, right - 3)
          path = `M${center - 3},${y(row[key])}h6`
        }
      }
      node.setAttribute('d', path)
      node.setAttribute('data-chart-mode', mode)
    }
    text('.history-chart-range', `${date(viewport.start)} – ${date(Math.ceil(viewport.end) - 1)}`)
    text('.history-chart-span', t('history.chart.visibleDays', { count: Math.ceil(viewport.end) - Math.floor(viewport.start) }))
    container.dataset.chartStart = chartDateKey(viewport.start)
    container.dataset.chartEnd = chartDateKey(Math.ceil(viewport.end) - 1)
    container.dataset.chartSpan = String(span)
    container.dataset.chartUnit = unit
    container.dataset.chartMode = mode
    container.querySelectorAll('button[data-chart-mode]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.chartMode === mode)))
    container.querySelectorAll('[data-chart-series]').forEach(node => {
      if (node.tagName === 'BUTTON') node.setAttribute('aria-pressed', String(visible[node.dataset.chartSeries]))
    })
    drawDetail(x, y)
  }
  function barGeometry(row, index, seriesCount, x) {
    const a = clamp(x(row.start), geometry.left, geometry.right)
    const b = clamp(x(row.end), geometry.left, geometry.right)
    const bw = (b - a) * .76 / seriesCount
    return { bx: a + (b - a) * .12 + index * bw, w: Math.max(.4, bw - Math.min(1.3, bw * .15)) }
  }
  function drawDetail(x, y) {
    const inside = hover && hover.x >= geometry.left && hover.x <= geometry.right && hover.y <= geometry.bottom && hover.y >= geometry.top
    let row = null
    if (inside) {
      const day = viewport.start + (hover.x - geometry.left) / geometry.innerWidth * (viewport.end - viewport.start)
      row = buckets.find(item => item.start <= day && item.end > day)
    }
    const totals = row || buckets.reduce((acc, item) => ({ video: acc.video + item.video, anki: acc.anki + item.anki }), { video: 0, anki: 0 })
    const summary = [t('history.chart.videoValue', { count: number.format(totals.video) }), t('history.chart.ankiValue', { count: number.format(totals.anki) })]
    const detail = container.querySelector('.history-chart-detail')
    // Hover is intentionally not a live-region announcement on every frame.
    detail.setAttribute('aria-live', row || gesture || inertia ? 'off' : 'polite')
    detail.textContent = row ? `${date(row.clipStart)} · ${summary.join(' · ')} · ${formatTime(row.seconds)} · ${t('history.chart.reviews', { count: number.format(row.reviews) })}`
      : `${t('history.chart.visibleXP')} · ${summary.join(' · ')}`
    if (!row) {
      tooltip.hidden = true
      guide.setAttribute('visibility', 'hidden')
      markers.forEach(node => node.setAttribute('visibility', 'hidden'))
      return
    }
    const center = clamp(x((row.start + row.end) / 2), geometry.left, geometry.right)
    guide.setAttribute('x1', center)
    guide.setAttribute('x2', center)
    guide.setAttribute('y1', geometry.top)
    guide.setAttribute('y2', geometry.bottom)
    guide.setAttribute('visibility', 'visible')
    markers.forEach((node, i) => {
      const key = i ? 'anki' : 'video'
      const series = ['video', 'anki'].filter(key => visible[key])
      const bar = mode === 'bar' && visible[key] ? barGeometry(row, series.indexOf(key), series.length, x) : null
      node.setAttribute('cx', bar ? bar.bx + bar.w / 2 : center)
      node.setAttribute('cy', y(row[key]))
      node.setAttribute('visibility', visible[key] ? 'visible' : 'hidden')
    })
    tooltip.replaceChildren()
    const title = document.createElement('strong')
    title.textContent = row.clipEnd - row.clipStart === 1 ? date(row.clipStart) : `${date(row.clipStart)} – ${date(row.clipEnd - 1)}`
    tooltip.append(title)
    for (const [i, key] of ['video', 'anki'].entries()) {
      if (!visible[key]) continue
      const line = document.createElement('div')
      line.textContent = summary[i]
      tooltip.append(line)
    }
    if (!row.hasExperience && (row.seconds || row.reviews)) {
      const note = document.createElement('div')
      note.textContent = t('history.chart.legacy')
      tooltip.append(note)
    }
    tooltip.hidden = false
    tooltip.style.left = `${clamp(hover.x + 12, 0, width - tooltip.offsetWidth)}px`
    tooltip.style.top = `${clamp(hover.y - tooltip.offsetHeight - 8, 0, geometry.bottom - tooltip.offsetHeight)}px`
  }
  return {
    update(nextData, nextAccess) {
      const wasLatest = !data || viewport.end >= data.end - .01
      const priorSpan = viewport ? viewport.end - viewport.start : DEFAULT_SPAN
      if (!data || data.start !== nextData.start || data.end !== nextData.end || access?.state !== nextAccess.state) cancelGesture()
      data = nextData
      access = nextAccess
      groups = groupHistoryChartDays(data.days, unit)
      if (!viewport || wasLatest) viewport = clampHistoryChartRange(data.end - priorSpan, data.end, data)
      else viewport = clampHistoryChartRange(viewport.start, viewport.end, data)
      accessButton.classList.toggle('hidden', access.state === 'available')
      accessButton.textContent = t(access.state === 'loading' ? 'plus.history.loading.title'
        : access.state === 'unavailable' ? 'plus.history.unavailable.title' : 'history.chart.fullHistory')
      queue()
    },
    suspend() { cancelGesture(); hover = null; tooltip.hidden = true; cancelAnimationFrame(frame); frame = 0 },
    destroy() { cancelGesture(); cancelAnimationFrame(frame); observer.disconnect(); abort.abort(); container.replaceChildren() }
  }
}
