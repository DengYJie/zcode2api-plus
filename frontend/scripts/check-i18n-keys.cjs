// 校验：源码中所有 t('key') / i18next.t('key') 的静态 key 必须存在于三份语言包。
const fs = require('fs')
const path = require('path')

const locales = ['zh-TW', 'zh-CN', 'en'].map((l) => ({
  name: l,
  keys: new Set(Object.keys(JSON.parse(fs.readFileSync(`src/i18n/locales/${l}.json`, 'utf8')))),
}))

const missing = []
const dynamic = []
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f)
    const st = fs.statSync(p)
    if (st.isDirectory()) {
      if (!p.includes('i18n')) walk(p)
    } else if (/\.tsx?$/.test(f)) {
      const s = fs.readFileSync(p, 'utf8')
      for (const m of s.matchAll(/\bt\(\s*'([^']+)'\s*\)/g)) {
        const k = m[1]
        for (const loc of locales) {
          if (!loc.keys.has(k)) missing.push(`${k}  [${loc.name}]  (${f})`)
        }
      }
      for (const m of s.matchAll(/\bt\(\s*`([^`]+)`/g)) dynamic.push(m[1] + `  (${f})`)
      for (const m of s.matchAll(/\bt\(\s*'([^']+)' \+/g)) dynamic.push(m[1] + '*  (' + f + ')')
    }
  }
}
walk('src')
if (missing.length) {
  console.log('MISSING:')
  console.log(missing.join('\n'))
  process.exit(1)
}
console.log('ALL STATIC KEYS COVERED')
console.log('dynamic key prefixes (check manually):')
console.log([...new Set(dynamic)].join('\n') || '(none)')
