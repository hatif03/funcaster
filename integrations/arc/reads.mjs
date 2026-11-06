import { getAddress, keccak256 } from "viem";
import { termsHash, normalizeTerms } from "./signatures.mjs";
import { verifyPotDomain } from "./assets.mjs";

const same = (a, b) =>
  typeof a === "string" && a.toLowerCase() === b?.toLowerCase();
export const POT_STATES = Object.freeze([
  "None",
  "Funding",
  "Locked",
  "Proposed",
  "Contested",
  "Settled",
  "Refunded",
]);
export function createPotReader({
  client,
  abi,
  config,
  now = Date.now,
  localGuard,
}) {
  if (
    (config.chainId !== 5042002 &&
      !(config.chainId === 31337 && typeof localGuard === "function")) ||
    !/^0x[\da-f]{64}$/i.test(config.runtimeCodeHash || "") ||
    !Array.isArray(config.assets) ||
    config.assets.length < 1 ||
    config.assets.length > 4
  )
    throw Error("Verified testnet deployment configuration is required");
  const contract = getAddress(config.contract);
  const assets = config.assets.map(getAddress);
  if (new Set(assets).size !== assets.length)
    throw Error("Duplicate allowed assets");
  const fresh = (block) => {
    if (
      typeof block.number !== "bigint" ||
      !/^0x[\da-f]{64}$/i.test(block.hash || "") ||
      typeof block.timestamp !== "bigint" ||
      now() / 1000 - Number(block.timestamp) > 30 ||
      Number(block.timestamp) > now() / 1000 + 5
    )
      throw Error("Arc read is stale");
  };
  async function deployment() {
    if (config.chainId === 31337) await localGuard();
    if ((await client.getChainId()) !== config.chainId)
      throw Error("Arc RPC chain mismatch");
    const block = await client.getBlock({ blockTag: "latest" });
    fresh(block);
    const call = (functionName, args = []) =>
      client.readContract({
        address: contract,
        abi,
        functionName,
        args,
        blockNumber: block.number,
      });
    const [code, domain, allowed] = await Promise.all([
      client.getCode({ address: contract, blockNumber: block.number }),
      verifyPotDomain(
        client,
        { chainId: config.chainId, contract },
        block.number,
        localGuard,
      ),
      call("allowedAssets"),
    ]);
    if (
      !code ||
      !same(keccak256(code), config.runtimeCodeHash) ||
      allowed.length !== assets.length ||
      allowed.some((a, i) => !same(a, assets[i]))
    )
      throw Error("Arc deployment code or asset allowlist differs");
    await finish(block);
    return { block, domain, call };
  }
  async function finish(block) {
    const canonical = await client.getBlock({ blockNumber: block.number });
    if (
      !same(canonical.hash, block.hash) ||
      canonical.timestamp !== block.timestamp ||
      (await client.getChainId()) !== config.chainId
    )
      throw Error("Arc read changed chain or block");
    fresh(block);
  }
  async function snapshot(potId, { allowMissing = false } = {}) {
    if (!/^0x[\da-f]{64}$/i.test(potId || "")) throw Error("Invalid pot ID");
    const { block, domain, call } = await deployment();
    const base = {
      potId,
      contract,
      chainId: config.chainId,
      mode: "on",
      domain,
      blockNumber: String(block.number),
      blockHash: block.hash,
      chainTime: Number(block.timestamp),
      observedAt: now(),
      chainVerified: false,
    };
    let pot;
    try {
      pot = await call("getPot", [potId]);
    } catch (error) {
      if (
        !allowMissing ||
        !error.walk?.((e) => e.data?.errorName === "UnknownPot")
      )
        throw error;
      await finish(block);
      return { ...base, state: "None" };
    }
    const terms = normalizeTerms({ ...pot });
    if (
      !assets.some((a) => same(a, terms.asset)) ||
      !same(termsHash(potId, terms), pot.termsHash) ||
      pot.total !== terms.stake * BigInt(terms.seats.length) ||
      !Number.isInteger(pot.state) ||
      pot.state < 1 ||
      pot.state >= POT_STATES.length
    )
      throw Error("Pot terms or state are inconsistent");
    const full = (1 << terms.seats.length) - 1;
    if (
      !Number.isInteger(pot.fundedBitmap) ||
      pot.fundedBitmap < 0 ||
      pot.fundedBitmap > full ||
      pot.acceptedBitmap !== pot.fundedBitmap ||
      (![1, 6].includes(pot.state) && pot.fundedBitmap !== full)
    )
      throw Error("Pot funding bitmap is inconsistent");
    const claimables = await Promise.all(
      terms.seats.map((seat) => call("claimableOf", [potId, seat])),
    );
    if (
      claimables.some((a) => typeof a !== "bigint" || a < 0n) ||
      claimables.reduce((a, b) => a + b, 0n) > pot.total ||
      (![5, 6].includes(pot.state) && claimables.some((a) => a !== 0n))
    )
      throw Error("Pot claimable balances are inconsistent");
    await finish(block);
    return {
      ...base,
      termsHash: pot.termsHash,
      state: POT_STATES[pot.state],
      fundedBitmap: pot.fundedBitmap,
      lockedAt: Number(pot.lockedAt),
      proposalAt: Number(pot.proposal.at),
      placesHash: pot.proposal.placesHash,
      resultHash: pot.proposal.resultHash,
      terms,
      claimables,
      chainVerified: false,
    };
  }
  return { snapshot, deployment, finish };
}
