export type DiscoveryRecommendation = Readonly<{ channelId: string; name: string; thumbnailUrl: string }>
const copy = {
  en: { heading: 'Check out what other learners watch', all: 'Add all channels', open: 'Open Edenia', minutes: (n: number) => `Watch only ${n} ${n === 1 ? 'minute' : 'minutes'} to keep your streak alive.`, fresh: (c: string, v: string) => `Watch this new video from ${c}: ${v}`, resume: (v: string) => `Continue watching ${v}` },
  fr: { heading: 'Découvrez ce que regardent les autres apprenants', all: 'Ajouter toutes les chaînes', open: 'Ouvrir Edenia', minutes: (n: number) => `Regardez seulement ${n} ${n === 1 ? 'minute' : 'minutes'} pour maintenir votre série.`, fresh: (c: string, v: string) => `Regardez cette nouvelle vidéo de ${c} : ${v}`, resume: (v: string) => `Continuez à regarder ${v}` },
  es: { heading: 'Descubre qué ven otros estudiantes', all: 'Añadir todos los canales', open: 'Abrir Edenia', minutes: (n: number) => `Mira solo ${n} ${n === 1 ? 'minuto' : 'minutos'} para mantener tu racha.`, fresh: (c: string, v: string) => `Mira este vídeo nuevo de ${c}: ${v}`, resume: (v: string) => `Sigue viendo ${v}` },
  'zh-Hant': { heading: '看看其他學習者都在看什麼', all: '新增所有頻道', open: '開啟 Edenia', minutes: (n: number) => `只要再觀看 ${n} 分鐘，就能延續你的連續學習紀錄。`, fresh: (c: string, v: string) => `觀看 ${c} 的新影片：${v}`, resume: (v: string) => `繼續觀看 ${v}` },
  'zh-Hans': { heading: '看看其他学习者都在看什么', all: '添加所有频道', open: '打开 Edenia', minutes: (n: number) => `只要再观看 ${n} 分钟，就能延续你的连续学习记录。`, fresh: (c: string, v: string) => `观看 ${c} 的新视频：${v}`, resume: (v: string) => `继续观看 ${v}` }
}
const escape = (v: string) => v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function validateDiscoveryRecommendations(value: unknown): readonly DiscoveryRecommendation[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) throw new TypeError('Invalid discovery recommendations')
  const seen = new Set<string>()
  return Object.freeze(value.map(row => {
    if (!row || typeof row !== 'object' || typeof row.channelId !== 'string'
      || !/^UC[A-Za-z0-9_-]{22}$/.test(row.channelId) || seen.has(row.channelId)
      || typeof row.name !== 'string' || !row.name.trim() || row.name !== row.name.trim()
      || row.name.length > 200 || /[\r\n]/.test(row.name)
      || typeof row.thumbnailUrl !== 'string' || row.thumbnailUrl.length > 2048) throw new TypeError('Invalid discovery recommendation')
    if (row.thumbnailUrl) {
      const url = new URL(row.thumbnailUrl)
      const catalogImage = url.protocol === 'https:' && ['yt3.ggpht.com', 'yt3.googleusercontent.com', 'www.edenia.study'].includes(url.hostname)
      if (!catalogImage || url.port || url.username || url.password || url.hash || (url.hostname === 'www.edenia.study' && !url.pathname.startsWith('/images/channel-avatars/'))) throw new TypeError('Invalid discovery image')
    }
    seen.add(row.channelId)
    return Object.freeze({ channelId: row.channelId, name: row.name, thumbnailUrl: row.thumbnailUrl })
  }))
}

export function discoveryChannelUrl(appUrl: string, ids: readonly string[], all = false) {
  const url = new URL(appUrl)
  for (const key of ['reminder', 'video', 'channel', 'channels']) url.searchParams.delete(key)
  url.searchParams.set('reminder', 'discovery')
  url.searchParams.set(all ? 'channels' : 'channel', ids.join(','))
  return url.href
}

