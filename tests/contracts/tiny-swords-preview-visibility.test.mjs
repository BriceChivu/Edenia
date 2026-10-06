import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('the dashboard retires historical town rendering and preloads on every origin', async () => {
  const [html, app, css] = await Promise.all([
    readFile('index.html', 'utf8'), readFile('src/app.js', 'utf8'), readFile('src/styles/40-city.css', 'utf8')
  ])
  assert.match(html, /id="tinySwordsSurface"/)
  assert.match(html, /id="tinySwordsLoadStatus" role="status"/)
  assert.doesNotMatch(html, /cityMilestoneImage|cityTimeWaveform|data-intro-city-frame|images\/city/)
  assert.doesNotMatch(app, /getCitySnapshot|selectedCityDayOffset|CityWaveform|preloadCityImage|initCityImagePanZoom/)
  assert.doesNotMatch(css, /city-wave|city-time|city-milestone|city-confetti|images\/city/)
  assert.match(app, /function getStudyHistoryBetween/)
  assert.match(app, /function getCityScoreThroughDate/)
})
