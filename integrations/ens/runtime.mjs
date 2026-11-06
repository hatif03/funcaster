import { createPublicClient } from "viem";
import { ensRpcTransport } from "./rpc.mjs";
import { sepolia } from "viem/chains";
import pin from "./deployment-pin.json" with { type: "json" };
import { requireEns } from "./errors.mjs";

export const CONTRACT_KEYS = Object.freeze({
  // ensjs 5.2.7 does not expose RootRegistry. Use the pinned official deployment
  // and verify UniversalHelper.ROOT_REGISTRY plus the fresh docs table.
  RootRegistry: ["rootRegistry", null],
  ETHRegistry: ["ethRegistry", "ensRegistry"],
  VerifiableFactory: ["factory", "ensVerifiableFactory"],
  UserRegistryImpl: ["userRegistryImpl", "ensUserRegistryImpl"],
  PermissionedResolverImpl: ["resolverImpl", "ensPermissionedResolverImpl"],
  UniversalHelper: ["universalHelper", "ensUniversalHelper"],
});

// Optional runtime dependency: offline tests and partner-off play never load it.
// npm ci --ignore-scripts --prefix integrations/ens installs the exact SDK pin.
export async function loadProtocol() {
  const [{ addEnsContracts }, { encodeRoleBitmap, encodeResolverRoleBitmap }] =
    await Promise.all([
      import("@ensdomains/ensjs"),
      import("@ensdomains/ensjs/utils/v2"),
    ]);
  const chain = addEnsContracts(sepolia);
  const contracts = {};
  for (const [name, [key, sdkKey]] of Object.entries(CONTRACT_KEYS)) {
    const address = sdkKey
      ? chain.contracts[sdkKey]?.address
      : pin.contracts[name];
    requireEns(
      address?.toLowerCase() === pin.contracts[name].toLowerCase(),
      "SDK_DRIFT",
      `SDK deployment differs from the reviewed ABI pin: ${name}`,
    );
    contracts[key] = address;
  }
  return Object.freeze({
    chainId: sepolia.id,
    chain,
    contracts,
    // IPermissionedRegistry.Status at pin.commit: AVAILABLE, RESERVED, REGISTERED.
    registeredStatus: 2,
    hostRoles: {
      control: encodeResolverRoleBitmap(["ROLE_SET_TEXT"]),
      kick: encodeRoleBitmap(["ROLE_UNREGISTER"]),
    },
    registryRoles: encodeRoleBitmap([
      "ROLE_REGISTRAR",
      "ROLE_REGISTRAR_ADMIN",
      "ROLE_RENEW",
      "ROLE_RENEW_ADMIN",
      "ROLE_UNREGISTER",
      "ROLE_UNREGISTER_ADMIN",
      "ROLE_SET_SUBREGISTRY",
      "ROLE_SET_RESOLVER",
      "ROLE_SET_PARENT",
    ]),
    resolverRoles: encodeResolverRoleBitmap([
      "ROLE_SET_TEXT",
      "ROLE_SET_TEXT_ADMIN",
      "ROLE_SET_ADDRESS",
      "ROLE_SET_ADDRESS_ADMIN",
    ]),
  });
}

export function createReadClient(protocol, url) {
  const target = new URL(url);
  requireEns(
    target.protocol === "https:" &&
      !target.username &&
      !target.password &&
      !target.hash,
    "INVALID_RPC",
    "Live ENS reads require an HTTPS RPC without embedded credentials",
  );
  const transport = ensRpcTransport(url);
  const methods = new Set([
    "eth_chainId",
    "eth_blockNumber",
    "eth_getBlockByNumber",
    "eth_getCode",
    "eth_call",
    "eth_getLogs",
    "eth_getTransactionByHash",
    "eth_getTransactionReceipt",
  ]);
  return createPublicClient({
    chain: protocol.chain,
    cacheTime: 0,
    transport: (options) => {
      const base = transport(options);
      return {
        ...base,
        request: async (request, ...rest) => {
          requireEns(
            methods.has(request.method),
            "READ_ONLY",
            "ENS reader refuses a non-read RPC method",
          );
          return base.request(request, ...rest);
        },
      };
    },
  });
}
