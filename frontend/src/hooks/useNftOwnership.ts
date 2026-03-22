import { useEffect, useState } from 'react'

const RONIN_RPC = 'https://api.roninchain.com/rpc'
/** RoninPro 门槛用历史合约；未传第二参时使用 */
const LEGACY_GATE_NFT_CONTRACT =
  '0xEcaba712C7a641c6dBed1e6dae8CbB947e647b8A'.toLowerCase()
/** ERC721 balanceOf(address) selector */
const BALANCE_OF_SELECTOR = '0x70a08231'

function padAddress(addr: string): string {
  const clean = addr.replace(/^0x/i, '')
  return '0'.repeat(64 - clean.length) + clean
}

function normalizeContract(addr: string | null | undefined): string | null {
  const t = addr?.trim()
  if (!t) return null
  const lower = t.toLowerCase()
  return /^0x[a-f0-9]{40}$/.test(lower) ? lower : null
}

/**
 * 查询钱包在指定 ERC721 上的 balanceOf（>0 视为持有）。
 * @param address 钱包地址；null 时不请求
 * @param nftContractAddress 可选；不传则用历史门槛合约（与 RoninPro 门禁一致）
 */
export function useNftOwnership(
  address: string | null,
  nftContractAddress?: string | null,
) {
  const [ownsNft, setOwnsNft] = useState<boolean | null>(null)

  useEffect(() => {
    if (!address) {
      setOwnsNft(null)
      return
    }
    const contract =
      normalizeContract(nftContractAddress) ?? LEGACY_GATE_NFT_CONTRACT

    let cancelled = false
    setOwnsNft(null)
    const data = BALANCE_OF_SELECTOR + padAddress(address)
    fetch(RONIN_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: contract, data }, 'latest'],
      }),
    })
      .then((res) => res.json())
      .then((json: { result?: string; error?: { message: string } }) => {
        if (cancelled) return
        if (json.error) {
          setOwnsNft(false)
          return
        }
        const hex = json.result || '0x0'
        const balance = parseInt(hex, 16)
        setOwnsNft(balance > 0)
      })
      .catch(() => {
        if (!cancelled) setOwnsNft(false)
      })
    return () => {
      cancelled = true
    }
  }, [address, nftContractAddress])

  return ownsNft
}
