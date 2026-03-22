import { RONIN_PUBLISHED_FRAME_TOKEN_ADDRESS } from './roninPublishedAddresses'

/** FRAME 领取调用的链上合约地址（默认见 `roninPublishedAddresses`）。 */

export const FRAME_TOKEN_CONTRACT_ADDRESS: string =
  (import.meta.env.VITE_FRAME_TOKEN_CONTRACT_ADDRESS as string | undefined)?.trim() ||
  RONIN_PUBLISHED_FRAME_TOKEN_ADDRESS.trim()
