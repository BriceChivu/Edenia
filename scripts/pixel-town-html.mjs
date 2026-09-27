// Run before the parser discovers image URLs. Disabled/public pages retain original image markup.
export function preparePixelTownHtml(html, { base, version }, enabled) {
  const setup = `<script>
window.EDENIA_PIXEL_TOWN={enabled:${enabled ? 'true' : 'false'} && new URLSearchParams(location.search).get('internal_test')==='1',base:${JSON.stringify(base)},version:${JSON.stringify(version)}};
if(window.EDENIA_PIXEL_TOWN.enabled){
 document.documentElement.classList.add('pixel-town');
 document.documentElement.style.setProperty('--city-background','none');
 const link=document.createElement('link');link.rel='stylesheet';link.href=window.EDENIA_PIXEL_TOWN.base+'town.css';document.head.append(link);
}
window.EDENIA_PIXEL_TOWN.light=()=>{const d=new Date(),h=d.getHours()+d.getMinutes()/60;return h<5.5||h>=20?'night':h<7.5?'dawn':h<17.5?'day':'sunset'};
</script>`
  html = html.replace(
    '<link rel="preload" as="image"',
    `${setup}\n<link rel="preload" as="image"`
  )
  html = html.replace(
    /<link rel="preload" as="image"[^>]*>/,
    (tag) =>
      `<script>if(!window.EDENIA_PIXEL_TOWN.enabled)document.write(${JSON.stringify(tag)});</script>`
  )
  html = html.replace(
    /<img\b[^>]*src="images\/city\/level%20(\d+)\.webp"[^>]*>/g,
    (tag, stage) => {
      const prefix = tag.replace(/src="[^"]*"/, 'src="__TOWN_SOURCE__"')
      return `<script>document.write(window.EDENIA_PIXEL_TOWN.enabled?${JSON.stringify(prefix)}.replace('__TOWN_SOURCE__',window.EDENIA_PIXEL_TOWN.base+${JSON.stringify(stage + '-')}+window.EDENIA_PIXEL_TOWN.light()+'.png'):${JSON.stringify(tag)});</script>`
    }
  )
  return html.replace(
    '</body>',
    `<script>if(window.EDENIA_PIXEL_TOWN.enabled){const s=document.createElement('script');s.type='module';s.src=window.EDENIA_PIXEL_TOWN.base+'entry.js';document.body.append(s)}</script>\n</body>`
  )
}
