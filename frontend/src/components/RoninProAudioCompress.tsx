import { useEffect, useMemo, useState } from 'react'
import { AudioOutlined, DownloadOutlined, InboxOutlined } from '@ant-design/icons'
import { Button, Card, Progress, Radio, Space, Typography, Upload, message } from 'antd'
import type { UploadFile } from 'antd'
import JSZip from 'jszip'
import { useLanguage } from '../i18n/context'
import { compressWavToMp3 } from '../lib/audioMp3'

const { Dragger } = Upload
const { Text } = Typography

const WAV_ACCEPT = ['.wav']
const MAX_AUDIO_MB = 100
const BITRATE_OPTIONS = [64, 96, 128, 192, 256, 320]

interface AudioResultItem {
  key: string
  file: File
  blob: Blob
  url: string
  durationSec: number
  sampleRate: number
  channels: number
}

function fileKey(file: File): string {
  return `${file.name}_${file.size}_${file.lastModified}`
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(2)} ${units[unitIndex]}`
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const remain = total % 60
  return `${minutes}:${String(remain).padStart(2, '0')}`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function RoninProAudioCompress() {
  const { t } = useLanguage()
  const [files, setFiles] = useState<File[]>([])
  const [bitrate, setBitrate] = useState(128)
  const [progress, setProgress] = useState(0)
  const [activeFileName, setActiveFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [zipLoading, setZipLoading] = useState(false)
  const [results, setResults] = useState<AudioResultItem[]>([])

  useEffect(() => {
    return () => {
      results.forEach((item) => URL.revokeObjectURL(item.url))
    }
  }, [results])

  const uploadFileList = useMemo<UploadFile[]>(
    () =>
      files.map((file) => ({
        uid: fileKey(file),
        name: file.name,
        size: file.size,
      })),
    [files]
  )

  const totalOriginalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files])
  const totalOutputBytes = useMemo(() => results.reduce((sum, item) => sum + item.blob.size, 0), [results])
  const totalSavedBytes = Math.max(0, totalOriginalBytes - totalOutputBytes)
  const totalSavedPercent =
    totalOriginalBytes > 0 ? Math.max(0, Math.round((totalSavedBytes / totalOriginalBytes) * 100)) : 0

  const clearResults = () => {
    results.forEach((item) => URL.revokeObjectURL(item.url))
    setResults([])
    setProgress(0)
    setActiveFileName('')
  }

  const handleAddFile = (nextFile: File) => {
    const ext = `.${(nextFile.name.split('.').pop() || '').toLowerCase()}`
    if (!WAV_ACCEPT.includes(ext)) {
      message.error(t('formatError', { formats: WAV_ACCEPT.join(' ') }))
      return Upload.LIST_IGNORE
    }
    if (nextFile.size > MAX_AUDIO_MB * 1024 * 1024) {
      message.error(t('roninProAudioCompressTooLarge', { max: MAX_AUDIO_MB }))
      return Upload.LIST_IGNORE
    }
    setFiles((current) => {
      const nextKey = fileKey(nextFile)
      if (current.some((file) => fileKey(file) === nextKey)) return current
      return [...current, nextFile]
    })
    clearResults()
    return false
  }

  const runCompress = async () => {
    if (files.length === 0) {
      message.warning(t('roninProAudioCompressNeedFile'))
      return
    }

    setLoading(true)
    clearResults()

    try {
      const nextResults: AudioResultItem[] = []
      for (let index = 0; index < files.length; index++) {
        const file = files[index]!
        setActiveFileName(file.name)
        const result = await compressWavToMp3(file, bitrate, (filePercent) => {
          const overall = Math.round(((index + filePercent / 100) / files.length) * 100)
          setProgress(overall)
        })
        nextResults.push({
          key: fileKey(file),
          file,
          blob: result.blob,
          url: URL.createObjectURL(result.blob),
          durationSec: result.durationSec,
          sampleRate: result.sampleRate,
          channels: result.channels,
        })
      }
      setResults(nextResults)
      message.success(
        files.length > 1
          ? t('roninProAudioCompressBatchSuccess', { count: files.length })
          : t('roninProAudioCompressSuccess')
      )
    } catch (error) {
      message.error(`${t('exportFailed')}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
      setActiveFileName('')
    }
  }

  const downloadSingle = (item: AudioResultItem) => {
    downloadBlob(item.blob, `${item.file.name.replace(/\.[^.]+$/, '')}_${bitrate}kbps.mp3`)
    message.success(t('downloadStarted'))
  }

  const downloadZip = async () => {
    if (results.length === 0) return
    setZipLoading(true)
    try {
      const zip = new JSZip()
      for (const item of results) {
        zip.file(`${item.file.name.replace(/\.[^.]+$/, '')}_${bitrate}kbps.mp3`, item.blob)
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(zipBlob, `audio_mp3_${bitrate}kbps.zip`)
      message.success(t('downloadStarted'))
    } catch (error) {
      message.error(`${t('exportFailed')}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setZipLoading(false)
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 900 }}>
      <Dragger
        accept={WAV_ACCEPT.join(',')}
        multiple
        disabled={loading}
        fileList={uploadFileList}
        beforeUpload={handleAddFile}
        onRemove={(uploadFile) => {
          setFiles((current) => current.filter((file) => fileKey(file) !== uploadFile.uid))
          clearResults()
        }}
        style={{ padding: 28 }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined style={{ fontSize: 48, color: '#b55233' }} />
        </p>
        <p className="ant-upload-text">{t('roninProAudioCompressUploadHint')}</p>
        <p className="ant-upload-hint">
          WAV only · MP3 output · {MAX_AUDIO_MB} MB max / file
        </p>
      </Dragger>

      <Card size="small" title={t('roninProAudioCompressBitrate')}>
        <Radio.Group
          optionType="button"
          buttonStyle="solid"
          value={bitrate}
          onChange={(e) => setBitrate(e.target.value)}
          options={BITRATE_OPTIONS.map((value) => ({
            label: `${value} kbps`,
            value,
          }))}
        />
      </Card>

      <Space wrap>
        <Button
          type="primary"
          icon={<AudioOutlined />}
          loading={loading}
          disabled={files.length === 0}
          onClick={runCompress}
        >
          {loading
            ? t('roninProAudioCompressRunning')
            : files.length > 1
              ? t('roninProAudioCompressRunBatch')
              : t('roninProAudioCompressRun')}
        </Button>
        {results.length > 0 && (
          <Button icon={<DownloadOutlined />} loading={zipLoading} onClick={downloadZip}>
            {t('roninProAudioCompressDownloadZip')}
          </Button>
        )}
      </Space>

      {files.length > 0 && (
        <Text type="secondary">
          {t('roninProAudioCompressFileCount')}: {files.length}
        </Text>
      )}

      {loading && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Progress percent={progress} status="active" />
          {activeFileName ? (
            <Text type="secondary">
              {t('roninProAudioCompressCurrent')}: {activeFileName}
            </Text>
          ) : null}
        </Space>
      )}

      {results.length > 0 && (
        <Card size="small" title={t('roninProAudioCompressResults')}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Text type="secondary">
              {t('roninProAudioCompressSaved')}: {formatBytes(totalSavedBytes)} ({totalSavedPercent}%)
            </Text>
            <Text type="secondary">
              {t('roninProAudioCompressOriginalSize')}: {formatBytes(totalOriginalBytes)} · {t('roninProAudioCompressOutputSize')}:{' '}
              {formatBytes(totalOutputBytes)}
            </Text>
            {results.map((item) => {
              const savedBytes = Math.max(0, item.file.size - item.blob.size)
              const savedPercent =
                item.file.size > 0 ? Math.max(0, Math.round((savedBytes / item.file.size) * 100)) : 0
              return (
                <Card
                  key={item.key}
                  size="small"
                  title={item.file.name}
                  extra={
                    <Button type="primary" size="small" icon={<DownloadOutlined />} onClick={() => downloadSingle(item)}>
                      {t('roninProAudioCompressDownload')}
                    </Button>
                  }
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <audio controls src={item.url} style={{ width: '100%' }} />
                    <Text type="secondary">
                      {t('roninProAudioCompressOriginalSize')}: {formatBytes(item.file.size)} · {t('roninProAudioCompressOutputSize')}:{' '}
                      {formatBytes(item.blob.size)}
                    </Text>
                    <Text type="secondary">
                      {t('roninProAudioCompressSaved')}: {formatBytes(savedBytes)} ({savedPercent}%)
                    </Text>
                    <Text type="secondary">
                      {t('roninProAudioCompressDuration')}: {formatDuration(item.durationSec)}
                    </Text>
                    <Text type="secondary">
                      {t('roninProAudioCompressSampleRate')}: {item.sampleRate} Hz · {item.channels === 1 ? 'Mono' : 'Stereo'}
                    </Text>
                  </Space>
                </Card>
              )
            })}
          </Space>
        </Card>
      )}
    </Space>
  )
}
