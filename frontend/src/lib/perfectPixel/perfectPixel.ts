/**
 * 浏览器端实现：按 theamusing/perfectPixel 开源仓库中的算法用 TypeScript 重写（FFT 估网格 + Sobel 细化 + 格内采样）。
 * 上游: https://github.com/theamusing/perfectPixel · 原演示: https://theamusing.github.io/perfectPixel_webdemo/
 */
import { fft2d, fftShift2dMag, nextPow2 } from './fft'

export type PerfectPixelSampleMethod = 'center' | 'median' | 'majority'

export interface PerfectPixelOptions {
  sampleMethod?: PerfectPixelSampleMethod
  /** 手动指定列×行网格数，覆盖自动检测 */
  gridSize?: { cols: number; rows: number } | null
  minSize?: number
  peakWidth?: number
  refineIntensity?: number
  fixSquare?: boolean
}

const FFT_THUMB_MAX = 512
const TRANSPARENT_ALPHA = 8

function rgbaToRgbaFloat(imageData: ImageData): { r: Float32Array; g: Float32Array; b: Float32Array; a: Float32Array; w: number; h: number } {
  const w = imageData.width
  const h = imageData.height
  const d = imageData.data
  const n = w * h
  const r = new Float32Array(n)
  const g = new Float32Array(n)
  const b = new Float32Array(n)
  const a = new Float32Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    r[i] = d[p]!
    g[i] = d[p + 1]!
    b[i] = d[p + 2]!
    a[i] = d[p + 3]!
  }
  return { r, g, b, a, w, h }
}

function rgbToGrayFloat32(r: Float32Array, g: Float32Array, b: Float32Array, n: number): Float32Array {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = 0.299 * r[i]! + 0.587 * g[i]! + 0.114 * b[i]!
  }
  return out
}

function resizeGrayNearest(src: Float32Array, sw: number, sh: number, tw: number, th: number): Float32Array {
  const out = new Float32Array(tw * th)
  for (let y = 0; y < th; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / th))
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / tw))
      out[y * tw + x] = src[sy * sw + sx]!
    }
  }
  return out
}

function padGrayToSize(src: Float32Array, sw: number, sh: number, pw: number, ph: number): Float64Array {
  const out = new Float64Array(pw * ph)
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      out[y * pw + x] = src[y * sw + x]!
    }
  }
  return out
}

