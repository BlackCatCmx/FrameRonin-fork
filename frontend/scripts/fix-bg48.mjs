import fs from 'fs'
const b48 = fs.readFileSync('scripts/bg48.txt', 'utf8').trim()
const ts = fs.readFileSync('src/lib/geminiWatermark.ts', 'utf8')
const old = /const BG_48_BASE64 =\s*\n\s*'[^']*'/
const newVal = "const BG_48_BASE64 =\n  '" + b48 + "'"
const out = ts.replace(old, newVal)
fs.writeFileSync('src/lib/geminiWatermark.ts', out)
console.log('Replaced. BG_48 base64 length:', b48.length)
