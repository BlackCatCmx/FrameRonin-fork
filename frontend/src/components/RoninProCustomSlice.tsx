import { useEffect, useState } from 'react'
import { Button, InputNumber, message, Space, Tabs, Typography, Upload } from 'antd'
import {
  DeleteOutlined,
  DownloadOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  SaveOutlined,
  ScissorOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import type { UploadFile } from 'antd'
import JSZip from 'jszip'
import { useLanguage } from '../i18n/context'
import StashableImage from './StashableImage'
import StashDropZone from './StashDropZone'

const { Dragger } = Upload
const { Text } = Typography

const IMAGE_ACCEPT = ['.png', '.jpg', '.jpeg', '.webp']
const REARRANGE_STORAGE_KEY = 'roninpro-customslice-rearrange'

/** 找出完全透明的行索引 */
function findTransparentRows(data: Uint8ClampedArray, width: number, height: number): number[] {
  const rows: number[] = []
  for (let y = 0; y < height; y++) {
    let allTransparent = true
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] !== 0) {
        allTransparent = false
        break
      }
    }
    if (allTransparent) rows.push(y)
  }
  return rows
}

/** 找出完全透明的列索引（在 y0..y1 范围内） */
function findTransparentCols(
  data: Uint8ClampedArray,
  width: number,
  y0: number,
  y1: number
): number[] {
  const cols: number[] = []
  for (let x = 0; x < width; x++) {
    let allTransparent = true
    for (let y = y0; y < y1; y++) {
      if (data[(y * width + x) * 4 + 3] !== 0) {
        allTransparent = false
        break
      }
    }
    if (allTransparent) cols.push(x)
  }
  return cols
}

function getRuns(arr: number[]): [number, number][] {
  if (arr.length === 0) return []
  const runs: [number, number][] = []
  let runStart = arr[0]!
  let runEnd = runStart
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === runEnd + 1) {
      runEnd = arr[i]!
    } else {
      runs.push([runStart, runEnd])
      runStart = arr[i]!
      runEnd = runStart
    }
  }
  runs.push([runStart, runEnd])
  return runs
}

function gapsFromRuns(runs: [number, number][], total: number): [number, number][] {
  if (runs.length === 0) return [[0, total - 1]]
  const regions: [number, number][] = []
  regions.push([0, runs[0]![0] - 1])
  for (let i = 0; i < runs.length - 1; i++) {
    regions.push([runs[i]![1] + 1, runs[i + 1]![0] - 1])
  }
  regions.push([runs[runs.length - 1]![1] + 1, total - 1])
  return regions.filter(([a, b]) => a <= b)
}

/** 基于透明行列检测，返回建议的 cols × rows（用于均匀切分） */
function detectAutoSplit(imageData: ImageData): { cols: number; rows: number } {
  const { data, width, height } = imageData
  const transparentRows = findTransparentRows(data, width, height)
  const rowRuns = getRuns(transparentRows)
  const rowRegions = gapsFromRuns(rowRuns, height)
  const transparentCols = findTransparentCols(data, width, 0, height)
  const colRuns = getRuns(transparentCols)
  const colRegions = gapsFromRuns(colRuns, width)
  const rows = Math.max(1, rowRegions.length)
  const cols = Math.max(1, colRegions.length)
  return { cols, rows }
}

