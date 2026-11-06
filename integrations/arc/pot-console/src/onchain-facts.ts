// Reviewed local export: this product console supports Arc Testnet only.
export const USDC_DECIMALS = 6;
const ARC = {
  chainId: 5042002,
  name: "Arc Testnet",
  isTestnet: true,
  explorerBase: "https://explorer.testnet.arc.io",
  nativeCurrency: { symbol: "USDC", decimals: 18, isUsdc: true },
  usdc: {
    symbol: "USDC",
    decimals: 6,
    address: "0x3600000000000000000000000000000000000000",
  },
} as const;
export function requireChain(chainId: number) {
  if (chainId !== ARC.chainId)
    throw new Error("Only Arc Testnet (5042002) is enabled.");
  return ARC;
}
export function getUsdc(chainId: number) {
  return requireChain(chainId).usdc;
}
export function buildTxExplorerUrl(chainId: number, hash: string) {
  if (!/^0x[0-9a-f]{64}$/i.test(hash))
    throw new Error("Invalid transaction hash");
  return `${requireChain(chainId).explorerBase}/tx/${hash}`;
}
