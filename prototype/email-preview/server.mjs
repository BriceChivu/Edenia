import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { renderTypedReminderEmail } from '../../supabase/functions/_shared/reminder-email.ts'

import { signInPreview } from './sign-in-preview.mjs'


import { selectDiscoveryRecommendations } from '../../src/features/channels/discovery-recommendations.js'
const candidates = JSON.parse(await readFile(new URL('./channels.json',import.meta.url),'utf8'))
const sample = JSON.parse(await readFile(new URL('./recommendation-sample.json',import.meta.url),'utf8'))

const locales = ['en', 'zh-Hant', 'zh-Hans', 'fr', 'es']
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:4188')
  if (url.pathname === '/api/emails') {
    const locale = locales.includes(url.searchParams.get('lang')) ? url.searchParams.get('lang') : 'en'
    const recommended = selectDiscoveryRecommendations({channels:candidates,...sample})
    const video = url.searchParams.get('video') !== '0'
    const shared = { locale, appUrl: 'https://www.edenia.study/', unsubscribePageUrl: `http://localhost:8000/unsubscribe/?token=${'x'.repeat(43)}&lang=${locale}` }
    const channel = { channelId: 'UCC_fdR7zZ_5SU--xuOrEdKw', channelName: 'Grace Mandarin Chinese', channelSummary: 'Learn Mandarin through everyday conversations, clear explanations, and Taiwanese culture.' }
    const clip = { videoId: 'abcdefghijk', videoTitle: 'Everyday Mandarin: a morning at the breakfast shop' }
    const emails = ['streak', 'discovery'].map(emailType => renderTypedReminderEmail({ ...shared, emailType, currentStreakDays:12, remainingMinutes:4, videoMode: url.searchParams.get('state') === 'continue' ? 'continue' : 'new', recommendations: emailType === 'discovery' ? recommended.map(c=>({channelId:c.channelId,name:c.name,thumbnailUrl:c.thumbnailUrl.startsWith('/avatars/') ? 'https://www.edenia.study/images/channel-avatars/'+c.catalogId+'.jpg' : c.thumbnailUrl})) : undefined, ...(emailType === 'discovery' || video ? channel : {}), ...(video ? clip : {}) }))
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify([...emails.map(mail => ({...mail,html:mail.html.replaceAll('https://www.edenia.study/images/email-wordmark.png','/images/email-wordmark.png').replaceAll('https://www.edenia.study/?reminder=', 'http://localhost:4190/?sandbox=1&amp;reminder=').replace('https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg','/thumbnail.svg')})), signInPreview(locale)])); return
  }
  if (url.pathname === '/images/email-wordmark.png') { res.writeHead(200, {'Content-Type':'image/png'}); res.end(await readFile(new URL('../../images/email-wordmark.png',import.meta.url))); return }
  if (url.pathname === '/Edenia_favicon_round.png') { res.writeHead(200, {'Content-Type':'image/png'}); res.end(await readFile(new URL('./Edenia_favicon_round.png',import.meta.url))); return }
  if (url.pathname === '/bebas-neue-latin.woff2') { res.writeHead(200, {'Content-Type':'font/woff2'}); res.end(await readFile(new URL('./bebas-neue-latin.woff2',import.meta.url))); return }
  if (/^\/avatars\/[a-z0-9-]+\.jpg$/.test(url.pathname)) { res.writeHead(200, {'Content-Type':'image/jpeg'}); res.end(await readFile(new URL('.'+url.pathname,import.meta.url))); return }
  if (url.pathname === '/thumbnail.svg') { res.writeHead(200, {'Content-Type':'image/svg+xml'}); res.end(await readFile(new URL('./thumbnail.svg',import.meta.url))); return }
  if (url.pathname !== '/') { res.writeHead(404); res.end('Preview only'); return }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(await readFile(new URL('./index.html', import.meta.url)))
}).listen(4188, '127.0.0.1', () => console.log('Email mailbox preview: http://localhost:4188'))