interface Region {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** 网格均匀切分 */
function splitSpriteSheet(
  img: HTMLImageElement,
  cols: number,
  rows: number
): HTMLCanvasElement[] {
  const fullW = img.naturalWidth
  const fullH = img.naturalHeight
  const colsNum = Math.max(1, Math.floor(cols))
  const rowsNum = Math.max(1, Math.floor(rows))
  const results: HTMLCanvasElement[] = []

  for (let row = 0; row < rowsNum; row++) {
    for (let col = 0; col < colsNum; col++) {
      const sx = Math.floor((col * fullW) / colsNum)
      const ex = Math.floor(((col + 1) * fullW) / colsNum)
      const sy = Math.floor((row * fullH) / rowsNum)
      const ey = Math.floor(((row + 1) * fullH) / rowsNum)
      const w = Math.max(1, ex - sx)
      const h = Math.max(1, ey - sy)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      c.getContext('2d')!.drawImage(img, sx, sy, w, h, 0, 0, w, h)
      results.push(c)
    }
  }
  return results
}

/** 按自定义区域切分 */
function splitByRegions(img: HTMLImageElement, regions: Region[]): HTMLCanvasElement[] {
  const results: HTMLCanvasElement[] = []
  const fullW = img.naturalWidth
  const fullH = img.naturalHeight

  for (const r of regions) {
    const x = Math.max(0, Math.floor(r.x))
    const y = Math.max(0, Math.floor(r.y))
    const w = Math.max(1, Math.min(Math.floor(r.w), fullW - x))
    const h = Math.max(1, Math.min(Math.floor(r.h), fullH - y))

    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    c.getContext('2d')!.drawImage(img, x, y, w, h, 0, 0, w, h)
    results.push(c)
  }
  return results
}

export default function RoninProCustomSlice() {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<'grid' | 'custom' | 'auto'>('auto')
  const [spriteFile, setSpriteFile] = useState<File | null>(null)
  const [spritePreviewUrl, setSpritePreviewUrl] = useState<string | null>(null)
  const [columns, setColumns] = useState(8)
  const [rows, setRows] = useState(4)
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(false)
  const [zipUrl, setZipUrl] = useState<string | null>(null)
  const [framePreviewUrls, setFramePreviewUrls] = useState<string[]>([])
  const [frameBlobUrls, setFrameBlobUrls] = useState<string[]>([])
  const [frameSizes, setFrameSizes] = useState<{ w: number; h: number }[]>([])
  const [rearrangeRows, setRearrangeRows] = useState(() => {
    try {
      const s = localStorage.getItem(REARRANGE_STORAGE_KEY)
      if (!s) return 2
      const parsed = JSON.parse(s) as { rows?: number; cols?: number; grid?: number[][] }
      return typeof parsed.rows === 'number' && parsed.rows >= 1 && parsed.rows <= 64 ? parsed.rows : 2
    } catch {
      return 2
    }
  })
  const [rearrangeCols, setRearrangeCols] = useState(() => {
    try {
      const s = localStorage.getItem(REARRANGE_STORAGE_KEY)
      if (!s) return 4
      const parsed = JSON.parse(s) as { rows?: number; cols?: number; grid?: number[][] }
      return typeof parsed.cols === 'number' && parsed.cols >= 1 && parsed.cols <= 64 ? parsed.cols : 4
    } catch {
      return 4
    }
  })
  const [rearrangeGrid, setRearrangeGrid] = useState<number[][]>(() => {
    try {
      const s = localStorage.getItem(REARRANGE_STORAGE_KEY)
      if (!s) return [[]]
      const parsed = JSON.parse(s) as { rows?: number; cols?: number; grid?: number[][] }
      const g = parsed.grid
      if (!Array.isArray(g) || g.length === 0) return [[]]
      const next = g.map((row: unknown) =>
        Array.isArray(row)
          ? row.map((v) => (typeof v === 'number' ? Math.floor(v) : 0))
          : []
      )
      return next.length > 0 ? next : [[]]
    } catch {
      return [[]]
    }
  })
  const [composedUrl, setComposedUrl] = useState<string | null>(null)
  const [expandUp, setExpandUp] = useState(0)
  const [expandDown, setExpandDown] = useState(0)
  const [expandLeft, setExpandLeft] = useState(0)
  const [expandRight, setExpandRight] = useState(0)
  const [expandMode, setExpandMode] = useState<'all' | 'heightUpOnly'>('all')

  useEffect(() => {
    if (spriteFile) {
      const url = URL.createObjectURL(spriteFile)
      setSpritePreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setSpritePreviewUrl(null)
  }, [spriteFile])

  const revokePreviews = () => {
    setFramePreviewUrls((urls) => {
      urls.forEach(URL.revokeObjectURL)
      return []
    })
    setFrameBlobUrls((urls) => {
      urls.forEach(URL.revokeObjectURL)
      return []
    })
    setZipUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    setComposedUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
  }

  useEffect(() => () => revokePreviews(), [])

  useEffect(() => {
    try {
      localStorage.setItem(
        REARRANGE_STORAGE_KEY,
        JSON.stringify({
          rows: rearrangeRows,
          cols: rearrangeCols,
          grid: rearrangeGrid,
        })
      )
    } catch {
      /* ignore */
    }
  }, [rearrangeRows, rearrangeCols, rearrangeGrid])

  useEffect(() => {
    if (!spriteFile || activeTab !== 'auto') return
    void runSplit()
  }, [spriteFile, activeTab])

  const addRegion = () => {
    setRegions((prev) => [
      ...prev,
      { id: `r-${Date.now()}`, x: 0, y: 0, w: 32, h: 32 },
    ])
  }

  const updateRegion = (id: string, field: keyof Region, value: number) => {
    if (field === 'id') return
    setRegions((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    )
  }

  const removeRegion = (id: string) => {
    setRegions((prev) => prev.filter((r) => r.id !== id))
  }

  const runSplit = async () => {
    if (!spriteFile) return
    setLoading(true)
    revokePreviews()
    try {
      const buf = await spriteFile.arrayBuffer()
      const url = URL.createObjectURL(new Blob([buf]))
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image()
        i.onload = () => res(i)
        i.onerror = () => rej(new Error('load'))
        i.src = url
      })
      URL.revokeObjectURL(url)

      let frames: HTMLCanvasElement[]
      if (activeTab === 'auto') {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const srcData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const { cols, rows } = detectAutoSplit(srcData)
        setColumns(cols)
        setRows(rows)
        frames = splitSpriteSheet(img, cols, rows)
        message.success(t('roninProCustomSliceAutoDetected', { cols, rows, n: frames.length }))
      } else if (activeTab === 'grid') {
        frames = splitSpriteSheet(img, columns, rows)
      } else {
        frames = splitByRegions(img, regions)
      }

      if (frames.length === 0) {
        message.warning(t('roninProCustomSliceNoFrames'))
        setLoading(false)
        return
      }

      const zip = new JSZip()
      const allBlobUrls: string[] = []
      const sizes: { w: number; h: number }[] = []
      const previewUrls: string[] = []
      const maxPreview = 24
      for (let i = 0; i < frames.length; i++) {
        const blob = await new Promise<Blob>((resolve, reject) => {
          frames[i].toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/png')
        })
        zip.file(`frame_${String(i).padStart(3, '0')}.png`, blob)
        const url = URL.createObjectURL(blob)
        allBlobUrls.push(url)
        sizes.push({ w: frames[i].width, h: frames[i].height })
        if (previewUrls.length < maxPreview) {
          previewUrls.push(url)
        }
      }
      setFrameBlobUrls(allBlobUrls)
      setFrameSizes(sizes)
      setFramePreviewUrls(previewUrls)
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      setZipUrl(URL.createObjectURL(zipBlob))
      const r = activeTab === 'custom' ? Math.max(1, Math.ceil(Math.sqrt(frames.length))) : rows
      const c = activeTab === 'custom' ? Math.ceil(frames.length / r) : columns
      setRearrangeRows(r)
      setRearrangeCols(c)
      const grid: number[][] = []
      let idx = 1
      for (let row = 0; row < r; row++) {
        const rowData: number[] = []
        for (let col = 0; col < c; col++) {
          rowData.push(idx <= frames.length ? idx : 0)
          idx++
        }
        grid.push(rowData)
      }
      setRearrangeGrid(grid)
      if (activeTab !== 'auto') {
        message.success(t('spriteSplitSuccess', { n: frames.length }))
      }
    } catch (e) {
      message.error(t('spriteSplitFailed') + ': ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  const downloadZip = () => {
    if (!zipUrl) return
    const a = document.createElement('a')
    a.href = zipUrl
    a.download = (spriteFile?.name?.replace(/\.[^.]+$/, '') || 'slices') + '_frames.zip'
    a.click()
  }

  const updateRearrangeGridSize = (newRows: number, newCols: number) => {
    setRearrangeGrid((prev) => {
      const next: number[][] = []
      const maxVal = frameBlobUrls.length
      for (let row = 0; row < newRows; row++) {
        const rowData: number[] = []
        for (let col = 0; col < newCols; col++) {
          const v = prev[row]?.[col]
          const valid = v !== undefined && v >= -maxVal && v <= maxVal && v !== 0
          rowData.push(valid ? v! : 0)
        }
        next.push(rowData)
      }
      return next
    })
  }

  const setRearrangeRowsAndResize = (v: number) => {
    const r = Math.max(1, Math.min(64, v))
    setRearrangeRows(r)
    updateRearrangeGridSize(r, rearrangeCols)
  }

  const setRearrangeColsAndResize = (v: number) => {
    const c = Math.max(1, Math.min(64, v))
    setRearrangeCols(c)
    updateRearrangeGridSize(rearrangeRows, c)
  }

  const saveRearrangeToTxt = () => {
    const data = JSON.stringify(
      { rows: rearrangeRows, cols: rearrangeCols, grid: rearrangeGrid },
      null,
      2
    )
    const blob = new Blob([data], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'rearrange_params.txt'
    a.click()
    URL.revokeObjectURL(url)
    message.success(t('roninProCustomSliceRearrangeSaveSuccess'))
  }

  const loadRearrangeFromTxt = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt,text/plain'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const parsed = JSON.parse(text) as {
          rows?: number
          cols?: number
          grid?: number[][]
        }
        const r = Math.max(1, Math.min(64, parsed.rows ?? 2))
        const c = Math.max(1, Math.min(64, parsed.cols ?? 4))
        const raw = Array.isArray(parsed.grid)
          ? parsed.grid.map((row: unknown) =>
              Array.isArray(row)
                ? row.map((v) => (typeof v === 'number' ? Math.floor(v) : 0))
                : []
            )
          : []
        const trimmed: number[][] = []
        for (let row = 0; row < r; row++) {
          const rowData: number[] = []
          for (let col = 0; col < c; col++) {
            const v = raw[row]?.[col]
            rowData.push(v !== undefined ? v : 0)
          }
          trimmed.push(rowData)
        }
        setRearrangeRows(r)
        setRearrangeCols(c)
        setRearrangeGrid(trimmed.length > 0 ? trimmed : [[]])
        message.success(t('roninProCustomSliceRearrangeLoadSuccess'))
      } catch {
        message.error(t('roninProCustomSliceRearrangeLoadFailed'))
      }
    }
    input.click()
  }

