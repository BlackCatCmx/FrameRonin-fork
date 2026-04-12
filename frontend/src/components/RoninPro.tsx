import { useEffect, useState } from 'react'
import { Button, Card, Col, Row, Typography } from 'antd'
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  ClusterOutlined,
  ExperimentOutlined,
  ExpandOutlined,
  ForkOutlined,
  GiftOutlined,
  MergeCellsOutlined,
  ScissorOutlined,
  SoundOutlined,
} from '@ant-design/icons'
import { useLanguage } from '../i18n/context'
import RoninProAdvancedPixel from './RoninProAdvancedPixel'
import RoninProAudioCompress from './RoninProAudioCompress'
import RoninProCustomScale from './RoninProCustomScale'
import RoninProCustomSlice from './RoninProCustomSlice'
import RoninProCustomWorkflow from './RoninProCustomWorkflow'
import RoninProDuplicateFrames from './RoninProDuplicateFrames'
import RoninProNftClaim from './RoninProNftClaim'
import RoninProRseprite from './RoninProRseprite'
import RoninProScatterSlice from './RoninProScatterSlice'
import RoninProSheetPro from './RoninProSheetPro'
import RoninProUnifySize from './RoninProUnifySize'

const ACCENT = '#b55233'
const ICON_BOX = 44

const RONIN_FEATURE_ENTRIES = [
  {
    id: 'sheetPro' as const,
    Icon: AppstoreOutlined,
    titleKey: 'roninProSheetPro',
    descKey: 'roninProSheetProHint',
  },
  {
    id: 'scatterSlice' as const,
    Icon: ScissorOutlined,
    titleKey: 'roninProScatterSlice',
    descKey: 'roninProScatterSliceDesc',
  },
  {
    id: 'customSlice' as const,
    Icon: ScissorOutlined,
    titleKey: 'roninProCustomSlice',
    descKey: 'roninProCustomSliceHint',
  },
  {
    id: 'customScale' as const,
    Icon: ExpandOutlined,
    titleKey: 'roninProCustomScale',
    descKey: 'roninProCustomScaleHint',
  },
  {
    id: 'audioCompress' as const,
    Icon: SoundOutlined,
    titleKey: 'roninProAudioCompress',
    descKey: 'roninProAudioCompressCardDesc',
  },
  {
    id: 'unifySize' as const,
    Icon: MergeCellsOutlined,
    titleKey: 'roninProUnifySize',
    descKey: 'roninProUnifySizeHint',
  },
  {
    id: 'duplicateFrames' as const,
    Icon: ClusterOutlined,
    titleKey: 'roninProDupFrames',
    descKey: 'roninProDupFramesCardDesc',
  },
  {
    id: 'customWorkflow' as const,
    Icon: ForkOutlined,
    titleKey: 'roninProCustomWorkflow',
    descKey: 'roninProCustomWorkflowHint',
  },
  {
    id: 'advancedPixel' as const,
    Icon: ExperimentOutlined,
    titleKey: 'roninProAdvancedPixel',
    descKey: 'roninProAdvancedPixelCardDesc',
  },
  {
    id: 'nftClaim' as const,
    Icon: GiftOutlined,
    titleKey: 'roninProNftClaim',
    descKey: 'roninProNftClaimDesc',
  },
  {
    id: 'rseprite' as const,
    Icon: AppstoreOutlined,
    titleKey: 'roninProRseprite',
    descKey: 'roninProRsepriteCardDesc',
  },
]

interface RoninProProps {
  onBack?: () => void
  deepLinkFeature?: string | null
  onDeepLinkConsumed?: () => void
  onSendToFineProcess?: (blob: Blob, suggestedFilename: string) => void
}

