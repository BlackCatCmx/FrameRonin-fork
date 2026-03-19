import { useEffect, useState } from 'react'
import { Button, Checkbox, InputNumber, message, Radio, Space, Typography, Upload } from 'antd'
import { ExpandOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd'
import { useLanguage } from '../i18n/context'
import ImageFineEditor from './ImageResizeStroke/ImageFineEditor'
import StashableImage from './StashableImage'
import StashDropZone from './StashDropZone'
import {
  applyChromaKeyAdaptiveRegion,
  applyChromaKeyContiguousFromTopLeft,
  applyChromaKeyHybridTolerance,
  cropImageBlob,
  getTopLeftPixelColor,
  resizeImageToBlob,
} from './ParamsStep/utils'

const { Dragger } = Upload
const { Text } = Typography

const IMAGE_ACCEPT = ['.png', '.jpg', '.jpeg', '.webp']

export default function RoninProCustomScale() {
  const { t } = useLanguage()
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [originalSize, setOriginalSize] = useState<{ w: number; h: number } | null>(null)
  const [targetW, setTargetW] = useState(256)
  const [targetH, setTargetH] = useState(256)
  const [keepAspect, setKeepAspect] = useState(true)
  const [pixelated, setPixelated] = useState(true)
  const [loading, setLoading] = useState(false)
  const [ffffLoading, setFfffLoading] = useState(false)
  const [fffbLoading, setFffbLoading] = useState(false)
  const [fbfbLoading, setFbfbLoading] = useState(false)
  const [c0c0Loading, setC0c0Loading] = useState(false)
  const [c0beLoading, setC0beLoading] = useState(false)
  const [bebeLoading, setBebeLoading] = useState(false)
  const [fbffLoading, setFbffLoading] = useState(false)
  const [bec0Loading, setBec0Loading] = useState(false)
  const [matteAlgorithm, setMatteAlgorithm] = useState<'contiguous' | 'chromaKey' | 'chromaKeyAdaptive'>('contiguous')
  const [nonContiguousTolerance, setNonContiguousTolerance] = useState(5)
  const [resultUrl, setResultUrl] = useState<string | null>(null)

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        setOriginalSize({ w: img.naturalWidth, h: img.naturalHeight })
        if (keepAspect) {
          setTargetW(img.naturalWidth)
          setTargetH(img.naturalHeight)
        }
      }
      img.src = url
      setPreviewUrl(url)
      return () => {
        URL.revokeObjectURL(url)
      }
    }
    setPreviewUrl(null)
    setOriginalSize(null)
    setResultUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
  }, [file])

  useEffect(() => () => {
    setResultUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
  }, [])

  const runMatteStep = async (
    dataUrl: string,
    r: number,
    g: number,
    b: number
  ): Promise<Blob> => {
    let matteDataUrl: string
    if (matteAlgorithm === 'chromaKey') {
      const res = await applyChromaKeyHybridTolerance(
        dataUrl,
        r,
        g,
        b,
        80,
        nonContiguousTolerance,
        0
      )
      matteDataUrl = res.dataUrl
    } else if (matteAlgorithm === 'chromaKeyAdaptive') {
      const res = await applyChromaKeyAdaptiveRegion(
        dataUrl,
        r,
        g,
        b,
        80,
        nonContiguousTolerance,
        20,
        40,
        0
      )
      matteDataUrl = res.dataUrl
    } else {
      const res = await applyChromaKeyContiguousFromTopLeft(dataUrl, r, g, b, 80, 5)
      matteDataUrl = res.dataUrl
    }
    return fetch(matteDataUrl).then((res) => res.blob())
  }

  const runScale = async () => {
    if (!file) return
    setLoading(true)
    setResultUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    try {
      const blob = await file.arrayBuffer().then((b) => new Blob([b]))
      const result = await resizeImageToBlob(blob, targetW, targetH, keepAspect, pixelated)
      setResultUrl(URL.createObjectURL(result))
      message.success(t('imgResizeSuccess'))
    } catch (e) {
      message.error(t('exportFailed') + ': ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  const runFfff = async () => {
    if (!file) return
    setFfffLoading(true)
    setResultUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    try {
      let blob = await file.arrayBuffer().then((b) => new Blob([b]))
      blob = await resizeImageToBlob(blob, 256, 256, false, true)
      const { r, g, b } = await getTopLeftPixelColor(blob)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r2 = new FileReader()
        r2.onload = () => resolve(r2.result as string)
        r2.onerror = () => reject(new Error('ERR_READ'))
        r2.readAsDataURL(blob)
      })
      blob = await runMatteStep(dataUrl, r, g, b)
      setResultUrl(URL.createObjectURL(blob))
      message.success(t('imgResizeSuccess'))
    } catch (e) {
      message.error(t('exportFailed') + ': ' + String(e))
    } finally {
      setFfffLoading(false)
    }
  }

  const runFffb = async () => {
    if (!file) return
    setFffbLoading(true)
    setResultUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    try {
      let blob = await file.arrayBuffer().then((b) => new Blob([b]))
      blob = await resizeImageToBlob(blob, 256, 256, false, true)
      const { r, g, b } = await getTopLeftPixelColor(blob)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r2 = new FileReader()
        r2.onload = () => resolve(r2.result as string)
        r2.onerror = () => reject(new Error('ERR_READ'))
        r2.readAsDataURL(blob)
      })
      blob = await runMatteStep(dataUrl, r, g, b)
      blob = await cropImageBlob(blob, { left: 0, top: 0, right: 0, bottom: 4 })
      setResultUrl(URL.createObjectURL(blob))
      message.success(t('imgResizeSuccess'))
    } catch (e) {
      message.error(t('exportFailed') + ': ' + String(e))
    } finally {
      setFffbLoading(false)
    }
  }

  const runFbfb = async () => {
    if (!file) return
    setFbfbLoading(true)
    setResultUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    try {
      let blob = await file.arrayBuffer().then((b) => new Blob([b]))
      blob = await resizeImageToBlob(blob, 256, 256, false, true)
      const { r, g, b } = await getTopLeftPixelColor(blob)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r2 = new FileReader()
        r2.onload = () => resolve(r2.result as string)
        r2.onerror = () => reject(new Error('ERR_READ'))
        r2.readAsDataURL(blob)
      })
      blob = await runMatteStep(dataUrl, r, g, b)
      blob = await cropImageBlob(blob, { left: 0, top: 0, right: 4, bottom: 4 })
      setResultUrl(URL.createObjectURL(blob))
      message.success(t('imgResizeSuccess'))
    } catch (e) {
      message.error(t('exportFailed') + ': ' + String(e))
    } finally {
      setFbfbLoading(false)
    }
  }

  const runC0c0 = async () => {
    if (!file) return
    setC0c0Loading(true)
    setResultUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    try {
      let blob = await file.arrayBuffer().then((b) => new Blob([b]))
      blob = await resizeImageToBlob(blob, 192, 192, false, true)
      const { r, g, b } = await getTopLeftPixelColor(blob)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r2 = new FileReader()
        r2.onload = () => resolve(r2.result as string)
        r2.onerror = () => reject(new Error('ERR_READ'))
        r2.readAsDataURL(blob)
      })
      blob = await runMatteStep(dataUrl, r, g, b)
      setResultUrl(URL.createObjectURL(blob))
      message.success(t('imgResizeSuccess'))
    } catch (e) {
      message.error(t('exportFailed') + ': ' + String(e))
    } finally {
      setC0c0Loading(false)
    }
  }

  const runC0be = async () => {
    if (!file) return
    setC0beLoading(true)
    setResultUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    try {
      let blob = await file.arrayBuffer().then((b) => new Blob([b]))
      blob = await resizeImageToBlob(blob, 192, 192, false, true)
      const { r, g, b } = await getTopLeftPixelColor(blob)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r2 = new FileReader()
        r2.onload = () => resolve(r2.result as string)
        r2.onerror = () => reject(new Error('ERR_READ'))
        r2.readAsDataURL(blob)
      })
      blob = await runMatteStep(dataUrl, r, g, b)
      blob = await cropImageBlob(blob, { left: 0, top: 0, right: 0, bottom: 2 })
      setResultUrl(URL.createObjectURL(blob))
      message.success(t('imgResizeSuccess'))
    } catch (e) {
      message.error(t('exportFailed') + ': ' + String(e))
    } finally {
      setC0beLoading(false)
    }
  }

  const runBebe = async () => {
    if (!file) return
    setBebeLoading(true)
    setResultUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    try {
      let blob = await file.arrayBuffer().then((b) => new Blob([b]))
      blob = await resizeImageToBlob(blob, 190, 190, false, true)
      const { r, g, b } = await getTopLeftPixelColor(blob)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r2 = new FileReader()
        r2.onload = () => resolve(r2.result as string)
        r2.onerror = () => reject(new Error('ERR_READ'))
        r2.readAsDataURL(blob)
      })
      blob = await runMatteStep(dataUrl, r, g, b)
      setResultUrl(URL.createObjectURL(blob))
      message.success(t('imgResizeSuccess'))
    } catch (e) {
      message.error(t('exportFailed') + ': ' + String(e))
    } finally {
      setBebeLoading(false)
    }
  }

  const runFbff = async () => {
    if (!file) return
    setFbffLoading(true)
    setResultUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    try {
      let blob = await file.arrayBuffer().then((b) => new Blob([b]))
      blob = await resizeImageToBlob(blob, 256, 256, false, true)
      const { r, g, b } = await getTopLeftPixelColor(blob)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r2 = new FileReader()
        r2.onload = () => resolve(r2.result as string)
        r2.onerror = () => reject(new Error('ERR_READ'))
        r2.readAsDataURL(blob)
      })
      blob = await runMatteStep(dataUrl, r, g, b)
      blob = await cropImageBlob(blob, { left: 0, top: 0, right: 4, bottom: 0 })
      setResultUrl(URL.createObjectURL(blob))
      message.success(t('imgResizeSuccess'))
    } catch (e) {
      message.error(t('exportFailed') + ': ' + String(e))
    } finally {
      setFbffLoading(false)
    }
  }

  const runBec0 = async () => {
    if (!file) return
    setBec0Loading(true)
    setResultUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    try {
      let blob = await file.arrayBuffer().then((b) => new Blob([b]))
      blob = await resizeImageToBlob(blob, 192, 192, false, true)
      const { r, g, b } = await getTopLeftPixelColor(blob)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r2 = new FileReader()
        r2.onload = () => resolve(r2.result as string)
        r2.onerror = () => reject(new Error('ERR_READ'))
        r2.readAsDataURL(blob)
      })
      blob = await runMatteStep(dataUrl, r, g, b)
      blob = await cropImageBlob(blob, { left: 0, top: 0, right: 2, bottom: 0 })
      setResultUrl(URL.createObjectURL(blob))
      message.success(t('imgResizeSuccess'))
    } catch (e) {
      message.error(t('exportFailed') + ': ' + String(e))
    } finally {
      setBec0Loading(false)
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Text type="secondary">{t('roninProCustomScaleHint')}</Text>

      <Space wrap>
        <span>
          <Text type="secondary">{t('roninProCustomScaleTargetW')}:</Text>
          <InputNumber
            min={1}
            max={4096}
            value={targetW}
            onChange={(v) => setTargetW(v ?? 256)}
            style={{ width: 90, marginLeft: 8 }}
          />
        </span>
        <span>
          <Text type="secondary">{t('roninProCustomScaleTargetH')}:</Text>
          <InputNumber
            min={1}
            max={4096}
            value={targetH}
            onChange={(v) => setTargetH(v ?? 256)}
            style={{ width: 90, marginLeft: 8 }}
          />
        </span>
        <Checkbox checked={keepAspect} onChange={(e) => setKeepAspect(e.target.checked)}>
          {t('roninProCustomScaleKeepAspect')}
        </Checkbox>
        <Checkbox checked={pixelated} onChange={(e) => setPixelated(e.target.checked)}>
          {t('imgPixelated')}
        </Checkbox>
      </Space>

      <StashDropZone
        onStashDrop={(f) => {
          setFile(f)
          setResultUrl((old) => {
            if (old) URL.revokeObjectURL(old)
            return null
          })
        }}
      >
        <Dragger
          accept={IMAGE_ACCEPT.join(',')}
          maxCount={1}
          fileList={file ? [{ uid: '1', name: file.name } as UploadFile] : []}
          beforeUpload={(f) => {
            setFile(f)
            setResultUrl((old) => {
              if (old) URL.revokeObjectURL(old)
              return null
            })
            return false
          }}
          onRemove={() => setFile(null)}
        >
          <p className="ant-upload-text">{t('spriteUploadHint')}</p>
        </Dragger>
      </StashDropZone>

      {file && previewUrl && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <span>
              <Text type="secondary" style={{ marginRight: 8 }}>{t('roninProMatteAlgorithm')}:</Text>
              <Radio.Group
                value={matteAlgorithm}
                onChange={(e) => setMatteAlgorithm(e.target.value)}
                options={[
                  { label: t('roninProMatteContiguous'), value: 'contiguous' },
                  { label: t('roninProMatteChromaKey'), value: 'chromaKey' },
                  { label: t('roninProMatteChromaKeyAdaptive'), value: 'chromaKeyAdaptive' },
                ]}
              />
            </span>
            {(matteAlgorithm === 'chromaKey' || matteAlgorithm === 'chromaKeyAdaptive') && (
              <span>
                <Text type="secondary" style={{ marginRight: 8 }}>{t('roninProNonContiguousTolerance')}:</Text>
                <InputNumber
                  min={0}
                  max={100}
                  value={nonContiguousTolerance}
                  onChange={(v) => setNonContiguousTolerance(v ?? 5)}
                  style={{ width: 72 }}
                />
              </span>
            )}
          </div>
          <Text strong>
            {t('imgOriginalPreview')}
            {originalSize && (
              <Text type="secondary" style={{ marginLeft: 8, fontWeight: 'normal' }}>
                {originalSize.w} × {originalSize.h}
              </Text>
            )}
          </Text>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
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
                src={previewUrl}
                alt=""
                style={{ maxWidth: 320, maxHeight: 240, display: 'block', imageRendering: 'pixelated' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Space direction="vertical" size={8}>
                <Button type="primary" loading={ffffLoading} onClick={runFfff} disabled={!file}>
                  FFFF
                </Button>
                <Button type="primary" loading={fffbLoading} onClick={runFffb} disabled={!file}>
                  FFFB
                </Button>
                <Button type="primary" loading={fbfbLoading} onClick={runFbfb} disabled={!file}>
                  FBFB
                </Button>
                <Button type="primary" loading={fbffLoading} onClick={runFbff} disabled={!file}>
                  FBFF
                </Button>
              </Space>
              <Space direction="vertical" size={8}>
                <Button type="primary" loading={c0c0Loading} onClick={runC0c0} disabled={!file}>
                  C0C0
                </Button>
                <Button type="primary" loading={c0beLoading} onClick={runC0be} disabled={!file}>
                  C0BE
                </Button>
                <Button type="primary" loading={bebeLoading} onClick={runBebe} disabled={!file}>
                  BEBE
                </Button>
                <Button type="primary" loading={bec0Loading} onClick={runBec0} disabled={!file}>
                  BEC0
                </Button>
              </Space>
            </div>
          </div>
        </>
      )}

      <Space>
        <Button type="primary" loading={loading} onClick={runScale} disabled={!file} icon={<ExpandOutlined />}>
          {t('roninProCustomScaleApply')}
        </Button>
      </Space>

      {resultUrl && (
        <>
          <Text strong>{t('imgPreview')}</Text>
          <ImageFineEditor imageUrl={resultUrl} />
        </>
      )}
    </Space>
  )
}
