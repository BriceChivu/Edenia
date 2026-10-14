import {
  HISTORY_CHART_UNITS, chartDateKey, clampHistoryChartRange,
  groupHistoryChartDays, visibleHistoryChartBuckets
} from './chart-data.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const DAY_MS = 86_400_000
const spans = { day: 30, week: 91, month: 365, year: 1461 }
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
  let data, groups = [], viewport, overviewBounds, lockedOverview, access
  let unit = 'day', mode = 'bar', frame = 0, inertia = 0, hover = null, gesture = null
  let visible = { video: true, anki: true }
  let width = 0, geometry, buckets = [], yMaximum = 10
  const pointers = new Map()
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const labels = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
  const tickLabels = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', day: 'numeric' })
  const monthLabels = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', year: 'numeric' })
  const overviewLabels = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short' })
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const axisNumber = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })
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
  container.innerHTML = `<div class="history-chart-controls"><div class="history-chart-segment" data-chart-units></div><div class="history-chart-segment" data-chart-modes></div></div>
    <div class="history-chart-heading"><span class="history-chart-range" aria-live="polite"></span><div class="history-chart-legend"></div></div>
    <div class="history-chart-plot"><svg class="history-chart-svg" role="img"></svg><div class="history-chart-tooltip" role="tooltip" hidden></div></div>
    <div class="history-chart-detail" aria-live="polite"></div>
    <div class="history-chart-overview"><svg role="img"></svg></div>
    <div class="history-chart-footer"><span class="history-chart-span"></span><div class="history-chart-navigation"></div></div>
    <button type="button" class="history-chart-access hidden"></button>`
  container.setAttribute('aria-label', t('history.chart.title'))
  const unitControls = container.querySelector('[data-chart-units]')
  unitControls.setAttribute('role', 'group')
  unitControls.setAttribute('aria-label', t('history.chart.groupBy'))
  for (const name of HISTORY_CHART_UNITS) unitControls.append(button('chartUnit', name, t(`history.chart.${name}`)))
  const modeControls = container.querySelector('[data-chart-modes]')
  modeControls.setAttribute('role', 'group')
  modeControls.setAttribute('aria-label', t('history.chart.display'))
  for (const name of ['bar', 'line']) modeControls.append(button('chartMode', name, t(`history.chart.${name}`)))
  const legend = container.querySelector('.history-chart-legend')
  for (const key of ['video', 'anki']) {
    const node = button('chartSeries', key, '')
    const swatch = document.createElement('span')
    swatch.className = `history-chart-swatch history-chart-${key}`
    swatch.setAttribute('aria-hidden', 'true')
    node.append(swatch, document.createTextNode(t(`history.chart.${key}`)))
    legend.append(node)
  }
  const nav = container.querySelector('.history-chart-navigation')
  for (const [key, label] of [['out', '−'], ['in', '+'], ['latest', t('history.chart.latest')]]) {
    const node = button('chartZoom', key, label)
    node.setAttribute('aria-label', t(`history.chart.${key === 'latest' ? 'latestLabel' : key}`))
    nav.append(node)
  }
  const plot = container.querySelector('.history-chart-plot')
  const svg = container.querySelector('.history-chart-svg')
  const tooltip = container.querySelector('.history-chart-tooltip')
  const overview = container.querySelector('.history-chart-overview')
  const overviewSvg = overview.querySelector('svg')
  const accessButton = container.querySelector('.history-chart-access')
  accessButton.addEventListener('click', () => requestAccess(access.state), { signal })
  svgElement('title', {}, svg).textContent = t('history.chart.description')
  const grid = svgElement('g', {}, svg)
  const marks = svgElement('g', {}, svg)
  const videoPath = svgElement('path', { class: 'history-chart-video-marks', 'data-chart-series': 'video' }, marks)
  const ankiPath = svgElement('path', { class: 'history-chart-anki-marks', 'data-chart-series': 'anki' }, marks)
  const axes = svgElement('g', {}, svg)
  const timeAxis = svgElement('rect', { fill: 'transparent', 'data-chart-axis': '', class: 'history-chart-axis-drag' }, svg)
  const guide = svgElement('line', { class: 'history-chart-guide', visibility: 'hidden' }, svg)
  const markers = ['video', 'anki'].map(key => svgElement('circle', { r: 4, class: `history-chart-${key}-dot`, visibility: 'hidden' }, svg))
  let overviewDrag = null

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
    overviewDrag = null
    lockedOverview = null
    stopInertia()
    plot.classList.remove('is-dragging')
  }
  container.addEventListener('click', event => {
    const control = event.target.closest('button')
    if (!control || !data) return
    stopInertia()
    if (control.dataset.chartUnit) {
      unit = control.dataset.chartUnit
      groups = groupHistoryChartDays(data.days, unit)
      setRange(viewport.end - spans[unit], viewport.end)
    } else if (control.dataset.chartMode) {
      mode = control.dataset.chartMode
      queue()
    } else if (control.dataset.chartSeries) {
      const key = control.dataset.chartSeries
      visible[key] = !visible[key]
      queue()
    } else if (control.dataset.chartZoom === 'latest') {
      setRange(data.end - (viewport.end - viewport.start), data.end)
    } else if (control.dataset.chartZoom) {
      zoom(control.dataset.chartZoom === 'in' ? .7 : 1 / .7)
    }
  }, { signal })

  plot.addEventListener('pointerdown', event => {
    if (!data || !geometry || event.button !== 0 || overviewDrag) return
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
  plot.addEventListener('pointerleave', () => { if (!gesture) { hover = null; queue() } }, { signal })
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

  const overviewFraction = event => {
    const point = position(event, overview)
    return clamp((point.x - 12) / Math.max(1, overview.clientWidth - 24), 0, 1)
  }
  overview.addEventListener('pointerdown', event => {
    if (!data || !overviewBounds || event.button !== 0) return
    cancelGesture()
    const fraction = overviewFraction(event)
    const span = overviewBounds.end - overviewBounds.start
    const start = (viewport.start - overviewBounds.start) / span
    const end = (viewport.end - overviewBounds.start) / span
    const threshold = (event.pointerType === 'touch' ? 24 : 16) / (overview.clientWidth - 24)
    const edge = Math.min(Math.abs(fraction - start), Math.abs(fraction - end)) <= threshold
      ? Math.abs(fraction - start) < Math.abs(fraction - end) ? 'start' : 'end' : 'pan'
    lockedOverview = { ...overviewBounds }
    if (edge === 'pan' && (fraction < start || fraction > end)) {
      const range = viewport.end - viewport.start
      setRange(overviewBounds.start + span * fraction - range / 2, overviewBounds.start + span * fraction + range / 2)
    }
    overviewDrag = { fraction, span, edge, range: { ...viewport } }
    overview.setPointerCapture(event.pointerId)
  }, { signal })
  overview.addEventListener('pointermove', event => {
    if (!overviewDrag) return
    const delta = (overviewFraction(event) - overviewDrag.fraction) * overviewDrag.span
    const { range, edge } = overviewDrag
    if (edge === 'start') setRange(Math.min(range.start + delta, range.end - 3), range.end)
    else if (edge === 'end') setRange(range.start, Math.max(range.end + delta, range.start + 3))
    else setRange(range.start + delta, range.end + delta)
  }, { signal })
  function releaseOverview() { overviewDrag = null; lockedOverview = null; queue() }
  overview.addEventListener('pointerup', releaseOverview, { signal })
  overview.addEventListener('pointercancel', releaseOverview, { signal })
  overview.addEventListener('lostpointercapture', releaseOverview, { signal })
  overview.addEventListener('keydown', event => {
    const edge = event.target.dataset.chartEdge
    if (!edge || !data) return
    const amount = event.shiftKey ? 7 : 1
    const delta = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : null
    if (delta === null) return
    event.preventDefault()
    stopInertia()
    if (edge === 'start') setRange(Math.min(viewport.start + delta, viewport.end - 3), viewport.end)
    else setRange(viewport.start, Math.max(viewport.end + delta, viewport.start + 3))
  }, { signal })
  const observer = new ResizeObserver(() => queue())
  observer.observe(plot)

  const overviewArea = svgElement('path', { class: 'history-chart-overview-area' }, overviewSvg)
  const selection = svgElement('rect', { class: 'history-chart-selection', rx: 5 }, overviewSvg)
  const handles = ['start', 'end'].map(edge => {
    const node = svgElement('g', { role: 'slider', tabindex: 0, 'data-chart-edge': edge,
      'aria-label': t(`history.chart.${edge}Date`) }, overviewSvg)
    svgElement('rect', { class: 'history-chart-handle-hit', width: 44, height: 48, y: 0 }, node)
    svgElement('rect', { class: 'history-chart-handle', width: 12, height: 40, y: 4, rx: 4 }, node)
    svgElement('line', { class: 'history-chart-handle-grip', y1: 16, y2: 32 }, node)
    return node
  })
  const overviewAxis = svgElement('g', {}, overviewSvg)

  function draw() {
    if (!data || container.classList.contains('hidden')) return
    width = plot.clientWidth
    if (width < 10) return
    const height = plot.clientHeight, left = width < 380 ? 48 : 60, right = width - 13, top = 24, bottom = height - 47
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
      svgElement('text', { x: left - 8, y: y(value) + 4, 'text-anchor': 'end' }, grid).textContent = axisNumber.format(value)
    }
    axes.replaceChildren()
    svgElement('text', { x: left - 8, y: 12, 'text-anchor': 'end' }, axes).textContent = 'XP'
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
    svgElement('text', { x: right, y: height - 3, 'text-anchor': 'end' }, axes).textContent = t('history.chart.time')
    timeAxis.setAttribute('x', left)
    timeAxis.setAttribute('y', bottom + 1)
    timeAxis.setAttribute('width', right - left)
    timeAxis.setAttribute('height', height - bottom - 1)
    for (const [key, node] of [['video', videoPath], ['anki', ankiPath]]) {
      const index = series.indexOf(key)
      let path = ''
      if (index >= 0 && mode === 'bar') {
        for (const row of buckets) {
          const a = clamp(x(row.start), left, right), b = clamp(x(row.end), left, right)
          const bw = (b - a) * .76 / series.length
          const bx = a + (b - a) * .12 + index * bw
          const h = bottom - y(row[key]), w = Math.max(.4, bw - Math.min(1.3, bw * .15))
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
    container.querySelectorAll('[data-chart-unit]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.chartUnit === unit)))
    container.querySelectorAll('button[data-chart-mode]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.chartMode === mode)))
    container.querySelectorAll('[data-chart-series]').forEach(node => {
      if (node.tagName === 'BUTTON') node.setAttribute('aria-pressed', String(visible[node.dataset.chartSeries]))
    })
    nav.querySelector('[data-chart-zoom="in"]').disabled = span <= 3
    nav.querySelector('[data-chart-zoom="out"]').disabled = span >= data.end - data.start
    drawOverview()
    drawDetail(x, y)
  }
  function drawOverview() {
    const w = overview.clientWidth, h = 70, span = viewport.end - viewport.start
    const context = Math.min(data.end - data.start, Math.max(120, span * 3))
    const start = clamp(viewport.start - (context - span) / 2, data.start, data.end - context)
    overviewBounds = lockedOverview || { start, end: start + context }
    const scale = day => 12 + (day - overviewBounds.start) / (overviewBounds.end - overviewBounds.start) * (w - 24)
    overviewSvg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    const from = Math.max(data.start, Math.floor(overviewBounds.start)), to = Math.min(data.end, Math.ceil(overviewBounds.end))
    const stride = Math.max(1, Math.ceil((to - from) / w))
    const points = []
    for (let day = from; day < to; day += stride) {
      let sum = 0
      for (let offset = 0; offset < stride && day + offset < to; offset++) {
        const row = data.days[day + offset - data.start]
        sum += (visible.video ? row.video : 0) + (visible.anki ? row.anki : 0)
      }
      points.push({ day, value: sum / stride })
    }
    const peak = Math.max(1, ...points.map(row => row.value))
    overviewArea.setAttribute('d', `M12,49${points.map(row => `L${scale(row.day).toFixed(1)},${(49 - row.value / peak * 38).toFixed(1)}`).join('')}L${w - 12},49Z`)
    const a = scale(viewport.start), b = scale(viewport.end)
    for (const [name, value] of Object.entries({ x: a, y: 4, width: Math.max(1, b - a), height: 44 })) selection.setAttribute(name, value)
    handles.forEach((node, i) => {
      const px = i ? b : a, edge = i ? 'end' : 'start'
      node.querySelector('.history-chart-handle-hit').setAttribute('x', px - 22)
      node.querySelector('.history-chart-handle').setAttribute('x', px - 6)
      node.querySelector('line').setAttribute('x1', px)
      node.querySelector('line').setAttribute('x2', px)
      node.setAttribute('aria-valuemin', String(data.start))
      node.setAttribute('aria-valuemax', String(data.end))
      node.setAttribute('aria-valuenow', String(Math.round(viewport[edge])))
      node.setAttribute('aria-valuetext', date(viewport[edge] - (i ? 1 : 0)))
    })
    overviewAxis.replaceChildren()
    const count = w < 380 ? 3 : 5
    for (let i = 0; i < count; i++) {
      const day = overviewBounds.start + (overviewBounds.end - overviewBounds.start) * (i + .5) / count
      svgElement('text', { x: scale(day), y: 67, 'text-anchor': 'middle' }, overviewAxis).textContent = context > 730
        ? String(new Date(day * DAY_MS).getUTCFullYear()) : overviewLabels.format(new Date(day * DAY_MS))
    }
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
    detail.setAttribute('aria-live', row || gesture || overviewDrag || inertia ? 'off' : 'polite')
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
      node.setAttribute('cx', center)
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
      const priorSpan = viewport ? viewport.end - viewport.start : spans[unit]
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
