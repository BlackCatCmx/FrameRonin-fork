#!/usr/bin/env node
/**
 * 从 GeminiWatermarkTool 提取 alpha mask PNG 到 public/
 * 运行: node scripts/extract-gemini-masks.mjs
 * 需要网络访问 raw.githubusercontent.com
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const URL = 'https://raw.githubusercontent.com/allenk/GeminiWatermarkTool/main/assets/embedded_assets.hpp'

const data = await fetch(URL).then((r) => r.text())
const parseBytes = (match) => {
  if (!match?.[1]) return null
  const hex = match[1].match(/0x[0-9a-fA-F]+/g)
  return hex ? Buffer.from(hex.map((x) => parseInt(x, 16))) : null
}
const m48 = data.match(/bg_48_png\[\] = \{([^}]+)\}/s)
const m96 = data.match(/bg_96_png\[\] = \{([^}]+)\}/s)
const b48 = parseBytes(m48)
const b96 = parseBytes(m96)
const publicDir = path.join(__dirname, '..', 'public')
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true })
if (b48) fs.writeFileSync(path.join(publicDir, 'gemini-mask-48.png'), b48)
if (b96) fs.writeFileSync(path.join(publicDir, 'gemini-mask-96.png'), b96)
console.log('Extracted masks:', b48?.length, 'bytes (48x48)', b96?.length, 'bytes (96x96)')
