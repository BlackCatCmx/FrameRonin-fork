/**
 * 与 GIF 工具「简易拼接 → 上下拼接」相同：取最大宽度，高度累加，每张水平居中后自上而下绘制。
 */
export async function stitchVerticalImageBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) throw new Error('STITCH_VERTICAL_EMPTY')
  if (blobs.length === 1) return blobs[0]!

  const imgs: HTMLImageElement[] = []
  for (const blob of blobs) {
    const url = URL.createObjectURL(blob)
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image()
        i.onload = () => res(i)
        i.onerror = () => rej(new Error('load'))
        i.src = url
      })
      imgs.push(img)
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const outW = Math.max(...imgs.map((i) => i.naturalWidth))
  const outH = imgs.reduce((s, i) => s + i.naturalHeight, 0)
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('STITCH_VERTICAL_NO_CTX')

  let dy = 0
  for (const img of imgs) {
    const w = img.naturalWidth
    const h = img.naturalHeight
    const dx = (outW - w) / 2
    ctx.drawImage(img, 0, 0, w, h, dx, dy, w, h)
    dy += h
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('STITCH_VERTICAL_TOBLOB'))), 'image/png')
  })
}