function computeFftMagnitude2d(gray: Float32Array, w: number, h: number): Float32Array {
  const pw = nextPow2(w)
  const ph = nextPow2(h)
  const padded = padGrayToSize(gray, w, h, pw, ph)
  const re = padded
  const im = new Float64Array(pw * ph)
  fft2d(re, im, pw, ph)
  const magShift = fftShift2dMag(re, im, pw, ph)
  let mn = Infinity
  let mx = -Infinity
  const logged = new Float32Array(magShift.length)
  for (let i = 0; i < magShift.length; i++) {
    logged[i] = 1 - Math.log1p(magShift[i]!)
    const v = logged[i]!
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  if (mx - mn < 1e-8) return new Float32Array(magShift.length)
  const d = mx - mn
  for (let i = 0; i < logged.length; i++) logged[i] = (logged[i]! - mn) / d
  return logged
}

function smooth1d(v: Float64Array, k: number): Float64Array {
  k = Math.floor(k)
  if (k < 3) return new Float64Array(v)
  if (k % 2 === 0) k += 1
  const sigma = k / 6
  const ker = new Float64Array(k)
  let ks = 0
  const c = (k - 1) >> 1
  for (let i = 0; i < k; i++) {
    const x = i - c
    ker[i] = Math.exp(-(x * x) / (2 * sigma * sigma))
    ks += ker[i]!
  }
  ks += 1e-8
  const out = new Float64Array(v.length)
  const half = c
  for (let i = 0; i < v.length; i++) {
    let s = 0
    for (let j = 0; j < k; j++) {
      const ii = i + j - half
      const idx = Math.max(0, Math.min(v.length - 1, ii))
      s += v[idx]! * ker[j]!
    }
    out[i] = s / ks
  }
  return out
}

function detectPeak(proj: Float64Array, peakWidth: number, relThr = 0.35, minDist = 6): number | null {
  const center = (proj.length / 2) | 0
  let mx = 0
  for (let i = 0; i < proj.length; i++) {
    if (proj[i]! > mx) mx = proj[i]!
  }
  if (mx < 1e-6) return null
  const thr = mx * relThr
  const candidates: { index: number; score: number }[] = []

  for (let i = 1; i < proj.length - 1; i++) {
    let isPeak = true
    for (let j = 1; j < peakWidth; j++) {
      if (i - j < 0 || i + j >= proj.length) continue
      if (proj[i - j + 1]! < proj[i - j]! || proj[i + j - 1]! < proj[i + j]!) {
        isPeak = false
        break
      }
    }
    if (!isPeak || proj[i]! < thr) continue

    let leftClimb = 0
    for (let k = i; k > 0; k--) {
      if (proj[k]! > proj[k - 1]!) leftClimb = Math.abs(proj[i]! - proj[k - 1]!)
      else break
    }
    let rightFall = 0
    for (let k = i; k < proj.length - 1; k++) {
      if (proj[k]! > proj[k + 1]!) rightFall = Math.abs(proj[i]! - proj[k + 1]!)
      else break
    }
    candidates.push({ index: i, score: Math.max(leftClimb, rightFall) })
  }

  if (candidates.length === 0) return null
  const left = candidates.filter((c) => c.index < center - minDist && c.index > center * 0.25)
  const right = candidates.filter((c) => c.index > center + minDist && c.index < center * 1.75)
  if (left.length === 0 || right.length === 0) return null
  left.sort((a, b) => b.score - a.score)
  right.sort((a, b) => b.score - a.score)
  const peakLeft = left[0]!.index
  const peakRight = right[0]!.index
  return Math.abs(peakRight - peakLeft) / 2
}

function estimateGridFft(gray: Float32Array, w: number, h: number, peakWidth: number): { gridW: number; gridH: number } | null {
  const mag = computeFftMagnitude2d(gray, w, h)
  const pw = nextPow2(w)
  const ph = nextPow2(h)
  const rowSum = new Float64Array(ph)
  for (let y = 0; y < ph; y++) {
    let s = 0
    for (let x = 0; x < pw; x++) s += mag[y * pw + x]!
    rowSum[y] = s
  }
  const colSum = new Float64Array(pw)
  for (let x = 0; x < pw; x++) {
    let s = 0
    for (let y = 0; y < ph; y++) s += mag[y * pw + x]!
    colSum[x] = s
  }

  const normRow = normalizeMinMax1d(rowSum)
  const normCol = normalizeMinMax1d(colSum)
  const smRow = smooth1d(normRow, 17)
  const smCol = smooth1d(normCol, 17)

  const scaleRow = detectPeak(smRow, peakWidth)
  const scaleCol = detectPeak(smCol, peakWidth)
  if (scaleRow == null || scaleCol == null || scaleCol <= 0) return null
  return { gridW: Math.round(scaleCol), gridH: Math.round(scaleRow) }
}

function normalizeMinMax1d(a: Float64Array): Float64Array {
  let mn = Infinity
  let mx = -Infinity
  for (let i = 0; i < a.length; i++) {
    const v = a[i]!
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  const out = new Float64Array(a.length)
  const d = mx - mn
  if (d < 1e-8) return out
  for (let i = 0; i < a.length; i++) out[i] = (a[i]! - mn) / d
  return out
}

function sobelGray(gray: Float32Array, W: number, H: number): { gx: Float32Array; gy: Float32Array } {
  const gx = new Float32Array(W * H)
  const gy = new Float32Array(W * H)
  const at = (x: number, y: number) => gray[y * W + x]!
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x
      gx[idx] =
        -at(x - 1, y - 1) +
        at(x + 1, y - 1) +
        -2 * at(x - 1, y) +
        2 * at(x + 1, y) +
        -at(x - 1, y + 1) +
        at(x + 1, y + 1)
      gy[idx] =
        -at(x - 1, y - 1) -
        2 * at(x, y - 1) -
        at(x + 1, y - 1) +
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1)
    }
  }
  return { gx, gy }
}

