import { arcClient } from "../arc/provider.mjs";
import { createCommerceChain } from "../commerce/chain.mjs";
export async function commercePorts(config, transactions) {
  const deployment = {
    chainId: 5042002,
    address: config.ROUTER_ADDRESS,
    runtimeHash: config.ROUTER_CODE_HASH,
    blockNumber: config.ROUTER_DEPLOY_BLOCK,
    operator: config.ROUTER_OPERATOR_ADDRESS,
    platform: config.ROUTER_PLATFORM_ADDRESS,
  };
  const chain = await createCommerceChain({
    clients: config.ARC_RPC_URLS.slice(0, 2).map(arcClient),
    deployment,
    transactions,
  });
  return { chain, deployment };
}
