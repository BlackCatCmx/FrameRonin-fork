import { Button, Space, Typography } from 'antd'
import { useLanguage } from '../i18n/context'

const { Text } = Typography

const GEM_V4TX3_URL = 'https://gemini.google.com/gem/1zerS4eXHUGNj2tj-63omHyFRo_4K5S7p?usp=sharing'

const V4TX3_GIFS = ['A2M_row1.gif', 'A2M_row3.gif', 'row_01.gif', 'row_02.gif', 'row_03.gif', 'row_04.gif', 'row_05.gif', 'jump.gif', 'attack.gif', 'spr.gif']

const PLACEHOLDER_BUTTON_KEYS = [
  'nanobananaFullCharBtn1',
  'nanobananaFullCharBtn2',
  'nanobananaFullCharBtn3',
  'nanobananaFullCharBtn4',
  'nanobananaFullCharBtn5',
] as const

export default function NanobananaFullChar() {
  const { t } = useLanguage()

  return (
    <>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {t('nanobananaFullCharHint')}
      </Text>
      <div>
        <Button
          type="primary"
          onClick={() => window.open(GEM_V4TX3_URL, '_blank')}
        >
          {t('nanobananaFullCharBtn1')}
        </Button>
        <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
          {t('nanobananaFullCharBtn1Note')}
        </Text>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${V4TX3_GIFS.length}, 1fr)`, gap: 8, marginTop: 8, width: '100%' }}>
          {V4TX3_GIFS.map((name) => (
            <img
              key={name}
              src={`${import.meta.env.BASE_URL}${name}`}
              alt={name}
              style={{ width: '100%', aspectRatio: 1, objectFit: 'contain', imageRendering: 'pixelated', border: '1px solid rgba(0,0,0,0.1)' }}
            />
          ))}
        </div>
      </div>
      <Space wrap size="middle" style={{ marginTop: 24 }}>
        {PLACEHOLDER_BUTTON_KEYS.slice(1).map((key) => (
          <Button
            key={key}
            type="primary"
            onClick={() => {
              // 功能待实现，后期定义
            }}
          >
            {t(key)}
          </Button>
        ))}
      </Space>
    </>
  )
}
