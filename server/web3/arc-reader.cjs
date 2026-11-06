"use strict";
// Lazy, keyless HTTP read path. No worker/provider/signer imports.
function createArcReader(config) {
  let runtime;
  return async () => {
    runtime ||= (async () => {
      const { createPublicClient, http } = await import("viem");
      const { arcDeployment } =
        await import("../../integrations/arc/config.mjs");
      const { createArcChain } =
        await import("../../integrations/arc/chain.mjs");
      const deployment = arcDeployment(config);
      const client = createPublicClient({
        cacheTime: 0,
        transport: http(config.ARC_RPC_URLS[0], {
          timeout: 10000,
          retryCount: 0,
        }),
      });
      return createArcChain({ client, deployment });
    })().catch((error) => {
      runtime = null;
      throw error;
    });
    return runtime;
  };
}
module.exports = { createArcReader };
