import fs from 'fs'
const p = 'C:/Users/Lenovo/.cursor/projects/c-Users-Lenovo-Desktop-dev2025-pixelwork/agent-tools/ad08c1bf-8d4c-4a91-b987-90224b52f570.txt'
const data = fs.readFileSync(p, 'utf8')
const parse = (m) => m ? Buffer.from(m[1].match(/0x[0-9a-fA-F]+/g).map(x => parseInt(x, 16))) : null
const m48 = data.match(/bg_48_png\[\] = \{([^}]+)\}/s)
const b48 = parse(m48)
let idx = data.indexOf('bg_96_png')
let start = data.indexOf('{', idx) + 1
let depth = 1, i = start
while (depth > 0) {
  if (data[i] === '{') depth++
  else if (data[i] === '}') depth--
  i++
}
const sub = data.slice(start, i - 1)
const hex = sub.match(/0x[0-9a-fA-F]+/g)
const b96 = hex ? Buffer.from(hex.map(x => parseInt(x, 16))) : null
fs.writeFileSync('scripts/bg48.txt', b48 ? b48.toString('base64') : '', 'utf8')
fs.writeFileSync('scripts/bg96.txt', b96 ? b96.toString('base64') : '', 'utf8')
console.log('BG_48:', b48 ? b48.length : 0, 'bytes')
console.log('BG_96:', b96 ? b96.length : 0, 'bytes')
