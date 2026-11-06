/**
 * Off-chain mirror of the ConditionalPot message formats, for phones and the relay.
 * Pure functions, no network, no keys. Every output is checked against known answers
 * produced by the Solidity tests (see signing.test.ts and Misc.t.sol).
 */

import {
  encodeAbiParameters,
  encodePacked,
  keccak256,
  parseAbiParameters,
  stringToHex,
  type Address,
  type Hex,
} from "viem";

export const POT_DOMAIN_NAME = "ChonksPot";
export const POT_DOMAIN_VERSION = "1";

export const RULES = [
  "WINNER_TAKES_ALL",
  "TOP2_70_30",
  "EQUAL_AMONG_TOP",
] as const;
export type RuleName = (typeof RULES)[number];

export interface TermsInput {
  potId: Hex;
  asset: Address;
  stake: bigint;
  seats: readonly Address[];
  rule: RuleName;
  oracle: Address;
  fundDeadline: bigint;
  settleDeadline: bigint;
  challengeWindow: number;
  minPlaySeconds: number;
  /** Opaque commitment to off-chain terms (game rules, rulebook version). */
  metadataHash: Hex;
}

const typehash = (text: string): Hex => keccak256(stringToHex(text));

const TERMS_HEAD_TYPEHASH = typehash(
  "TermsHead(bytes32 potId,address asset,uint256 stake,bytes32 seatsHash,uint8 rule)",
);
const TERMS_TAIL_TYPEHASH = typehash(
  "TermsTail(address oracle,uint64 fundDeadline,uint64 settleDeadline,uint32 challengeWindow,uint32 minPlaySeconds,bytes32 metadataHash)",
);
const TERMS_TYPEHASH = typehash("Terms(bytes32 head,bytes32 tail)");

/** The canonical terms hash ConditionalPot derives on-chain and each seat signs in Accept. */
export function hashTerms(t: TermsInput): Hex {
  const seatsHash = keccak256(encodePacked(["address[]"], [t.seats]));
  const head = keccak256(
    encodeAbiParameters(
      parseAbiParameters("bytes32, bytes32, address, uint256, bytes32, uint8"),
      [
        TERMS_HEAD_TYPEHASH,
        t.potId,
        t.asset,
        t.stake,
        seatsHash,
        RULES.indexOf(t.rule),
      ],
    ),
  );
  const tail = keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "bytes32, address, uint64, uint64, uint32, uint32, bytes32",
      ),
      [
        TERMS_TAIL_TYPEHASH,
        t.oracle,
        t.fundDeadline,
        t.settleDeadline,
        t.challengeWindow,
        t.minPlaySeconds,
        t.metadataHash,
      ],
    ),
  );
  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, bytes32, bytes32"), [
      TERMS_TYPEHASH,
      head,
      tail,
    ]),
  );
}

/** keccak256(abi.encode(uint8[] places)) */
export function hashPlaces(places: readonly number[]): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("uint8[]"), [places]),
  );
}

/** keccak256(abi.encode("chonks-fund", potId, seat)): the ERC-3009 nonce the pot requires. */
export function fundingNonce(potId: Hex, seat: Address): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("string, bytes32, address"), [
      "chonks-fund",
      potId,
      seat,
    ]),
  );
}

export function potDomain(chainId: number, verifyingContract: Address) {
  return {
    name: POT_DOMAIN_NAME,
    version: POT_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  } as const;
}

/** EIP-712 typed data for the seat's Accept(potId, termsHash). */
export function acceptTypedData(
  chainId: number,
  verifyingContract: Address,
  potId: Hex,
  termsHash: Hex,
) {
  return {
    domain: potDomain(chainId, verifyingContract),
    types: {
      Accept: [
        { name: "potId", type: "bytes32" },
        { name: "termsHash", type: "bytes32" },
      ],
    },
    primaryType: "Accept",
    message: { potId, termsHash },
  } as const;
}

/** EIP-712 typed data for a seat's Settle(potId, placesHash). */
export function settleTypedData(
  chainId: number,
  verifyingContract: Address,
  potId: Hex,
  places: readonly number[],
) {
  return {
    domain: potDomain(chainId, verifyingContract),
    types: {
      Settle: [
        { name: "potId", type: "bytes32" },
        { name: "placesHash", type: "bytes32" },
      ],
    },
    primaryType: "Settle",
    message: { potId, placesHash: hashPlaces(places) },
  } as const;
}

/** EIP-712 typed data for a seat's Contest(potId). */
export function contestTypedData(
  chainId: number,
  verifyingContract: Address,
  potId: Hex,
) {
  return {
    domain: potDomain(chainId, verifyingContract),
    types: { Contest: [{ name: "potId", type: "bytes32" }] },
    primaryType: "Contest",
    message: { potId },
  } as const;
}
