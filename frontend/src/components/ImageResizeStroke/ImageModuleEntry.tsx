import { Card, Row, Col, Typography } from 'antd'
import { EditOutlined, ScissorOutlined } from '@ant-design/icons'
import { useLanguage } from '../../i18n/context'

const { Text } = Typography

export type ImageSubMode = 'normal' | 'fine'

interface Props {
  onSelect: (sub: ImageSubMode) => void
}

export default function ImageModuleEntry({ onSelect }: Props) {
  const { t } = useLanguage()
  return (
    <div style={{ padding: '24px 0' }}>
      <Text type="secondary" style={{ display: 'block', marginBottom: 20, textAlign: 'center' }}>
        {t('imgModuleEntryHint')}
      </Text>
      <Row gutter={24} justify="center">
        <Col xs={24} sm={12} md={8}>
          <Card
            hoverable
            onClick={() => onSelect('normal')}
            styles={{ body: { padding: '24px' } }}
            style={{
              textAlign: 'center',
              cursor: 'pointer',
              borderColor: '#9a8b78',
              background: 'linear-gradient(135deg, #ede6dc 0%, #e8dfd4 100%)',
            }}
          >
            <ScissorOutlined style={{ fontSize: 40, color: '#b55233', marginBottom: 16 }} />
            <Text strong style={{ fontSize: 16, display: 'block' }}>{t('imgNormalProcess')}</Text>
            <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12, lineHeight: 1.4 }}>
              {t('imgNormalProcessDesc')}
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card
            hoverable
            onClick={() => onSelect('fine')}
            styles={{ body: { padding: '24px' } }}
            style={{
              textAlign: 'center',
              cursor: 'pointer',
              borderColor: '#9a8b78',
              background: 'linear-gradient(135deg, #ede6dc 0%, #e8dfd4 100%)',
            }}
          >
            <EditOutlined style={{ fontSize: 40, color: '#b55233', marginBottom: 16 }} />
            <Text strong style={{ fontSize: 16, display: 'block' }}>{t('imgFineProcess')}</Text>
            <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12, lineHeight: 1.4 }}>
              {t('imgFineProcessHint')}
            </Text>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
