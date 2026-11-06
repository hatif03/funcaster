import { describe, expect, it } from "vitest";
import { hashTypedData, keccak256, stringToHex } from "viem";
import {
  acceptTypedData,
  contestTypedData,
  fundingNonce,
  hashPlaces,
  hashTerms,
  settleTypedData,
  type TermsInput,
} from "./signing";

// Known answers frozen in contracts/test/Misc.t.sol (test_knownAnswers_sharedWithTypeScript).
// The expected values below were produced by the Solidity contract, not by this code.
const POT = "0xF62849F9A0B5Bf2913b396098F7c7019b51A820a" as const;
const CHAIN_ID = 31337;
const ID = keccak256(stringToHex("pot-1"));

const terms: TermsInput = {
  potId: ID,
  asset: "0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f",
  stake: 1_000_000n,
  seats: [
    "0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7",
    "0x0376AAc07Ad725E01357B1725B5ceC61aE10473c",
    "0x0F89F1868aF3b14a5eca86ed9a5404A742a11454",
  ],
  rule: "TOP2_70_30",
  oracle: "0x5F084Ee99790C8150F9FE7BD7bcCBC979F9F5Dd0",
  fundDeadline: 1_700_003_600n,
  settleDeadline: 1_700_086_400n,
  challengeWindow: 300,
  minPlaySeconds: 60,
  metadataHash: keccak256(stringToHex("chonks terms v1")),
};

describe("message formats match the contract", () => {
  it("derives the same canonical terms hash", () => {
    expect(hashTerms(terms)).toBe(
      "0x0f52473ee39ec509df5fc8f5d9ba9ac7c53e7480798804fea2b43bb8b742c7f3",
    );
  });

  it("changes the terms hash when any executable parameter changes", () => {
    const base = hashTerms(terms);
    const variants: Partial<TermsInput>[] = [
      { potId: keccak256(stringToHex("pot-2")) },
      { stake: 1_000_001n },
      { rule: "WINNER_TAKES_ALL" },
      { oracle: "0x0376AAc07Ad725E01357B1725B5ceC61aE10473c" },
      { fundDeadline: 1_700_003_601n },
      { settleDeadline: 1_700_086_401n },
      { challengeWindow: 301 },
      { minPlaySeconds: 61 },
      { seats: [terms.seats[1], terms.seats[0], terms.seats[2]] },
      { metadataHash: keccak256(stringToHex("other")) },
    ];
    for (const v of variants)
      expect(hashTerms({ ...terms, ...v })).not.toBe(base);
  });

  it("hashes places like abi.encode(uint8[])", () => {
    expect(hashPlaces([1, 1, 2])).toBe(
      "0x994e6ca720801e62b5cfec185d05a54cd20676bb5f16d480e8b3f6f09920ce29",
    );
  });

  it("derives the funding nonce", () => {
    expect(fundingNonce(ID, terms.seats[1])).toBe(
      "0x7646387e312c2387400d1267d104cbf5797a3b96d09fb3104daab1105723e1ed",
    );
  });

  it("produces the same EIP-712 digests as the contract", () => {
    const termsHash = hashTerms(terms);
    expect(hashTypedData(acceptTypedData(CHAIN_ID, POT, ID, termsHash))).toBe(
      "0xa926c75162b309d5b4495789b223f42634cab716a8a3f681daa8cb3d91de0c9a",
    );
    expect(hashTypedData(settleTypedData(CHAIN_ID, POT, ID, [1, 1, 2]))).toBe(
      "0x448cd79fad3b5f0ee567989fb675c2bcbea8540a1f431231f52a29da0df6afe5",
    );
    expect(hashTypedData(contestTypedData(CHAIN_ID, POT, ID))).toBe(
      "0x0809eeba3d6e488330ea828aa2f8ae2a31d0351cab6f08d42e0aa956854f9282",
    );
  });

  it("binds signatures to the chain and the contract", () => {
    const a = hashTypedData(contestTypedData(CHAIN_ID, POT, ID));
    expect(hashTypedData(contestTypedData(CHAIN_ID + 1, POT, ID))).not.toBe(a);
    expect(
      hashTypedData(
        contestTypedData(
          CHAIN_ID,
          "0x00000000000000000000000000000000000000a1",
          ID,
        ),
      ),
    ).not.toBe(a);
    expect(
      hashTypedData(
        contestTypedData(CHAIN_ID, POT, keccak256(stringToHex("pot-2"))),
      ),
    ).not.toBe(a);
  });
});
