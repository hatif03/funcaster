// integrations/market/types.mjs
var MOCK_CONTRACT = "0x7777777777777777777777777777777777777777";
var MARKET_DOMAIN = {
  name: "Funcaster Local Predictions",
  version: "1",
  chainId: 5042002,
  verifyingContract: MOCK_CONTRACT,
};
function identityData(nonce, expiresAt) {
  return {
    domain: MARKET_DOMAIN,
    primaryType: "Spectator",
    types: {
      Spectator: [
        { name: "nonce", type: "bytes32" },
        { name: "expiresAt", type: "uint256" },
      ],
    },
    message: { nonce, expiresAt: BigInt(expiresAt) },
  };
}
function betData({
  marketId,
  outcome,
  amount,
  minPayout,
  nonce,
  expiresAt,
  kind = "prediction",
}) {
  if (
    !/^0x[\da-f]{64}$/i.test(marketId) ||
    !/^0x[\da-f]{64}$/i.test(nonce) ||
    !["prediction", "cheer"].includes(kind) ||
    !Number.isInteger(outcome) ||
    outcome < 0 ||
    outcome > 3 ||
    BigInt(amount) < 50000n ||
    BigInt(amount) > 1000000n ||
    BigInt(minPayout) < 0n ||
    BigInt(minPayout) > 25000000n ||
    !Number.isSafeInteger(expiresAt)
  )
    throw Error("Invalid prediction intent");
  return {
    domain: MARKET_DOMAIN,
    primaryType: "Prediction",
    types: {
      Prediction: [
        { name: "marketId", type: "bytes32" },
        { name: "kind", type: "string" },
        { name: "outcome", type: "uint8" },
        { name: "amount", type: "uint128" },
        { name: "minPayout", type: "uint128" },
        { name: "nonce", type: "bytes32" },
        { name: "expiresAt", type: "uint256" },
      ],
    },
    message: {
      marketId,
      kind,
      outcome,
      amount: BigInt(amount),
      minPayout: BigInt(minPayout),
      nonce,
      expiresAt: BigInt(expiresAt),
    },
  };
}
function reportData(marketId, resultHash, winMask) {
  return {
    domain: MARKET_DOMAIN,
    primaryType: "Report",
    types: {
      Report: [
        { name: "marketId", type: "bytes32" },
        { name: "resultHash", type: "bytes32" },
        { name: "winMask", type: "uint8" },
      ],
    },
    message: {
      marketId,
      resultHash: resultHash.startsWith("0x") ? resultHash : `0x${resultHash}`,
      winMask,
    },
  };
}
export { MARKET_DOMAIN, MOCK_CONTRACT, betData, identityData, reportData };