export function renderReminderDesign(input: {
  locale: keyof typeof copy; emailType: 'streak' | 'discovery'; appUrl: string;
  subject: string; streakHeading: string; destinationUrl: string; consent: string;
  unsubscribe: string; unsubscribePageUrl: string; currentStreakDays: number | null;
  remainingMinutes: number | null; videoId: string | null; videoTitle: string | null;
  channelName: string | null; videoMode: 'new' | 'continue'; recommendations: readonly DiscoveryRecommendation[];
}) {
  const c = copy[input.locale]
  const discovery = input.emailType === 'discovery'
  const heading = discovery ? c.heading : input.streakHeading
  const body = discovery ? '' : c.minutes(input.remainingMinutes ?? 10)
  const videoLine = input.videoTitle && input.channelName ? input.videoMode === 'continue' ? c.resume(input.videoTitle) : c.fresh(input.channelName, input.videoTitle) : null
  const cta = discovery ? c.all : c.open
  const preheader = discovery ? heading : body
  const imageBase = new URL('/', input.appUrl).href
  const logo = `<img src="${imageBase}images/email-wordmark.png" width="100" height="36" alt="EDENIA" style="display:block;border:0;">`
  const badge = !discovery && input.currentStreakDays !== null ? `<td width="86" align="right" valign="middle"><span style="display:inline-block;white-space:nowrap;border:2px solid #050505;border-radius:999px;padding:8px 12px;background:#fff;font-size:17px;">🔥 <b style="font-size:23px;color:#079cc8;">${input.currentStreakDays}</b></span></td>` : ''
  const cards = input.recommendations.map(channel => {
    const destination = discoveryChannelUrl(input.appUrl, [channel.channelId])
    const image = channel.thumbnailUrl || `${imageBase}Edenia_favicon_round.png`
    return `<div class="channel-tile" style="display:inline-block;vertical-align:top;box-sizing:border-box;width:33.333%;padding:6px;"><a href="${escape(destination)}" style="display:block;box-sizing:border-box;height:190px;text-decoration:none;color:#10232a;text-align:center;padding:14px 8px;background:#e3f6fb;border:2px solid #050505;border-radius:14px;"><img src="${escape(image)}" width="80" height="80" alt="${escape(channel.name)}" style="display:block;margin:0 auto 10px;width:80px;height:80px;border:2px solid #050505;border-radius:50%;object-fit:cover;background:#82d2ef;"><span style="display:block;height:64px;font-size:12.5px;line-height:16px;font-weight:700;overflow:hidden;">${escape(channel.name)}</span></a></div>`
  }).join('')
  const content = discovery ? `<div style="margin:0 -6px 22px;font-size:0;">${cards}</div>` : `<p style="margin:0 0 24px;font-size:18px;line-height:1.55;">${escape(body).replace(/(\d+\s*(?:minutes?|minutos?|分鐘|分钟))/, '<strong style="background:#c9ef68;padding:2px 5px;border-radius:4px;color:#050505;">$1</strong>')}</p>${videoLine ? `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;">${escape(videoLine)}</p><a href="${escape(input.destinationUrl)}" style="display:block;margin:0 0 24px;"><img src="https://i.ytimg.com/vi/${input.videoId}/mqdefault.jpg" width="500" alt="${escape(input.videoTitle!)}" style="display:block;width:100%;height:auto;border:2px solid #050505;border-radius:12px;"></a>` : ''}`
  return {
    subject: discovery ? c.heading : input.subject,
    text: [heading, '', ...(discovery ? input.recommendations.flatMap(channel => [`${channel.name}: ${discoveryChannelUrl(input.appUrl, [channel.channelId])}`]) : [body, ...(videoLine ? ['', videoLine] : [])]), '', `${cta}: ${input.destinationUrl}`, '', input.consent, `${input.unsubscribe}: ${input.unsubscribePageUrl}`].join('\n'),
    html: `<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(discovery ? c.heading : input.subject)}</title><style>@media(max-width:440px){.channel-tile{width:50% !important}.email-padding{padding:24px 18px !important}}</style></head><body style="margin:0;background:#dff8ff;color:#10232a;font-family:Arial,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#dff8ff;padding:24px 12px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:2px solid #050505;border-radius:18px;"><tr><td class="email-padding" style="padding:32px 28px;"><div style="margin:0 0 20px;">${logo}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;"><tr><td style="padding-right:12px;"><h1 style="margin:0;font-size:27px;line-height:1.2;">${escape(heading)}</h1></td>${badge}</tr></table>${content}<p style="margin:0 0 28px;"><a href="${escape(input.destinationUrl)}" style="display:inline-block;border-radius:999px;background:#12bcea;color:#050505;border:2px solid #050505;box-shadow:0 4px 0 #050505;padding:13px 22px;font-weight:700;text-decoration:none;">${escape(cta)}</a></p><p style="margin:0 0 6px;color:#54737b;font-size:10px;line-height:1.5;">${escape(input.consent)}</p><p style="margin:0;color:#54737b;font-size:10px;line-height:1.5;"><a href="${escape(input.unsubscribePageUrl)}" style="color:#087fa6;">${escape(input.unsubscribe)}</a></p></td></tr></table></td></tr></table></body></html>`
  }
}
