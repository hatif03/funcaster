"use strict";
// Public, lazy read-only runtime. Worker secrets are never imported here.
function createEnsReader(config) {
  let runtime;
  return async () => {
    if (!runtime)
      runtime = (async () => {
        const { loadProtocol, createReadClient } =
          await import("../../integrations/ens/runtime.mjs");
        const { createEnsAuthority } =
          await import("../../integrations/ens/authority.mjs");
        const { createEnsReads } =
          await import("../../integrations/ens/reads.mjs");
        const protocol = await loadProtocol();
        const client = createReadClient(protocol, config.ENS_RPC_URLS[0]);
        const options = {
          client,
          protocol,
          parent: config.ENS_PARENT,
          owner: config.ENS_REGISTRAR_ADDRESS,
        };
        return {
          ...createEnsAuthority(options),
          reads: createEnsReads(options),
        };
      })().catch((error) => {
        runtime = null;
        throw error;
      });
    return runtime;
  };
}
module.exports = { createEnsReader };
