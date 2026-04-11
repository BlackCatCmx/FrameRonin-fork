import { useState } from 'react'
import { Button, Card, Space, Typography, message } from 'antd'
import { useAuth } from '../auth/context'
import { NFT_CLAIM_CONTRACT_ADDRESS } from '../config/nftClaim'
import { useNftOwnership } from '../hooks/useNftOwnership'
import { useLanguage } from '../i18n/context'
import { FRAME_TOKEN_CONTRACT_ADDRESS } from '../config/frameToken'
import { FREE_MINT_NFT_DATA, FRAME_TOKEN_CLAIM_DATA } from '../lib/roninClaimCalldata'

/** RoninPro — 用户向领取 NFT 与 FRAME（无配置步骤，开箱即用） */
export default function RoninProNftClaim() {
  const { t } = useLanguage()
  const { address, sendRoninTransaction } = useAuth()
  const holdsAppNft = useNftOwnership(address, NFT_CLAIM_CONTRACT_ADDRESS)
  const [nftLoading, setNftLoading] = useState(false)
  const [frameLoading, setFrameLoading] = useState(false)

  const runTx = async (
    to: string,
    data: string,
    setLoading: (v: boolean) => void,
  ) => {
    if (!address) {
      message.info(t('roninProNftClaimLeadDisconnected'))
      return
    }
    setLoading(true)
    try {
      const hash = await sendRoninTransaction({
        to: to as `0x${string}`,
        data: data as `0x${string}`,
      })
      console.info('[RoninPro] tx:', hash)
      message.success(t('roninProNftClaimSent'))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (
        msg.includes('reject') ||
        msg.includes('User rejected') ||
        msg.includes('4001')
      ) {
        message.info(t('roninProNftClaimUserCancelled'))
      } else {
        console.error(e)
        message.error(t('roninProNftClaimGenericError'))
      }
    } finally {
      setLoading(false)
    }
  }

  const base = import.meta.env.BASE_URL
  const badgeSrc =
    holdsAppNft === true ? `${base}pixelmaster.png` : `${base}bagei.png`

  return (
    <div
      className="ronin-pro-nft-claim-layout"
      style={{
        padding: 16,
        maxWidth: 920,
        width: '100%',
        margin: 0,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 28,
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          width: '100%',
        }}
      >
        <Card style={{ flex: '1 1 300px', maxWidth: 480, minWidth: 280 }}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                {t('roninProNftClaimTitle')}
              </Typography.Title>
              <Typography.Paragraph
                type="secondary"
                style={{ marginBottom: 0, marginTop: 8 }}
              >
                {address ? t('roninProNftClaimLead') : t('roninProNftClaimLeadDisconnected')}
              </Typography.Paragraph>
            </div>

            <div>
              <Typography.Text strong>{t('roninProNftGiftTitle')}</Typography.Text>
              <Button
                type="primary"
                size="large"
                loading={nftLoading}
                onClick={() =>
                  void runTx(
                    NFT_CLAIM_CONTRACT_ADDRESS.trim(),
                    FREE_MINT_NFT_DATA,
                    setNftLoading,
                  )
                }
                disabled={!address}
                block
                style={{ marginTop: 12 }}
              >
                {t('roninProNftGiftButton')}
              </Button>
            </div>

            <div>
              <Typography.Text strong>{t('roninProFrameGiftTitle')}</Typography.Text>
              <Button
                size="large"
                loading={frameLoading}
                onClick={() =>
                  void runTx(
                    FRAME_TOKEN_CONTRACT_ADDRESS.trim(),
                    FRAME_TOKEN_CLAIM_DATA,
                    setFrameLoading,
                  )
                }
                disabled={!address}
                block
                style={{ marginTop: 12 }}
              >
                {t('roninProFrameGiftButton')}
              </Button>
            </div>
          </Space>
        </Card>

        <div
          className="ronin-pro-nft-claim-badge"
          style={{
            flex: '0 1 220px',
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '8px 0 8px 12px',
            minHeight: 200,
          }}
        >
          <img
            src={badgeSrc}
            alt=""
            width={220}
            height={220}
            style={{
              width: 'min(100%, 260px)',
              height: 'auto',
              maxWidth: 260,
              imageRendering: 'pixelated',
            }}
          />
        </div>
      </div>
    </div>
  )
}
