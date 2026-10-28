import { readFile } from 'node:fs/promises'
const template = await readFile(new URL('../../supabase/templates/magic_link.html', import.meta.url), 'utf8')
const subjects = {en:'Your Edenia sign-in code',es:'Tu código de acceso a Edenia',fr:'Votre code de connexion Edenia','zh-Hans':'你的 Edenia 登录验证码','zh-Hant':'你的 Edenia 登入驗證碼'}
export function signInPreview(locale) {
  const html = template.replace(/{{ if eq \.Data\.edenia_auth_locale "[^"]+" }}[\s\S]*?{{ end }}/g, block => {
    const branches = [...block.matchAll(/{{ (?:if|else if) eq \.Data\.edenia_auth_locale "([^"]+)" }}|{{ (else|end) }}/g)]
    for (let i=0; i<branches.length-1; i++) {
      const branch=branches[i]
      if(branch[1]===locale || branch[2]==='else') return block.slice(branch.index+branch[0].length, branches[i+1].index)
    }
    return ''
  }).replaceAll('{{ .Token }}','123456').replaceAll('{{ .SiteURL }}','/')
  return {locale,emailType:'signin',subject:subjects[locale],html}
}
