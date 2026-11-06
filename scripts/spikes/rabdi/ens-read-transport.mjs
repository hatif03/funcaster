// Read failover must never retry or forward a public-chain write.
import { custom, http, fallback } from "viem";
import { sepolia } from "viem/chains";
export const ENS_RPC_URLS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://11155111.rpc.thirdweb.com",
];
export function guardReadRpc(rpc) {
  return {
    request(args) {
      if (
        ![
          "eth_chainId",
          "eth_blockNumber",
          "eth_call",
          "eth_estimateGas",
          "eth_gasPrice",
          "eth_getBalance",
          "eth_getCode",
          "eth_getStorageAt",
          "eth_getProof",
          "eth_getBlockByNumber",
          "eth_getBlockByHash",
          "eth_getTransactionCount",
          "eth_getTransactionReceipt",
          "eth_getTransactionByHash",
          "eth_getLogs",
        ].includes(args.method)
      )
        throw Error("Read transport refuses mutation");
      return rpc.request(args);
    },
  };
}
export function ensReadTransport() {
  const rpc = fallback(
    ENS_RPC_URLS.map((url) => http(url, { timeout: 15000, retryCount: 0 })),
    { retryCount: 1, rank: false },
  )({ chain: sepolia });
  return custom(guardReadRpc(rpc), { retryCount: 0 });
}
