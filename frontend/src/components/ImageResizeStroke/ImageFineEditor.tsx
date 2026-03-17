import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, ColorPicker, Slider, Space, Typography } from 'antd'
import { AimOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, UndoOutlined } from '@ant-design/icons'
import { useLanguage } from '../../i18n/context'

const { Text } = Typography

type Tool = 'brush' | 'eraser' | 'superEraser'

interface ImageFineEditorProps {
  imageUrl: string
  onExport?: (blob: Blob) => void
}

export default function ImageFineEditor({ imageUrl, onExport }: ImageFineEditorProps) {
  const { t } = useLanguage()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tool, setTool] = useState<Tool>('eraser')
  const [brushColor, setBrushColor] = useState('#000000')
  const [brushSize, setBrushSize] = useState(4)
  const [eraserSize, setEraserSize] = useState(8)
  const [superEraserTolerance, setSuperEraserTolerance] = useState(30)
  const [bgColorEnabled, setBgColorEnabled] = useState(false)
  const [bgColor, setBgColor] = useState('#22c55e')
  const [drawing, setDrawing] = useState(false)
  const [panning, setPanning] = useState(false)
  const lastPanRef = useRef({ x: 0, y: 0 })
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [fitScale, setFitScale] = useState(1)
  const [zoomFactor, setZoomFactor] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const saveDataRef = useRef<ImageData | null>(null)
  const historyRef = useRef<ImageData[]>([])
  const [historyLength, setHistoryLength] = useState(0)
  const MAX_HISTORY = 30
  const zoomFactorRef = useRef(1)
  const fitScaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  zoomFactorRef.current = zoomFactor
  fitScaleRef.current = fitScale
  offsetRef.current = offset

  const displayScale = fitScale * zoomFactor

  const eraserCursor = useCallback(() => {
    const d = Math.min(128, Math.max(2, Math.ceil(eraserSize * displayScale)))
    const r = d / 2
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}"><circle cx="${r}" cy="${r}" r="${r - 1}" fill="none" stroke="#333" stroke-width="2"/></svg>`
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${r} ${r}, cell`
  }, [eraserSize, displayScale])

  useEffect(() => {
    if (!imageUrl) {
      setImgSize(null)
      setLoadError(false)
      return
    }
    setImgSize(null)
    setLoadError(false)
    const img = new Image()
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      setImgSize({ w, h })
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0)
      const id = ctx.getImageData(0, 0, w, h)
      saveDataRef.current = id
      historyRef.current = [new ImageData(new Uint8ClampedArray(id.data), id.width, id.height)]
      setHistoryLength(1)
    }
    img.onerror = () => setLoadError(true)
    img.src = imageUrl
  }, [imageUrl, reloadKey])

  useEffect(() => {
    if (!containerRef.current || !imgSize) return
    const el = containerRef.current
    const updateFitScale = () => {
      const cw = el.clientWidth
      const ch = el.clientHeight
      if (cw <= 0 || ch <= 0) return
      const sx = cw / imgSize.w
      const sy = ch / imgSize.h
      const s = Math.min(sx, sy)
      const z = zoomFactorRef.current
      const ds = s * z
      const off = { x: (cw - imgSize.w * ds) / 2, y: (ch - imgSize.h * ds) / 2 }
      fitScaleRef.current = s
      offsetRef.current = off
      setFitScale(s)
      setOffset(off)
    }
    updateFitScale()
    const ro = new ResizeObserver(updateFitScale)
    ro.observe(el)
    return () => ro.disconnect()
  }, [imgSize])

  const pushHistory = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !imgSize) return
    const id = ctx.getImageData(0, 0, imgSize.w, imgSize.h)
    const clone = new ImageData(new Uint8ClampedArray(id.data), id.width, id.height)
    const h = historyRef.current
    h.push(clone)
    if (h.length > MAX_HISTORY) h.shift()
    setHistoryLength(h.length)
  }, [imgSize])

  const handleUndo = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const h = historyRef.current
    if (!ctx || !imgSize || h.length <= 1) return
    const prev = h[h.length - 1]
    if (prev) ctx.putImageData(prev, 0, 0)
    h.pop()
    setHistoryLength(h.length)
  }, [imgSize])

  const screenToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      if (!canvasRef.current || !containerRef.current) return null
      const el = containerRef.current
      const rect = el.getBoundingClientRect()
      const cx = clientX - rect.left - el.clientLeft
      const cy = clientY - rect.top - el.clientTop
      const x = (cx - offset.x) / displayScale
      const y = (cy - offset.y) / displayScale
      if (x < 0 || x >= (imgSize?.w ?? 0) || y < 0 || y >= (imgSize?.h ?? 0)) return null
      return { x: Math.floor(x), y: Math.floor(y) }
    },
    [offset, displayScale, imgSize]
  )

  const superEraserAt = useCallback(
    (px: number, py: number) => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!ctx || !imgSize) return
      const data = ctx.getImageData(0, 0, imgSize.w, imgSize.h)
      const w = imgSize.w
      const h = imgSize.h
      const idx = (py * w + px) * 4
      const r0 = data.data[idx]
      const g0 = data.data[idx + 1]
      const b0 = data.data[idx + 2]
      const a0 = data.data[idx + 3]
      if (a0 === 0) return
      const tol = superEraserTolerance
      const tol2 = tol * tol
      const dist2 = (r1: number, g1: number, b1: number) =>
        (r1 - r0) ** 2 + (g1 - g0) ** 2 + (b1 - b0) ** 2
      const visited = new Uint8Array(w * h)
      const stack: [number, number][] = [[px, py]]
      visited[py * w + px] = 1
      const dx = [0, 1, 0, -1]
      const dy = [-1, 0, 1, 0]
      while (stack.length > 0) {
        const [x, y] = stack.pop()!
        const i = (y * w + x) * 4
        data.data[i + 3] = 0
        for (let k = 0; k < 4; k++) {
          const nx = x + dx[k]
          const ny = y + dy[k]
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
          const ni = ny * w + nx
          if (visited[ni]) continue
          const ai = (ni * 4) + 3
          if (data.data[ai] === 0) continue
          const ri = data.data[ni * 4]
          const gi = data.data[ni * 4 + 1]
          const bi = data.data[ni * 4 + 2]
          if (dist2(ri, gi, bi) <= tol2) {
            visited[ni] = 1
            stack.push([nx, ny])
          }
        }
      }
      ctx.putImageData(data, 0, 0)
    },
    [imgSize, superEraserTolerance]
  )

  const drawAt = useCallback(
    (px: number, py: number) => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!ctx || !imgSize) return
      if (tool === 'brush') {
        let r = 0, g = 0, b = 0
        const m = String(brushColor).match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
        if (m) {
          r = parseInt(m[1], 16)
          g = parseInt(m[2], 16)
          b = parseInt(m[3], 16)
        } else {
          const tmp = document.createElement('canvas')
          tmp.width = tmp.height = 1
          const tctx = tmp.getContext('2d')
          if (tctx) {
            tctx.fillStyle = String(brushColor)
            tctx.fillRect(0, 0, 1, 1)
            const d = tctx.getImageData(0, 0, 1, 1).data
            r = d[0]; g = d[1]; b = d[2]
          }
        }
        const data = ctx.getImageData(0, 0, imgSize.w, imgSize.h)
        const cx = px + 0.5
        const cy = py + 0.5
        const size = brushSize
        const radius = size / 2
        const r2 = radius * radius
        const rad = Math.ceil(radius)
        for (let iy = Math.max(0, py - rad); iy <= Math.min(imgSize.h - 1, py + rad); iy++) {
          for (let ix = Math.max(0, px - rad); ix <= Math.min(imgSize.w - 1, px + rad); ix++) {
            const dx = ix + 0.5 - cx
            const dy = iy + 0.5 - cy
            if (dx * dx + dy * dy <= r2) {
              const i = (iy * imgSize.w + ix) * 4
              data.data[i] = r
              data.data[i + 1] = g
              data.data[i + 2] = b
              data.data[i + 3] = 255
            }
          }
        }
        ctx.putImageData(data, 0, 0)
      } else {
        const data = ctx.getImageData(0, 0, imgSize.w, imgSize.h)
        const cx = px + 0.5
        const cy = py + 0.5
        const size = eraserSize
        const r = size / 2
        const r2 = r * r
        const rad = Math.ceil(r)
        for (let iy = Math.max(0, py - rad); iy <= Math.min(imgSize.h - 1, py + rad); iy++) {
          for (let ix = Math.max(0, px - rad); ix <= Math.min(imgSize.w - 1, px + rad); ix++) {
            const dx = ix + 0.5 - cx
            const dy = iy + 0.5 - cy
            if (dx * dx + dy * dy <= r2) {
              const i = (iy * imgSize.w + ix) * 4
              data.data[i + 3] = 0
            }
          }
        }
        ctx.putImageData(data, 0, 0)
      }
      ctx.globalCompositeOperation = 'source-over'
    },
    [tool, brushColor, brushSize, eraserSize, imgSize]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!imgSize) return
      e.preventDefault()
      if (e.button === 2) {
        setPanning(true)
        lastPanRef.current = { x: e.clientX, y: e.clientY }
        e.currentTarget.setPointerCapture(e.pointerId)
        return
      }
      if (e.button === 0) {
        const pt = screenToCanvas(e.clientX, e.clientY)
        if (pt) {
          if (tool === 'superEraser') {
            pushHistory()
            superEraserAt(pt.x, pt.y)
          } else {
            pushHistory()
            setDrawing(true)
            drawAt(pt.x, pt.y)
          }
        }
      }
    },
    [imgSize, tool, screenToCanvas, drawAt, superEraserAt, pushHistory]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (panning) {
        e.preventDefault()
        const dx = e.clientX - lastPanRef.current.x
        const dy = e.clientY - lastPanRef.current.y
        lastPanRef.current = { x: e.clientX, y: e.clientY }
        setOffset((off) => ({ x: off.x + dx, y: off.y + dy }))
        return
      }
      if (drawing && imgSize && tool !== 'superEraser') {
        e.preventDefault()
        const pt = screenToCanvas(e.clientX, e.clientY)
        if (pt) drawAt(pt.x, pt.y)
      }
    },
    [panning, drawing, imgSize, tool, screenToCanvas, drawAt]
  )

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.button === 2) {
      setPanning(false)
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (e.button === 0) setDrawing(false)
  }, [])

  const handlePointerLeave = useCallback(() => {
    setDrawing(false)
    setPanning(false)
  }, [])

  useEffect(() => {
    if (!drawing && !panning) return
    const onUp = () => {
      setDrawing(false)
      setPanning(false)
    }
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [drawing, panning])

  useEffect(() => {
    if (!imgSize) return
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [imgSize, handleUndo])

  useEffect(() => {
    const el = containerRef.current
    if (!el || !imgSize) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left - el.clientLeft
      const cy = e.clientY - rect.top - el.clientTop
      const delta = -Math.sign(e.deltaY) * 0.15
      const fit = fitScaleRef.current
      const off = offsetRef.current
      const z = zoomFactorRef.current
      const zNew = Math.max(0.25, Math.min(4, z * (1 + delta)))
      const scaleOld = fit * z
      const scaleNew = fit * zNew
      if (scaleOld > 0) {
        const ratio = scaleNew / scaleOld
        const offNew = {
          x: cx - (cx - off.x) * ratio,
          y: cy - (cy - off.y) * ratio,
        }
        setOffset(offNew)
        offsetRef.current = offNew
      }
      setZoomFactor(zNew)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [imgSize])

  const handleReset = useCallback(() => {
    zoomFactorRef.current = 1
    setZoomFactor(1)
    setReloadKey((k) => k + 1)
  }, [])

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onExport?.(blob)
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = 'fine-edited.png'
          a.click()
          URL.revokeObjectURL(a.href)
        }
      },
      'image/png',
      0.95
    )
  }, [onExport])

  if (loadError) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#c41e3a' }}>
        {t('imgFineEditorLoadError')}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
        <Space wrap>
          <Button
            type={tool === 'brush' ? 'primary' : 'default'}
            icon={<EditOutlined />}
            onClick={() => setTool('brush')}
          >
            {t('imgFineEditorBrush')}
          </Button>
          <Button
            type={tool === 'eraser' ? 'primary' : 'default'}
            icon={<DeleteOutlined />}
            onClick={() => setTool('eraser')}
          >
            {t('imgFineEditorEraser')}
          </Button>
          <Button
            type={tool === 'superEraser' ? 'primary' : 'default'}
            icon={<AimOutlined />}
            onClick={() => setTool('superEraser')}
          >
            {t('imgFineEditorSuperEraser')}
          </Button>
        </Space>
        {tool === 'brush' && (
          <Space wrap align="center">
            <Text type="secondary" style={{ fontSize: 12 }}>{t('imgFineEditorBrushColor')}:</Text>
            <ColorPicker
              value={brushColor}
              onChange={(_: unknown, hex: string) => setBrushColor(hex || '#000000')}
              showText
              size="small"
            />
            <Text type="secondary" style={{ fontSize: 12 }}>{t('imgFineEditorBrushSize')}:</Text>
            <Slider min={1} max={32} value={brushSize} onChange={setBrushSize} style={{ width: 80 }} />
          </Space>
        )}
        {tool === 'eraser' && (
          <Space wrap align="center">
            <Text type="secondary" style={{ fontSize: 12 }}>{t('imgFineEditorEraserSize')}:</Text>
            <Slider min={1} max={64} value={eraserSize} onChange={setEraserSize} style={{ width: 80 }} />
          </Space>
        )}
        {tool === 'superEraser' && (
          <Space wrap align="center">
            <Text type="secondary" style={{ fontSize: 12 }}>{t('imgFineEditorSuperEraserTolerance')}:</Text>
            <Slider min={1} max={100} value={superEraserTolerance} onChange={setSuperEraserTolerance} style={{ width: 80 }} />
          </Space>
        )}
        <Space wrap align="center">
          <Button size="small" type={bgColorEnabled ? 'primary' : 'default'} onClick={() => setBgColorEnabled(true)}>
            {t('imgFineEditorBgOn')}
          </Button>
          <Button size="small" type={!bgColorEnabled ? 'primary' : 'default'} onClick={() => setBgColorEnabled(false)}>
            {t('imgFineEditorBgOff')}
          </Button>
          {bgColorEnabled && (
            <ColorPicker
              value={bgColor}
              onChange={(_: unknown, hex: string) => setBgColor(hex || '#ffffff')}
              showText
              size="small"
            />
          )}
        </Space>
        <Space wrap>
          <Button size="small" icon={<UndoOutlined />} onClick={handleUndo} disabled={historyLength <= 1}>
            {t('imgFineEditorUndoStep')}
          </Button>
          <Button size="small" icon={<DeleteOutlined />} onClick={handleReset}>
            {t('imgFineEditorReset')}
          </Button>
          <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownload}>
            {t('imgDownload')}
          </Button>
        </Space>
      </div>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: 480,
          minHeight: 320,
          background: 'repeating-conic-gradient(#c9bfb0 0% 25%, #e4dbcf 0% 50%) 50% / 16px 16px',
          borderRadius: 8,
          border: '1px solid #9a8b78',
          overflow: 'hidden',
          position: 'relative',
          cursor: imgSize ? (panning ? 'grabbing' : tool === 'brush' || tool === 'superEraser' ? 'crosshair' : tool === 'eraser' ? eraserCursor() : 'grab') : 'default',
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        tabIndex={0}
        onContextMenu={(e) => e.preventDefault()}
      >
        {!imgSize && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', zIndex: 1 }}>
            {t('imgFineEditorLoading')}
          </div>
        )}
        {imgSize && bgColorEnabled && (
          <div
            style={{
              position: 'absolute',
              left: offset.x,
              top: offset.y,
              width: imgSize.w * displayScale,
              height: imgSize.h * displayScale,
              backgroundColor: bgColor,
              pointerEvents: 'none',
            }}
          />
        )}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            left: offset.x,
            top: offset.y,
            width: imgSize ? imgSize.w * displayScale : 0,
            height: imgSize ? imgSize.h * displayScale : 0,
            imageRendering: 'pixelated',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  )
}
