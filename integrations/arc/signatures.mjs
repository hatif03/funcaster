import {
  encodeAbiParameters,
  encodePacked,
  keccak256,
  getAddress,
  zeroAddress,
  stringToHex,
} from "viem";
import { validatePlaces, PAYOUT_RULES } from "./payouts.mjs";
const bytes32 = (value) => {
  if (!/^0x[\da-f]{64}$/i.test(value || ""))
    throw Error("Expected a bytes32 value");
  return value;
};
const address = (value) => {
  const a = getAddress(value);
  if (a === zeroAddress) throw Error("Zero address is not allowed");
  return a;
};
const uint = (value) => {
  if (typeof value !== "bigint" || value < 0n || value >= 1n << 256n)
    throw Error("Expected a uint256");
  return value;
};
const testnet = (chainId) => {
  if (chainId !== 5042002)
    throw Error("Only Arc testnet signatures are enabled");
  return chainId;
};
export const POT_TYPES = Object.freeze({
  Accept: [
    { name: "potId", type: "bytes32" },
    { name: "termsHash", type: "bytes32" },
  ],
  Settle: [
    { name: "potId", type: "bytes32" },
    { name: "placesHash", type: "bytes32" },
  ],
  Contest: [{ name: "potId", type: "bytes32" }],
});
export const RECEIVE_TYPES = Object.freeze({
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
});
export function potDomain({ chainId, contract }) {
  return {
    name: "ChonksPot",
    version: "1",
    chainId: testnet(chainId),
    verifyingContract: address(contract),
  };
}
export function assetDomain({
  chainId,
  address: contract,
  name,
  version,
  decimals,
}) {
  if (!["USDC", "EURC"].includes(name) || version !== "2" || decimals !== 6)
    throw Error("Unverified six-decimal asset domain");
  return {
    name,
    version,
    chainId: testnet(chainId),
    verifyingContract: address(contract),
  };
}
export function fundingNonce(potId, seat) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "bytes32" }, { type: "address" }],
      ["chonks-fund", bytes32(potId), address(seat)],
    ),
  );
}
export function placesHash(places) {
  return keccak256(
    encodeAbiParameters([{ type: "uint8[]" }], [validatePlaces(places)]),
  );
}
// Studio's canonical on-chain encoding. metadataHash binds the game/rules
// displayed by the phone; every financial term is independently in this hash.
const textHash = (s) => keccak256(stringToHex(s));
const TERMS_HEAD = textHash(
  "TermsHead(bytes32 potId,address asset,uint256 stake,bytes32 seatsHash,uint8 rule)",
);
const TERMS_TAIL = textHash(
  "TermsTail(address oracle,uint64 fundDeadline,uint64 settleDeadline,uint32 challengeWindow,uint32 minPlaySeconds,bytes32 metadataHash)",
);
const TERMS = textHash("Terms(bytes32 head,bytes32 tail)");
export function normalizeTerms(p) {
  if (!["bigint", "string"].includes(typeof p.stake))
    throw Error("Stake must use exact integer base units");
  const seats = p.seats?.map(address),
    stake = uint(BigInt(p.stake));
  const rule = typeof p.rule === "string" ? PAYOUT_RULES[p.rule] : p.rule;
  if (
    !seats ||
    seats.length < 2 ||
    seats.length > 4 ||
    new Set(seats).size !== seats.length ||
    stake === 0n ||
    stake > ((1n << 256n) - 1n) / BigInt(seats.length) ||
    ![0, 1, 2].includes(rule)
  )
    throw Error("Invalid pot terms");
  const bounded = (value, bits) => {
    if (
      (typeof value !== "bigint" &&
        typeof value !== "string" &&
        !Number.isSafeInteger(value)) ||
      !/^\d+$/.test(String(value))
    )
      throw Error("Terms use integer base units");
    const n = BigInt(value);
    if (n < 0n || n >= 1n << BigInt(bits))
      throw Error("Term exceeds ABI bounds");
    return n;
  };
  const fundDeadline = bounded(p.fundDeadline, 64),
    settleDeadline = bounded(p.settleDeadline, 64);
  const challengeWindow = bounded(p.challengeWindow, 32),
    minPlaySeconds = bounded(p.minPlaySeconds, 32);
  if (
    challengeWindow < 60n ||
    minPlaySeconds < 1n ||
    fundDeadline + minPlaySeconds >= settleDeadline
  )
    throw Error("Invalid terms deadlines");
  return {
    asset: address(p.asset),
    stake,
    seats,
    rule,
    oracle: getAddress(p.oracle),
    fundDeadline,
    settleDeadline,
    challengeWindow: Number(challengeWindow),
    minPlaySeconds: Number(minPlaySeconds),
    metadataHash: bytes32(p.metadataHash),
  };
}
export function termsHash(potId, input) {
  const p = normalizeTerms(input);
  const head = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint8" },
      ],
      [
        TERMS_HEAD,
        bytes32(potId),
        p.asset,
        p.stake,
        keccak256(encodePacked(["address[]"], [p.seats])),
        p.rule,
      ],
    ),
  );
  const tail = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint32" },
        { type: "uint32" },
        { type: "bytes32" },
      ],
      [
        TERMS_TAIL,
        p.oracle,
        p.fundDeadline,
        p.settleDeadline,
        p.challengeWindow,
        p.minPlaySeconds,
        p.metadataHash,
      ],
    ),
  );
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }],
      [TERMS, head, tail],
    ),
  );
}
function potData(config, kind, message) {
  return {
    domain: potDomain(config),
    types: { [kind]: POT_TYPES[kind] },
    primaryType: kind,
    message,
  };
}
export function acceptData(config, { potId, termsHash }) {
  return potData(config, "Accept", {
    potId: bytes32(potId),
    termsHash: bytes32(termsHash),
  });
}
export function settleData(config, { potId, places }) {
  return potData(config, "Settle", {
    potId: bytes32(potId),
    placesHash: placesHash(places),
  });
}
export function contestData(config, potId) {
  return potData(config, "Contest", { potId: bytes32(potId) });
}
export function fundingData(
  asset,
  {
    potId,
    seat,
    contract,
    stake,
    validAfter,
    validBefore,
    fundDeadline,
    chainTime,
    balance,
    floor,
  },
) {
  [
    stake,
    validAfter,
    validBefore,
    fundDeadline,
    chainTime,
    balance,
    floor,
  ].forEach(uint);
  if (
    stake === 0n ||
    floor === 0n ||
    balance < stake + floor ||
    validAfter >= chainTime ||
    validBefore <= chainTime ||
    validBefore > fundDeadline
  )
    throw Error("Funding exceeds the balance floor or authorization window");
  return {
    domain: assetDomain(asset),
    types: RECEIVE_TYPES,
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: address(seat),
      to: address(contract),
      value: stake,
      validAfter,
      validBefore,
      nonce: fundingNonce(potId, seat),
    },
  };
}