function sumAbsGradPerAxis(gx: Float32Array, gy: Float32Array, W: number, H: number): { col: Float64Array; row: Float64Array } {
  const col = new Float64Array(W)
  const row = new Float64Array(H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const m = Math.abs(gx[i]!) + Math.abs(gy[i]!)
      col[x] += m
      row[y] += m
    }
  }
  return { col, row }
}

function findBestGrid(
  origin: number,
  rangeValMin: number,
  rangeValMax: number,
  gradMag: Float64Array,
  thr = 0,
): number {
  const fallback = Math.round(origin)
  let mx = 0
  for (let i = 0; i < gradMag.length; i++) {
    if (gradMag[i]! > mx) mx = gradMag[i]!
  }
  if (mx < 1e-6) return fallback
  const relThr = mx * thr
  const peaks: { v: number; idx: number }[] = []
  const rmin = Math.round(rangeValMin)
  const rmax = Math.round(rangeValMax)
  for (let i = -rmin; i <= rmax; i++) {
    const candidate = Math.round(origin + i)
    if (candidate <= 0 || candidate >= gradMag.length - 1) continue
    if (
      gradMag[candidate]! > gradMag[candidate - 1]! &&
      gradMag[candidate]! > gradMag[candidate + 1]! &&
      gradMag[candidate]! >= relThr
    ) {
      peaks.push({ v: gradMag[candidate]!, idx: candidate })
    }
  }
  if (peaks.length === 0) return fallback
  peaks.sort((a, b) => b.v - a.v)
  return peaks[0]!.idx
}

function estimateGridGradient(gray: Float32Array, W: number, H: number, relThr = 0.2): { gridW: number; gridH: number } | null {
  const { gx, gy } = sobelGray(gray, W, H)
  const { col: gradXSum, row: gradYSum } = sumAbsGradPerAxis(gx, gy, W, H)
  const peakX: number[] = []
  const peakY: number[] = []
  const thrX = relThr * Math.max(...gradXSum, 1e-6)
  const thrY = relThr * Math.max(...gradYSum, 1e-6)
  const minInterval = 4
  for (let i = 1; i < gradXSum.length - 1; i++) {
    if (gradXSum[i]! > gradXSum[i - 1]! && gradXSum[i]! > gradXSum[i + 1]! && gradXSum[i]! >= thrX) {
      if (peakX.length === 0 || i - peakX[peakX.length - 1]! >= minInterval) peakX.push(i)
    }
  }
  for (let i = 1; i < gradYSum.length - 1; i++) {
    if (gradYSum[i]! > gradYSum[i - 1]! && gradYSum[i]! > gradYSum[i + 1]! && gradYSum[i]! >= thrY) {
      if (peakY.length === 0 || i - peakY[peakY.length - 1]! >= minInterval) peakY.push(i)
    }
  }
  if (peakX.length < 4 || peakY.length < 4) return null
  const intervalsX: number[] = []
  for (let i = 1; i < peakX.length; i++) intervalsX.push(peakX[i]! - peakX[i - 1]!)
  const intervalsY: number[] = []
  for (let i = 1; i < peakY.length; i++) intervalsY.push(peakY[i]! - peakY[i - 1]!)
  intervalsX.sort((a, b) => a - b)
  intervalsY.sort((a, b) => a - b)
  const medX = intervalsX[Math.floor(intervalsX.length / 2)]!
  const medY = intervalsY[Math.floor(intervalsY.length / 2)]!
  const scaleX = W / medX
  const scaleY = H / medY
  return { gridW: Math.round(scaleX), gridH: Math.round(scaleY) }
}

function medianSorted(sorted: number[]): number {
  const m = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2
}

