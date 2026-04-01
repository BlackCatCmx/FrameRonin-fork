/** Radix-2 Cooley–Tukey FFT，长度须为 2 的幂 */

function bitReverseIndex(i: number, bits: number): number {
  let x = i
  let y = 0
  for (let b = 0; b < bits; b++) {
    y = (y << 1) | (x & 1)
    x >>= 1
  }
  return y
}

export function fft1d(re: Float64Array, im: Float64Array): void {
  const n = re.length
  if (n <= 1) return
  const bits = Math.log2(n)
  if (!Number.isInteger(bits)) throw new Error('fft1d: n must be power of 2')

  for (let i = 0; i < n; i++) {
    const j = bitReverseIndex(i, bits)
    if (j > i) {
      ;[re[i], re[j]] = [re[j]!, re[i]!]
      ;[im[i], im[j]] = [im[j]!, im[i]!]
    }
  }

  for (let s = 2; s <= n; s <<= 1) {
    const half = s >> 1
    const ang = (-2 * Math.PI) / s
    for (let k = 0; k < n; k += s) {
      for (let j = 0; j < half; j++) {
        const tRe = Math.cos(ang * j)
        const tIm = Math.sin(ang * j)
        const kj = k + j
        const kjh = kj + half
        const uRe = re[kj]!
        const uIm = im[kj]!
        const vRe = re[kjh]!
        const vIm = im[kjh]!
        const tvRe = vRe * tRe - vIm * tIm
        const tvIm = vRe * tIm + vIm * tRe
        re[kjh] = uRe - tvRe
        im[kjh] = uIm - tvIm
        re[kj] = uRe + tvRe
        im[kj] = uIm + tvIm
      }
    }
  }
}

/** 行优先 packed [h][w]，对每行再每列做 1D FFT */
export function fft2d(re: Float64Array, im: Float64Array, w: number, h: number): void {
  const rowRe = new Float64Array(w)
  const rowIm = new Float64Array(w)
  for (let y = 0; y < h; y++) {
    const o = y * w
    for (let x = 0; x < w; x++) {
      rowRe[x] = re[o + x]!
      rowIm[x] = im[o + x]!
    }
    fft1d(rowRe, rowIm)
    for (let x = 0; x < w; x++) {
      re[o + x] = rowRe[x]!
      im[o + x] = rowIm[x]!
    }
  }

  const colRe = new Float64Array(h)
  const colIm = new Float64Array(h)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const o = y * w + x
      colRe[y] = re[o]!
      colIm[y] = im[o]!
    }
    fft1d(colRe, colIm)
    for (let y = 0; y < h; y++) {
      const o = y * w + x
      re[o] = colRe[y]!
      im[o] = colIm[y]!
    }
  }
}

export function fftShift2dMag(re: Float64Array, im: Float64Array, w: number, h: number): Float32Array {
  const hr = Math.floor(h / 2)
  const wr = Math.floor(w / 2)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ys = (y + hr) % h
      const xs = (x + wr) % w
      const i = y * w + x
      const j = ys * w + xs
      const r = re[j]!
      const imj = im[j]!
      out[i] = Math.hypot(r, imj)
    }
  }
  return out
}

export function nextPow2(n: number): number {
  let p = 1
  while (p < n) p <<= 1
  return p
}
