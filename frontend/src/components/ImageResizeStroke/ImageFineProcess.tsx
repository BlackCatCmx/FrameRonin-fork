import { useState } from 'react'
import { Upload, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd'
import { useLanguage } from '../../i18n/context'
import StashDropZone from '../StashDropZone'
import ImageFineEditor from './ImageFineEditor'

const { Dragger } = Upload

const IMAGE_ALLOWED = ['.png', '.jpg', '.jpeg', '.webp']
const IMAGE_MAX_MB = 20

export default function ImageFineProcess() {
  const { t } = useLanguage()
  const [file, setFile] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  const handleFile = async (f: File | null) => {
    setFile(f)
    setImageUrl(null)
    if (f) {
      const ext = '.' + (f.name.split('.').pop() || '').toLowerCase()
      if (!IMAGE_ALLOWED.includes(ext)) {
        message.error(t('imageFormatError'))
        return
      }
      if (f.size > IMAGE_MAX_MB * 1024 * 1024) {
        message.error(t('imageSizeError'))
        return
      }
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve(r.result as string)
          r.onerror = reject
          r.readAsDataURL(f)
        })
        setImageUrl(dataUrl)
      } catch {
        message.error(t('imgFineEditorLoadError'))
      }
    }
  }

  return (
    <div style={{ width: '100%' }}>
      <StashDropZone
        onStashDrop={(f) => handleFile(f)}
        maxSizeMB={IMAGE_MAX_MB}
        onSizeError={() => message.error(t('imageSizeError'))}
      >
        <Dragger
          name="file"
          multiple={false}
          accept={IMAGE_ALLOWED.join(',')}
          maxCount={1}
          fileList={file ? [{ uid: '1', name: file.name, size: file.size } as UploadFile] : []}
          beforeUpload={(f) => {
            handleFile(f)
            return false
          }}
          onRemove={() => handleFile(null)}
          style={{ padding: 48 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 64, color: '#b55233' }} />
          </p>
          <p className="ant-upload-text">{t('imageUploadHint')}</p>
          <p className="ant-upload-hint">{t('imageFormats')}</p>
        </Dragger>
      </StashDropZone>

      {imageUrl && (
        <div style={{ marginTop: 24 }}>
          <ImageFineEditor imageUrl={imageUrl} />
        </div>
      )}
    </div>
  )
}