function detectGridScale(
  gray: Float32Array,
  W: number,
  H: number,
  peakWidth: number,
  maxRatio: number,
  minSize: number,
): { gridW: number; gridH: number } | null {
  const tw = Math.min(W, FFT_THUMB_MAX)
  const th = Math.min(H, FFT_THUMB_MAX)
  const thumb =
    tw === W && th === H ? gray : resizeGrayNearest(gray, W, H, tw, th)
  let fftGuess = estimateGridFft(thumb, tw, th, peakWidth)

  let gridW: number | null = null
  let gridH: number | null = null

  if (fftGuess != null) {
    gridW = fftGuess.gridW
    gridH = fftGuess.gridH
    const pixelSizeX = W / gridW
    const pixelSizeY = H / gridH
    const maxPixelSize = 20
    if (
      Math.min(pixelSizeX, pixelSizeY) < minSize ||
      Math.max(pixelSizeX, pixelSizeY) > maxPixelSize ||
      pixelSizeX / pixelSizeY > maxRatio ||
      pixelSizeY / pixelSizeX > maxRatio
    ) {
      fftGuess = null
    }
  }

  if (fftGuess == null) {
    const g = estimateGridGradient(gray, W, H)
    if (g == null) return null
    gridW = g.gridW
    gridH = g.gridH
  }

  if (gridW == null || gridH == null) return null

  const pixelSizeX = W / gridW
  const pixelSizeY = H / gridH
  let pixelSize: number
  if (pixelSizeX / pixelSizeY > maxRatio || pixelSizeY / pixelSizeX > maxRatio) {
    pixelSize = Math.min(pixelSizeX, pixelSizeY)
  } else {
    pixelSize = (pixelSizeX + pixelSizeY) / 2
  }
  return {
    gridW: Math.round(W / pixelSize),
    gridH: Math.round(H / pixelSize),
  }
}

function refineGrids(
  gray: Float32Array,
  W: number,
  H: number,
  gridX: number,
  gridY: number,
  refineIntensity: number,
): { xCoords: number[]; yCoords: number[] } {
  const xCoords: number[] = []
  const yCoords: number[] = []
  const cellW = W / gridX
  const cellH = H / gridY
  const { gx, gy } = sobelGray(gray, W, H)
  const { col: gradXSum, row: gradYSum } = sumAbsGradPerAxis(gx, gy, W, H)

  let x = findBestGrid(W / 2, cellW, cellW, gradXSum)
  while (x < W + cellW / 2) {
    x = findBestGrid(x, cellW * refineIntensity, cellW * refineIntensity, gradXSum)
    xCoords.push(x)
    x += cellW
  }
  x = findBestGrid(W / 2, cellW, cellW, gradXSum) - cellW
  while (x > -cellW / 2) {
    x = findBestGrid(x, cellW * refineIntensity, cellW * refineIntensity, gradXSum)
    xCoords.push(x)
    x -= cellW
  }

  let y = findBestGrid(H / 2, cellH, cellH, gradYSum)
  while (y < H + cellH / 2) {
    y = findBestGrid(y, cellH * refineIntensity, cellH * refineIntensity, gradYSum)
    yCoords.push(y)
    y += cellH
  }
  y = findBestGrid(H / 2, cellH, cellH, gradYSum) - cellH
  while (y > -cellH / 2) {
    y = findBestGrid(y, cellH * refineIntensity, cellH * refineIntensity, gradYSum)
    yCoords.push(y)
    y -= cellH
  }

  xCoords.sort((a, b) => a - b)
  yCoords.sort((a, b) => a - b)
  return { xCoords, yCoords }
}

function sampleCenter(
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  a: Float32Array,
  W: number,
  H: number,
  xCoords: number[],
  yCoords: number[],
): ImageData {
  const nx = xCoords.length - 1
  const ny = yCoords.length - 1
  const data = new Uint8ClampedArray(nx * ny * 4)
  let o = 0
  for (let j = 0; j < ny; j++) {
    const cy = Math.min(
      H - 1,
      Math.max(0, Math.round((yCoords[j]! + yCoords[j + 1]!) * 0.5)),
    )
    for (let i = 0; i < nx; i++) {
      const cx = Math.min(
        W - 1,
        Math.max(0, Math.round((xCoords[i]! + xCoords[i + 1]!) * 0.5)),
      )
      const si = cy * W + cx
      const aa = a[si]!
      if (aa <= TRANSPARENT_ALPHA) {
        data[o++] = 0
        data[o++] = 0
        data[o++] = 0
        data[o++] = 0
      } else {
        data[o++] = r[si]!
        data[o++] = g[si]!
        data[o++] = b[si]!
        data[o++] = aa
      }
    }
  }
  return new ImageData(data, nx, ny)
}