export default function RoninPro({
  onBack,
  deepLinkFeature = null,
  onDeepLinkConsumed,
  onSendToFineProcess,
}: RoninProProps) {
  const { t } = useLanguage()
  const [activeFeature, setActiveFeature] = useState<string | null>(null)

  useEffect(() => {
    if (!deepLinkFeature) return
    setActiveFeature(deepLinkFeature)
    onDeepLinkConsumed?.()
  }, [deepLinkFeature, onDeepLinkConsumed])

  const displayedFeature = deepLinkFeature === 'sheetPro' ? 'sheetPro' : activeFeature
  const shellMaxWidth =
    displayedFeature === 'customWorkflow' || displayedFeature === 'rseprite' || displayedFeature === 'sheetPro' || displayedFeature === 'scatterSlice'
      ? 'min(calc(100vw - 40px), 1920px)'
      : 1200

  return (
    <div
      style={{
        padding: '20px 24px 32px',
        maxWidth: shellMaxWidth,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          marginBottom: displayedFeature ? 16 : 20,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        {displayedFeature ? (
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setActiveFeature(null)}>
            {t('roninProBack')}
          </Button>
        ) : onBack ? (
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>
            {t('backToHome')}
          </Button>
        ) : null}
        <Typography.Title level={4} style={{ margin: 0 }}>
          RoninPro
        </Typography.Title>
      </div>

      {!displayedFeature ? (
        <div>
          <Typography.Paragraph
            type="secondary"
            style={{
              marginBottom: 24,
              marginTop: 0,
              fontSize: 14,
              lineHeight: 1.65,
              maxWidth: 720,
            }}
          >
            {t('moduleRoninProDesc')}
          </Typography.Paragraph>
          <Row gutter={[20, 20]}>
            {RONIN_FEATURE_ENTRIES.map(({ id, Icon, titleKey, descKey }) => (
              <Col key={id} xs={24} sm={24} md={12} lg={12}>
                <Card
                  hoverable
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setActiveFeature(id)
                    }
                  }}
                  styles={{
                    body: {
                      padding: '18px 20px',
                      height: '100%',
                    },
                  }}
                  style={{
                    height: '100%',
                    minHeight: 112,
                    borderRadius: 10,
                    transition: 'box-shadow 0.2s ease, transform 0.2s ease',
                  }}
                  onClick={() => setActiveFeature(id)}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 16,
                      alignItems: 'flex-start',
                      height: '100%',
                    }}
                  >
                    <div
                      style={{
                        width: ICON_BOX,
                        height: ICON_BOX,
                        borderRadius: 10,
                        background: 'linear-gradient(145deg, rgba(181,82,51,0.14) 0%, rgba(181,82,51,0.06) 100%)',
                        border: '1px solid rgba(181,82,51,0.22)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon style={{ fontSize: 22, color: ACCENT }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Typography.Text
                        strong
                        style={{
                          fontSize: 15,
                          display: 'block',
                          marginBottom: 8,
                          color: 'var(--ant-color-text)',
                        }}
                      >
                        {t(titleKey)}
                      </Typography.Text>
                      <Typography.Text
                        type="secondary"
                        style={{
                          fontSize: 12,
                          lineHeight: 1.6,
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical' as const,
                          overflow: 'hidden',
                        }}
                      >
                        {t(descKey)}
                      </Typography.Text>
                    </div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      ) : displayedFeature === 'customSlice' ? (
        <RoninProCustomSlice />
      ) : displayedFeature === 'scatterSlice' ? (
        <RoninProScatterSlice />
      ) : displayedFeature === 'customScale' ? (
        <RoninProCustomScale />
      ) : displayedFeature === 'audioCompress' ? (
        <RoninProAudioCompress />
      ) : displayedFeature === 'unifySize' ? (
        <RoninProUnifySize />
      ) : displayedFeature === 'duplicateFrames' ? (
        <RoninProDuplicateFrames />
      ) : displayedFeature === 'sheetPro' ? (
        <RoninProSheetPro />
      ) : displayedFeature === 'customWorkflow' ? (
        <RoninProCustomWorkflow onSendToFineProcess={onSendToFineProcess} />
      ) : displayedFeature === 'advancedPixel' ? (
        <RoninProAdvancedPixel />
      ) : displayedFeature === 'nftClaim' ? (
        <RoninProNftClaim />
      ) : displayedFeature === 'rseprite' ? (
        <RoninProRseprite />
      ) : null}
    </div>
  )
}