  const setGridCell = (row: number, col: number, value: number) => {
    const maxVal = frameBlobUrls.length
    setRearrangeGrid((prev) => {
      const next = prev.map((r) => [...r])
      if (!next[row]) next[row] = []
      const v = Math.floor(value)
      const clamped = Math.max(-maxVal, Math.min(maxVal, v))
      next[row]![col] = clamped === 0 ? 0 : clamped
      return next
    })
  }

  const runCompose = async () => {
    if (frameBlobUrls.length === 0 || frameSizes.length === 0) return
    setComposedUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    const cellW = Math.max(...frameSizes.map((s) => s.w))
    const cellH = Math.max(...frameSizes.map((s) => s.h))
    const paddedCellW = cellW + expandLeft + expandRight
    const paddedCellH = cellH + expandUp + expandDown
    const outW = rearrangeCols * paddedCellW
    const outH = rearrangeRows * paddedCellH
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false

    const loadImage = (url: string) =>
      new Promise<HTMLImageElement>((res, rej) => {
        const img = new Image()
        img.onload = () => res(img)
        img.onerror = () => rej(new Error('load'))
        img.src = url
      })

    try {
      for (let row = 0; row < rearrangeRows; row++) {
        for (let col = 0; col < rearrangeCols; col++) {
          const val = rearrangeGrid[row]?.[col] ?? 0
          const absVal = Math.abs(val)
          if (absVal === 0 || absVal > frameBlobUrls.length) continue
          const img = await loadImage(frameBlobUrls[absVal - 1]!)
          const dx = col * paddedCellW + expandLeft
          const dy = row * paddedCellH + expandUp
          const flipH = val < 0
          if (flipH) {
            ctx.save()
            ctx.translate(dx + cellW, dy)
            ctx.scale(-1, 1)
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, cellW, cellH)
            ctx.restore()
          } else {
            ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, cellW, cellH)
          }
        }
      }
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/png', 0.95)
      })
      setComposedUrl(URL.createObjectURL(blob))
      message.success(t('roninProCustomSliceComposed'))
    } catch (e) {
      message.error(t('roninProCustomSliceComposeFailed') + ': ' + String(e))
    }
  }

  const downloadComposed = () => {
    if (!composedUrl) return
    const a = document.createElement('a')
    a.href = composedUrl
    a.download = (spriteFile?.name?.replace(/\.[^.]+$/, '') || 'slices') + '_composed.png'
    a.click()
    message.success(t('downloadStarted'))
  }

  const applyExpandPreset = (targetW: number, targetH?: number) => {
    if (frameSizes.length === 0) return
    const cellW = Math.max(...frameSizes.map((s) => s.w))
    const cellH = Math.max(...frameSizes.map((s) => s.h))
    const w = targetH === undefined ? targetW : targetW
    const h = targetH === undefined ? targetW : targetH
    const addW = Math.max(0, w - cellW)
    const addH = Math.max(0, h - cellH)
    setExpandLeft(Math.ceil(addW / 2))
    setExpandRight(Math.floor(addW / 2))
    if (expandMode === 'heightUpOnly') {
      setExpandUp(addH)
      setExpandDown(0)
    } else {
      setExpandUp(Math.ceil(addH / 2))
      setExpandDown(Math.floor(addH / 2))
    }
  }

  const cellW = frameSizes.length > 0 ? Math.max(...frameSizes.map((s) => s.w)) : 0
  const cellH = frameSizes.length > 0 ? Math.max(...frameSizes.map((s) => s.h)) : 0
  const paddedCellW = cellW + expandLeft + expandRight
  const paddedCellH = cellH + expandUp + expandDown
  const composedOutW = rearrangeCols * paddedCellW
  const composedOutH = rearrangeRows * paddedCellH

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Text type="secondary">{t('roninProCustomSliceHint')}</Text>

      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as 'grid' | 'custom' | 'auto')}
        items={[
          {
            key: 'auto',
            label: (
              <span>
                <ThunderboltOutlined /> {t('roninProCustomSliceAuto')}
              </span>
            ),
            children: (
              <Space direction="vertical">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('roninProCustomSliceAutoHint')}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('roninProCustomSliceAutoDetectHint')}
                </Text>
              </Space>
            ),
          },
          {
            key: 'grid',
            label: (
              <span>
                <ScissorOutlined /> {t('roninProCustomSliceGrid')}
              </span>
            ),
            children: (
              <Space direction="vertical">
                <Space wrap>
                  <span>
                    <Text type="secondary">{t('spriteColumns')}:</Text>
                    <InputNumber
                      min={1}
                      max={64}
                      value={columns}
                      onChange={(v) => setColumns(v ?? 8)}
                      style={{ width: 80, marginLeft: 8 }}
                    />
                  </span>
                  <span>
                    <Text type="secondary">{t('spriteRows')}:</Text>
                    <InputNumber
                      min={1}
                      max={64}
                      value={rows}
                      onChange={(v) => setRows(v ?? 4)}
                      style={{ width: 80, marginLeft: 8 }}
                    />
                  </span>
                </Space>
              </Space>
            ),
          },
          {
            key: 'custom',
            label: (
              <span>
                <ScissorOutlined /> {t('roninProCustomSliceRegions')}
              </span>
            ),
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button type="dashed" icon={<PlusOutlined />} onClick={addRegion}>
                  {t('roninProCustomSliceAddRegion')}
                </Button>
                {regions.length === 0 && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('roninProCustomSliceAddRegionHint')}
                  </Text>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {regions.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        alignItems: 'center',
                        padding: 8,
                        background: 'rgba(0,0,0,0.04)',
                        borderRadius: 8,
                      }}
                    >
                      <InputNumber
                        size="small"
                        addonBefore="X"
                        value={r.x}
                        min={0}
                        onChange={(v) => updateRegion(r.id, 'x', v ?? 0)}
                        style={{ width: 90 }}
                      />
                      <InputNumber
                        size="small"
                        addonBefore="Y"
                        value={r.y}
                        min={0}
                        onChange={(v) => updateRegion(r.id, 'y', v ?? 0)}
                        style={{ width: 90 }}
                      />
                      <InputNumber
                        size="small"
                        addonBefore="W"
                        value={r.w}
                        min={1}
                        onChange={(v) => updateRegion(r.id, 'w', v ?? 32)}
                        style={{ width: 90 }}
                      />
                      <InputNumber
                        size="small"
                        addonBefore="H"
                        value={r.h}
                        min={1}
                        onChange={(v) => updateRegion(r.id, 'h', v ?? 32)}
                        style={{ width: 90 }}
                      />
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => removeRegion(r.id)}
                      />
                    </div>
                  ))}
                </div>
              </Space>
            ),
          },
        ]}
      />

      <StashDropZone
        onStashDrop={(f) => {
          setSpriteFile(f)
          revokePreviews()
        }}
      >
        <Dragger
          accept={IMAGE_ACCEPT.join(',')}
          maxCount={1}
          fileList={spriteFile ? [{ uid: '1', name: spriteFile.name } as UploadFile] : []}
          beforeUpload={(f) => {
            setSpriteFile(f)
            revokePreviews()
            return false
          }}
          onRemove={() => setSpriteFile(null)}
        >
          <p className="ant-upload-text">{t('spriteUploadHint')}</p>
        </Dragger>
      </StashDropZone>

      {spriteFile && spritePreviewUrl && (
        <>
          <Text strong>{t('imgOriginalPreview')}</Text>
          <div
            style={{
              padding: 16,
              background: 'repeating-conic-gradient(#c9bfb0 0% 25%, #e4dbcf 0% 50%) 50% / 16px 16px',
              borderRadius: 8,
              border: '1px solid #9a8b78',
              display: 'inline-block',
            }}
          >
            <StashableImage
              src={spritePreviewUrl}
              alt=""
              style={{ maxWidth: 320, maxHeight: 240, display: 'block', imageRendering: 'pixelated' }}
            />
          </div>
        </>
      )}

      <Space>
        <Button
          type="primary"
          loading={loading}
          onClick={runSplit}
          disabled={
            !spriteFile ||
            (activeTab === 'custom' && regions.length === 0)
          }
        >
          {activeTab === 'auto' ? t('roninProCustomSliceAutoSplit') : t('spriteSplit')}
        </Button>
        {zipUrl && (
          <Button icon={<DownloadOutlined />} onClick={downloadZip}>
            {t('gifDownloadFrames')}
          </Button>
        )}
      </Space>

      {framePreviewUrls.length > 0 && (
        <>
          <Text strong>{t('imgPreview')} ({t('roninProCustomSliceFrameIndex')}: 1~{frameBlobUrls.length}, 0={t('roninProCustomSliceTransparent')}, {t('roninProCustomSliceFrameIndexFlipHint')})</Text>
          <div
            style={{
              padding: 16,
              background: 'repeating-conic-gradient(#c9bfb0 0% 25%, #e4dbcf 0% 50%) 50% / 16px 16px',
              borderRadius: 8,
              border: '1px solid #9a8b78',
              display: 'inline-block',
              maxWidth: '100%',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                maxHeight: 320,
                overflow: 'auto',
              }}
            >
              {framePreviewUrls.map((url, i) => (
                <div key={i} style={{ position: 'relative', display: 'inline-block' }}>
                  <StashableImage
                    src={url}
                    alt={`frame ${i}`}
                    style={{
                      width: 48,
                      height: 48,
                      objectFit: 'contain',
                      imageRendering: 'pixelated',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      left: 2,
                      top: 2,
                      fontSize: 10,
                      fontWeight: 'bold',
                      color: '#fff',
                      textShadow: '0 0 2px #000, 0 0 2px #000',
                    }}
                  >
                    {i + 1}
                  </span>
                </div>
              ))}
              {frameBlobUrls.length > 24 && (
                <span style={{ alignSelf: 'center', color: '#999', fontSize: 12 }}>
                  ... +{frameBlobUrls.length - 24}
                </span>
              )}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <Text strong>{t('roninProCustomSliceRearrange')}</Text>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
              <span>
                <Text type="secondary">{t('roninProCustomSliceRearrangeRows')}:</Text>
                <InputNumber
                  min={1}
                  max={64}
                  value={rearrangeRows}
                  onChange={(v) => setRearrangeRowsAndResize(v ?? 1)}
                  style={{ width: 64, marginLeft: 8 }}
                />
              </span>
              <span>
                <Text type="secondary">{t('roninProCustomSliceRearrangeCols')}:</Text>
                <InputNumber
                  min={1}
                  max={64}
                  value={rearrangeCols}
                  onChange={(v) => setRearrangeColsAndResize(v ?? 1)}
                  style={{ width: 64, marginLeft: 8 }}
                />
              </span>
              <Button icon={<SaveOutlined />} onClick={saveRearrangeToTxt}>
                {t('roninProCustomSliceRearrangeSaveToTxt')}
              </Button>
              <Button icon={<FolderOpenOutlined />} onClick={loadRearrangeFromTxt}>
                {t('roninProCustomSliceRearrangeLoadFromTxt')}
              </Button>
              <Button type="primary" onClick={runCompose}>
                {t('roninProCustomSliceCompose')}
              </Button>
              {composedUrl && (
                <Button icon={<DownloadOutlined />} onClick={downloadComposed}>
                  {t('roninProCustomSliceDownloadComposed')}
                </Button>
              )}
            </div>
            <div style={{ marginTop: 8, overflowX: 'auto' }}>
              <table
                style={{
                  borderCollapse: 'collapse',
                  fontSize: 12,
                  background: '#fff',
                  border: '1px solid #d9d9d9',
                }}
              >
                <tbody>
                  {rearrangeGrid.map((rowData, row) => (
                    <tr key={row}>
                      {rowData.map((val, col) => (
                        <td
                          key={col}
                          style={{
                            border: '1px solid #d9d9d9',
                            padding: 2,
                          }}
                        >
                          <InputNumber
                            size="small"
                            min={-frameBlobUrls.length}
                            max={frameBlobUrls.length}
                            value={val}
                            onChange={(v) => setGridCell(row, col, v ?? 0)}
                            style={{ width: 52 }}
                            placeholder="0"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 16 }}>
              <Text strong>{t('roninProCustomSliceExpand')}</Text>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>{t('roninProCustomSliceExpandMode')}:</Text>
                <Button.Group size="small">
                  <Button type={expandMode === 'all' ? 'primary' : 'default'} onClick={() => setExpandMode('all')}>
                    {t('roninProCustomSliceExpandModeAll')}
                  </Button>
                  <Button type={expandMode === 'heightUpOnly' ? 'primary' : 'default'} onClick={() => setExpandMode('heightUpOnly')}>
                    {t('roninProCustomSliceExpandModeHeightUpOnly')}
                  </Button>
                </Button.Group>
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                <span>
                  <Text type="secondary">{t('roninProCustomSliceExpandUp')}:</Text>
                  <InputNumber
                    min={0}
                    max={128}
                    value={expandUp}
                    onChange={(v) => setExpandUp(v ?? 0)}
                    style={{ width: 56, marginLeft: 6 }}
                  />
                </span>
                <span>
                  <Text type="secondary">{t('roninProCustomSliceExpandDown')}:</Text>
                  <InputNumber
                    min={0}
                    max={128}
                    value={expandDown}
                    onChange={(v) => setExpandDown(v ?? 0)}
                    style={{ width: 56, marginLeft: 6 }}
                  />
                </span>
                <span>
                  <Text type="secondary">{t('roninProCustomSliceExpandLeft')}:</Text>
                  <InputNumber
                    min={0}
                    max={128}
                    value={expandLeft}
                    onChange={(v) => setExpandLeft(v ?? 0)}
                    style={{ width: 56, marginLeft: 6 }}
                  />
                </span>
                <span>
                  <Text type="secondary">{t('roninProCustomSliceExpandRight')}:</Text>
                  <InputNumber
                    min={0}
                    max={128}
                    value={expandRight}
                    onChange={(v) => setExpandRight(v ?? 0)}
                    style={{ width: 56, marginLeft: 6 }}
                  />
                </span>
              </div>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>{t('roninProCustomSliceExpandPreset')}:</Text>
                {[32, 48, 64, 96, 128, 144, 150].map((n) => (
                  <Button key={n} size="small" onClick={() => applyExpandPreset(n)}>
                    {n}×{n}
                  </Button>
                ))}
                <Button size="small" onClick={() => applyExpandPreset(32, 64)}>
                  32×64
                </Button>
              </div>
              <Text type="secondary" style={{ marginTop: 8, fontSize: 12, display: 'block' }}>
                {t('roninProCustomSliceExpandSizeHint', {
                  cellW: paddedCellW,
                  cellH: paddedCellH,
                  outW: composedOutW,
                  outH: composedOutH,
                })}
              </Text>
            </div>

            {composedUrl && (
              <div style={{ marginTop: 12 }}>
                <Text strong>{t('roninProCustomSliceComposedPreview')}</Text>
                <div
                  style={{
                    marginTop: 8,
                    padding: 16,
                    background: 'repeating-conic-gradient(#c9bfb0 0% 25%, #e4dbcf 0% 50%) 50% / 16px 16px',
                    borderRadius: 8,
                    border: '1px solid #9a8b78',
                    display: 'inline-block',
                  }}
                >
                  <StashableImage
                    src={composedUrl}
                    alt="composed"
                    style={{ maxWidth: 320, maxHeight: 240, display: 'block', imageRendering: 'pixelated' }}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </Space>
  )
}