function sampleMedian(
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  a: Float32Array,
  W: number,
  H: number,
  xCoords: number[],
  yCoords: number[],
): ImageData {
  const nx = xCoords.length - 1
  const ny = yCoords.length - 1
  const data = new Uint8ClampedArray(nx * ny * 4)
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  const alphas: number[] = []
  let o = 0
  for (let j = 0; j < ny; j++) {
    const y0 = Math.max(0, Math.min(H, Math.floor(yCoords[j]!)))
    let y1 = Math.max(0, Math.min(H, Math.floor(yCoords[j + 1]!)))
    if (y1 <= y0) y1 = Math.min(y0 + 1, H)
    for (let i = 0; i < nx; i++) {
      const x0 = Math.max(0, Math.min(W, Math.floor(xCoords[i]!)))
      let x1 = Math.max(0, Math.min(W, Math.floor(xCoords[i + 1]!)))
      if (x1 <= x0) x1 = Math.min(x0 + 1, W)
      rs.length = 0
      gs.length = 0
      bs.length = 0
      alphas.length = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const si = y * W + x
          const aa = a[si]!
          alphas.push(aa)
          if (aa > TRANSPARENT_ALPHA) {
            rs.push(r[si]!)
            gs.push(g[si]!)
            bs.push(b[si]!)
          }
        }
      }
      if (alphas.length === 0 || rs.length === 0) {
        data[o] = 0
        data[o + 1] = 0
        data[o + 2] = 0
        data[o + 3] = 0
        o += 4
        continue
      }
      alphas.sort((x, y) => x - y)
      const alpha = Math.round(medianSorted(alphas))
      if (alpha <= TRANSPARENT_ALPHA) {
        data[o] = 0
        data[o + 1] = 0
        data[o + 2] = 0
        data[o + 3] = 0
        o += 4
        continue
      }
      rs.sort((x, y) => x - y)
      gs.sort((x, y) => x - y)
      bs.sort((x, y) => x - y)
      data[o++] = Math.round(medianSorted(rs))
      data[o++] = Math.round(medianSorted(gs))
      data[o++] = Math.round(medianSorted(bs))
      data[o++] = alpha
    }
  }
  return new ImageData(data, nx, ny)
}

function dist2(
  r: number,
  g: number,
  b: number,
  cr: number,
  cg: number,
  cb: number,
): number {
  const dr = r - cr
  const dg = g - cg
  const db = b - cb
  return dr * dr + dg * dg + db * db
}

function kmeans2RgbCell(pixels: Float32Array, n: number): [number, number, number] {
  if (n <= 0) return [0, 0, 0]
  if (n === 1) return [pixels[0]!, pixels[1]!, pixels[2]!]
  let c0r = pixels[0]!
  let c0g = pixels[1]!
  let c0b = pixels[2]!
  let c1r = pixels[Math.min(3 * (n - 1), pixels.length - 3)]!
  let c1g = pixels[Math.min(3 * (n - 1) + 1, pixels.length - 2)]!
  let c1b = pixels[Math.min(3 * (n - 1) + 2, pixels.length - 1)]!
  const maxIter = 8
  for (let it = 0; it < maxIter; it++) {
    let s0r = 0,
      s0g = 0,
      s0b = 0,
      cnt0 = 0
    let s1r = 0,
      s1g = 0,
      s1b = 0,
      cnt1 = 0
    for (let p = 0; p < n; p++) {
      const o = p * 3
      const r = pixels[o]!
      const g = pixels[o + 1]!
      const b = pixels[o + 2]!
      const d0 = dist2(r, g, b, c0r, c0g, c0b)
      const d1 = dist2(r, g, b, c1r, c1g, c1b)
      if (d0 <= d1) {
        s0r += r
        s0g += g
        s0b += b
        cnt0++
      } else {
        s1r += r
        s1g += g
        s1b += b
        cnt1++
      }
    }
    if (cnt0) {
      c0r = s0r / cnt0
      c0g = s0g / cnt0
      c0b = s0b / cnt0
    }
    if (cnt1) {
      c1r = s1r / cnt1
      c1g = s1g / cnt1
      c1b = s1b / cnt1
    }
  }
  let cnt1 = 0
  for (let p = 0; p < n; p++) {
    const o = p * 3
    const r = pixels[o]!
    const g = pixels[o + 1]!
    const b = pixels[o + 2]!
    if (dist2(r, g, b, c0r, c0g, c0b) > dist2(r, g, b, c1r, c1g, c1b)) cnt1++
  }
  const cnt0 = n - cnt1
  if (cnt1 >= cnt0) {
    return [Math.round(c1r), Math.round(c1g), Math.round(c1b)]
  }
  return [Math.round(c0r), Math.round(c0g), Math.round(c0b)]
}

