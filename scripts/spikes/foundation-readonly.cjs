// Discovery only: no wallet client, private key, transaction or funding request.
const { createPublicClient, http, parseAbi, hashDomain } = require("viem");
const { sepolia } = require("viem/chains");
const { readFile, writeFile } = require("node:fs/promises");
const { loadConfig } = require("../../integrations/shared/config.mjs");
async function main() {
  const inputs = JSON.parse(await readFile(process.argv[2], "utf8"));
  const config = loadConfig({ PARTNERS: "off" });
  const publicInventory = JSON.parse(
    await readFile(".local/web3-keys/addresses.json", "utf8"),
  );
  const address = (role) =>
    publicInventory.roles.find((r) => r.role === role).address;
  const rows = [];
  const report = {
    at: new Date().toISOString(),
    scope: "READ ONLY / PARTIAL G0; no writes or transactions",
    sources: inputs.sources,
    rows,
  };
  async function run(lane, fn) {
    try {
      rows.push({ lane, ...(await fn()) });
    } catch (e) {
      rows.push({
        lane,
        error: e.shortMessage || e.message,
        result: "FAIL-OPEN",
      });
    }
  }
  await Promise.all([
    run("ENS availability", async () => {
      const doc = await (
        await fetch(inputs.ensAbiUrl, { signal: AbortSignal.timeout(10000) })
      ).json();
      if (doc.address.toLowerCase() !== inputs.ensRegistrar.toLowerCase())
        throw Error("ENS docs address / pinned ABI mismatch");
      const client = createPublicClient({
        chain: sepolia,
        transport: http(inputs.ensRpc || sepolia.rpcUrls.default.http[0], {
          timeout: 10000,
          retryCount: 0,
        }),
      });
      const chainId = await client.getChainId();
      if (chainId !== sepolia.id) throw Error("Wrong ENS chain");
      const code = await client.getCode({ address: doc.address });
      if (!code || code === "0x") throw Error("Registrar has no code");
      const available = {};
      for (const name of inputs.candidates)
        available[`${name}.eth`] = await client.readContract({
          address: doc.address,
          abi: doc.abi,
          functionName: "isAvailable",
          args: [name],
        });
      return {
        chainId,
        registrar: doc.address,
        block: String(await client.getBlockNumber()),
        available,
        registrarGasWei: String(
          await client.getBalance({ address: address("ENS_REGISTRAR_KEY") }),
        ),
        result: "READS-PASS; VE-01 remains OPEN until registration/roles",
      };
    }),
    ...config.ARC_RPC_URLS.map((rpc) =>
      run(`Arc ${new URL(rpc).hostname}`, async () => {
        const client = createPublicClient({
          transport: http(rpc, { timeout: 10000, retryCount: 0 }),
        });
        const chainId = await client.getChainId();
        if (chainId !== config.ARC_CHAIN_ID) throw Error("Wrong Arc chain");
        const abi = parseAbi([
          "function decimals() view returns (uint8)",
          "function name() view returns (string)",
          "function version() view returns (string)",
          "function DOMAIN_SEPARATOR() view returns (bytes32)",
          "function balanceOf(address) view returns (uint256)",
        ]);
        const read = (functionName, args) =>
          client.readContract({
            address: config.ARC_USDC,
            abi,
            functionName,
            args,
          });
        const [decimals, name, version, domain, relayerBalance, block] =
          await Promise.all([
            read("decimals"),
            read("name"),
            read("version"),
            read("DOMAIN_SEPARATOR"),
            read("balanceOf", [address("ARC_RELAYER_KEY")]),
            client.getBlock(),
          ]);
        const expected = hashDomain({
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
          },
          domain: {
            name,
            version,
            chainId,
            verifyingContract: config.ARC_USDC,
          },
        });
        return {
          chainId,
          decimals,
          name,
          version,
          domainMatches: domain === expected,
          block: String(block.number),
          baseFeeWei: String(block.baseFeePerGas),
          relayerBalanceBaseUnits: String(relayerBalance),
          result:
            decimals === 6 && domain === expected
              ? "READS-PASS; VA-01 writes and VA-12 remain OPEN"
              : "FAIL-OPEN",
        };
      }),
    ),
  ]);
  await writeFile(
    "docs/web3/spikes/foundation-readonly.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
main().catch((e) => {
  console.error(e.code || "Read-only discovery failed");
  process.exitCode = 1;
});
