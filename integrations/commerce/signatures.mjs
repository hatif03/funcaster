import { getAddress, keccak256, stringToHex } from "viem";
import { address } from "./math.mjs";
export const USDC = "0x3600000000000000000000000000000000000000";
export const passTypes = {
  PassPermit: [
    { name: "paymentId", type: "bytes32" },
    { name: "versionId", type: "bytes32" },
    { name: "payer", type: "address" },
    { name: "roomHash", type: "bytes32" },
    { name: "attribution", type: "bool" },
    { name: "referred", type: "bool" },
    { name: "atVenue", type: "bool" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
  ],
};
export const receiveTypes = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};
export const claimTypes = {
  ClaimPermit: [
    { name: "recipient", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};
const hex = (value) => {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value || "") || /^0x0{64}$/.test(value))
    throw Error("INVALID_ID");
  return value;
};
export function commerceDomain(config) {
  if (config.chainId !== 5042002) throw Error("ARC_TESTNET_ONLY");
  return {
    name: "ChonksRevenueRouter",
    version: "1",
    chainId: 5042002,
    verifyingContract: getAddress(address(config.contract)),
  };
}
export const commerceId = (value) => keccak256(stringToHex(String(value)));
export function paymentData(
  config,
  {
    versionId,
    paymentId,
    payer,
    roomCode,
    price,
    attribution = false,
    referred = false,
    atVenue = false,
    chainTime,
    balance,
  },
) {
  const domain = commerceDomain(config),
    amount = BigInt(price),
    time = BigInt(chainTime);
  if (amount <= 0n || amount > 100000000n || BigInt(balance) - amount < 50000n)
    throw Error("DRAIN_FLOOR");
  if (attribution && referred) throw Error("INVALID_ATTRIBUTION");
  if (!/^[a-zA-Z0-9_-]{6,100}$/.test(roomCode)) throw Error("INVALID_ROOM");
  const request = {
    paymentId: hex(paymentId),
    versionId: hex(versionId),
    payer: getAddress(address(payer)),
    roomHash: commerceId(roomCode),
    attribution: !!attribution,
    referred: !!referred,
    atVenue: !!atVenue,
    validAfter: time > 0n ? time - 1n : 0n,
    validBefore: time + 300n,
  };
  return {
    permit: {
      domain,
      primaryType: "PassPermit",
      types: passTypes,
      message: request,
    },
    authorization: {
      domain: {
        name: "USDC",
        version: "2",
        chainId: 5042002,
        verifyingContract: USDC,
      },
      primaryType: "ReceiveWithAuthorization",
      types: receiveTypes,
      message: {
        from: request.payer,
        to: domain.verifyingContract,
        value: amount,
        validAfter: request.validAfter,
        validBefore: request.validBefore,
        nonce: request.paymentId,
      },
    },
  };
}
export function claimData(config, { recipient, nonce, chainTime }) {
  const who = getAddress(address(recipient));
  return {
    domain: commerceDomain(config),
    primaryType: "ClaimPermit",
    types: claimTypes,
    message: {
      recipient: who,
      nonce: BigInt(nonce),
      deadline: BigInt(chainTime) + 300n,
    },
  };
}
