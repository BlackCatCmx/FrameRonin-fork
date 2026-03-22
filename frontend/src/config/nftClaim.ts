import { RONIN_PUBLISHED_NFT_MINT_ADDRESS } from './roninPublishedAddresses'

/** NFT 领取调用的链上合约地址（默认见 `roninPublishedAddresses`）。 */

export const NFT_CLAIM_CONTRACT_ADDRESS: string =
  (import.meta.env.VITE_NFT_CLAIM_CONTRACT_ADDRESS as string | undefined)?.trim() ||
  RONIN_PUBLISHED_NFT_MINT_ADDRESS.trim()
