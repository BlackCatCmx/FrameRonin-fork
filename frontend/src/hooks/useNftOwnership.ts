import { useEffect, useState } from 'react'

const RONIN_RPC = 'https://api.roninchain.com/rpc'
const NFT_CONTRACT = '0xEcaba712C7a641c6dBed1e6dae8CbB947e647b8A'.toLowerCase()
/** ERC721 balanceOf(address) selector */
const BALANCE_OF_SELECTOR = '0x70a08231'

function padAddress(addr: string): string {
  const clean = addr.replace(/^0x/i, '')
  return '0'.repeat(64 - clean.length) + clean
}

export function useNftOwnership(address: string | null) {
  const [ownsNft, setOwnsNft] = useState<boolean | null>(null)

  useEffect(() => {
    if (!address) {
      setOwnsNft(null)
      return
    }
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
        params: [
          { to: NFT_CONTRACT, data },
          'latest',
        ],
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
  }, [address])

  return ownsNft
}