function sampleMajority(
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  a: Float32Array,
  W: number,
  H: number,
  xCoords: number[],
  yCoords: number[],
  maxSamples = 128,
): ImageData {
  const nx = xCoords.length - 1
  const ny = yCoords.length - 1
  const data = new Uint8ClampedArray(nx * ny * 4)
  const cellBuf = new Float32Array(maxSamples * 3)
  const visiblePixels: number[] = []
  const alphas: number[] = []
  let o = 0

  for (let j = 0; j < ny; j++) {
    const y0 = Math.max(0, Math.min(H, Math.floor(yCoords[j]!)))
    let y1 = Math.max(0, Math.min(H, Math.floor(yCoords[j + 1]!)))
    if (y1 <= y0) y1 = Math.min(y0 + 1, H)
    for (let i = 0; i < nx; i++) {
      const x0 = Math.max(0, Math.min(W, Math.floor(xCoords[i]!)))
      let x1 = Math.max(0, Math.min(W, Math.floor(xCoords[i + 1]!)))
      if (x1 <= x0) x1 = Math.min(x0 + 1, W)
      visiblePixels.length = 0
      alphas.length = 0
      let totalPixels = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          totalPixels++
          const si = y * W + x
          const aa = a[si]!
          if (aa > TRANSPARENT_ALPHA) {
            visiblePixels.push(si)
            alphas.push(aa)
          }
        }
      }
      const visibleN = visiblePixels.length
      if (totalPixels === 0 || visibleN === 0 || visibleN * 2 < totalPixels) {
        data[o] = 0
        data[o + 1] = 0
        data[o + 2] = 0
        data[o + 3] = 0
        o += 4
        continue
      }
      let useN = visibleN
      if (visibleN > maxSamples) {
        useN = maxSamples
        for (let s = 0; s < useN; s++) {
          const pick = visiblePixels[Math.floor(Math.random() * visibleN)]!
          cellBuf[s * 3] = r[pick]!
          cellBuf[s * 3 + 1] = g[pick]!
          cellBuf[s * 3 + 2] = b[pick]!
        }
      } else {
        for (let s = 0; s < visibleN; s++) {
          const pick = visiblePixels[s]!
          cellBuf[s * 3] = r[pick]!
          cellBuf[s * 3 + 1] = g[pick]!
          cellBuf[s * 3 + 2] = b[pick]!
        }
      }
      const [rr, gg, bb] = kmeans2RgbCell(cellBuf.subarray(0, useN * 3), useN)
      alphas.sort((x, y) => x - y)
      data[o++] = rr
      data[o++] = gg
      data[o++] = bb
      data[o++] = Math.round(medianSorted(alphas))
    }
  }
  return new ImageData(data, nx, ny)
}

