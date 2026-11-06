import { encodeAbiParameters, keccak256 } from "viem";
const address = (value) => /^0x[\da-f]{40}$/i.test(value);
export function fundingNonce(q) {
  const common = [{ type: "uint256" }, { type: "address" }];
  if (q.kind === "cheer")
    return keccak256(
      encodeAbiParameters(
        [
          ...common,
          { type: "bytes32" },
          { type: "address" },
          { type: "uint256" },
          { type: "bytes32" },
        ],
        [
          BigInt(q.chainId),
          q.contract,
          q.marketRef,
          q.bettor,
          BigInt(q.amount),
          q.salt,
        ],
      ),
    );
  return keccak256(
    encodeAbiParameters(
      [
        ...common,
        { type: "uint256" },
        { type: "uint8" },
        { type: "uint128" },
        { type: "uint128" },
        { type: "address" },
        { type: "bytes32" },
      ],
      [
        BigInt(q.chainId),
        q.contract,
        BigInt(q.chainMarketId),
        q.outcome,
        BigInt(q.amount),
        BigInt(q.minPayout),
        q.bettor,
        q.salt,
      ],
    ),
  );
}
export function fundingIntent(
  q,
  { allowLocal = false, now = Date.now() } = {},
) {
  if (
    !["prediction", "cheer"].includes(q.kind) ||
    (q.chainId !== 5042002 && !(allowLocal && q.chainId === 31337)) ||
    ![q.contract, q.asset, q.bettor].every(address) ||
    q.symbol !== "USDC" ||
    !/^0x[\da-f]{64}$/i.test(q.marketRef) ||
    !/^0x[\da-f]{64}$/i.test(q.salt) ||
    !/^\d+$/.test(String(q.validBefore)) ||
    Number(q.validBefore) * 1000 <= now ||
    Number(q.validBefore) * 1000 > now + 130_000 ||
    BigInt(q.validAfter) !== 0n ||
    BigInt(q.amount) < 50_000n ||
    BigInt(q.amount) > 1_000_000n ||
    BigInt(q.minPayout) < 0n ||
    BigInt(q.minPayout) > 25_000_000n
  )
    throw Error("Invalid bounded testnet prediction");
  if (
    q.kind === "cheer" &&
    !["50000", "100000", "250000"].includes(String(q.amount))
  )
    throw Error("Invalid cheer preset");
  if (
    q.kind === "prediction" &&
    (!Number.isInteger(q.outcome) ||
      q.outcome < 0 ||
      q.outcome > 3 ||
      !/^\d+$/.test(String(q.chainMarketId)))
  )
    throw Error("Invalid prediction outcome");
  return {
    domain: {
      name: q.symbol,
      version: "2",
      chainId: q.chainId,
      verifyingContract: q.asset,
    },
    types: {
      ReceiveWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: q.bettor,
      to: q.contract,
      value: BigInt(q.amount),
      validAfter: 0n,
      validBefore: BigInt(q.validBefore),
      nonce: fundingNonce(q),
    },
  };
}
