/**
 * 功能开关（集中管理，便于日后恢复）
 *
 * RoninPro NFT：为 true 时需在首页持有指定合约 NFT 才显示入口，进入后也会校验（逻辑见 RoninPro + ModeSelector + useNftOwnership）
 * 当前默认关闭，任何人登录 Ronin 即可使用 RoninPro（无需持有 NFT）。
 */
export const RONIN_PRO_REQUIRE_NFT = false