/** 对齐 Python fix_square：宽高差 1 时微调为更「方」 */
function fixSquareOutput(img: ImageData, fixSquare: boolean): ImageData {
  if (!fixSquare) return img
  const rw0 = img.width
  const rh0 = img.height
  if (Math.abs(rw0 - rh0) !== 1) return img
  const d = img.data

  if (rw0 > rh0) {
    if (rw0 % 2 === 1) {
      const nw = rw0 - 1
      const nd = new Uint8ClampedArray(nw * rh0 * 4)
      for (let y = 0; y < rh0; y++) {
        for (let x = 0; x < nw; x++) {
          const si = (y * rw0 + x) * 4
          const di = (y * nw + x) * 4
          nd[di] = d[si]!
          nd[di + 1] = d[si + 1]!
          nd[di + 2] = d[si + 2]!
          nd[di + 3] = d[si + 3]!
        }
      }
      return new ImageData(nd, nw, rh0)
    }
    const nh = rh0 + 1
    const nd = new Uint8ClampedArray(rw0 * nh * 4)
    for (let x = 0; x < rw0; x++) {
      const si = x * 4
      const di = x * 4
      nd[di] = d[si]!
      nd[di + 1] = d[si + 1]!
      nd[di + 2] = d[si + 2]!
      nd[di + 3] = d[si + 3]!
    }
    for (let y = 1; y < nh; y++) {
      for (let x = 0; x < rw0; x++) {
        const si = ((y - 1) * rw0 + x) * 4
        const di = (y * rw0 + x) * 4
        nd[di] = d[si]!
        nd[di + 1] = d[si + 1]!
        nd[di + 2] = d[si + 2]!
        nd[di + 3] = d[si + 3]!
      }
    }
    return new ImageData(nd, rw0, nh)
  }

  if (rh0 % 2 === 1) {
    const nh = rh0 - 1
    const nd = new Uint8ClampedArray(rw0 * nh * 4)
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < rw0; x++) {
        const si = (y * rw0 + x) * 4
        const di = (y * rw0 + x) * 4
        nd[di] = d[si]!
        nd[di + 1] = d[si + 1]!
        nd[di + 2] = d[si + 2]!
        nd[di + 3] = d[si + 3]!
      }
    }
    return new ImageData(nd, rw0, nh)
  }
  const nw = rw0 + 1
  const nd = new Uint8ClampedArray(nw * rh0 * 4)
  for (let y = 0; y < rh0; y++) {
    const sFirst = (y * rw0) * 4
    const dFirst = (y * nw) * 4
    nd[dFirst] = d[sFirst]!
    nd[dFirst + 1] = d[sFirst + 1]!
    nd[dFirst + 2] = d[sFirst + 2]!
    nd[dFirst + 3] = d[sFirst + 3]!
    for (let x = 0; x < rw0; x++) {
      const s = (y * rw0 + x) * 4
      const di = (y * nw + x + 1) * 4
      nd[di] = d[s]!
      nd[di + 1] = d[s + 1]!
      nd[di + 2] = d[s + 2]!
      nd[di + 3] = d[s + 3]!
    }
  }
  return new ImageData(nd, nw, rh0)
}

/** 最大边长限制，避免主线程长时间卡死 */
export const PERFECT_PIXEL_MAX_SIDE = 2048

export function getPerfectPixel(imageData: ImageData, opts: PerfectPixelOptions = {}): ImageData {
  const W = imageData.width
  const H = imageData.height
  if (W < 4 || H < 4) {
    return new ImageData(new Uint8ClampedArray(W * H * 4), W, H)
  }

  const sampleMethod = opts.sampleMethod ?? 'center'
  const minSize = opts.minSize ?? 4
  const peakWidth = opts.peakWidth ?? 6
  const refineIntensity = opts.refineIntensity ?? 0.25
  const fixSquare = opts.fixSquare ?? true

  const { r, g, b, a, w, h } = rgbaToRgbaFloat(imageData)
  const gray = rgbToGrayFloat32(r, g, b, w * h)

  let sizeX: number
  let sizeY: number
  if (opts.gridSize != null) {
    sizeX = Math.max(2, Math.floor(opts.gridSize.cols))
    sizeY = Math.max(2, Math.floor(opts.gridSize.rows))
  } else {
    const det = detectGridScale(gray, W, H, peakWidth, 1.5, minSize)
    if (det == null) {
      throw new Error('ERR_PERFECT_PIXEL_GRID')
    }
    sizeX = det.gridW
    sizeY = det.gridH
  }

  const { xCoords, yCoords } = refineGrids(gray, W, H, sizeX, sizeY, refineIntensity)

  let out: ImageData
  if (sampleMethod === 'majority') {
    out = sampleMajority(r, g, b, a, W, H, xCoords, yCoords)
  } else if (sampleMethod === 'median') {
    out = sampleMedian(r, g, b, a, W, H, xCoords, yCoords)
  } else {
    out = sampleCenter(r, g, b, a, W, H, xCoords, yCoords)
  }

  return fixSquareOutput(out, fixSquare)
}

export async function perfectPixelImageDataToPngBlob(data: ImageData): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = data.width
  c.height = data.height
  c.getContext('2d')!.putImageData(data, 0, 0)
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/png')
  })
}
