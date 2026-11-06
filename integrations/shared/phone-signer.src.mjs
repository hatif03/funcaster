import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { bindData } from "./bind-types.mjs";
import {
  acceptData,
  fundingData,
  termsHash,
  settleData,
  contestData,
} from "../arc/signatures.mjs";
import { placesFromResult } from "../arc/payouts.mjs";
const STORAGE_KEY = "chonks.web3.key";
let account;
export function loadOrCreateKey(storage = globalThis.localStorage) {
  if (account) return account.address;
  const saved = storage.getItem(STORAGE_KEY);
  // Do not silently rotate a corrupt/lost persistent key; the player stays a guest.
  if (saved) {
    account = privateKeyToAccount(saved);
    return account.address;
  }
  const key = generatePrivateKey();
  storage.setItem(STORAGE_KEY, key);
  account = privateKeyToAccount(key);
  return account.address;
}
export function address() {
  return account?.address ?? null;
}
export function signTyped(data) {
  if (!account) throw new Error("Session identity unavailable");
  return account.signTypedData(data);
}
export async function signBind(challenge, seat) {
  if (
    !challenge ||
    !/^0x[\da-f]{64}$/i.test(challenge.nonce) ||
    !Number.isSafeInteger(challenge.expiresAt) ||
    challenge.domain?.name !== "Funcaster" ||
    challenge.domain?.version !== "1" ||
    !Number.isSafeInteger(challenge.domain?.chainId) ||
    !/^0x[\da-f]{64}$/i.test(challenge.domain?.salt) ||
    !Number.isInteger(seat.slot) ||
    seat.slot < 0 ||
    seat.slot > 3 ||
    !/^[A-Z2-9]{6}$/.test(seat.room)
  )
    throw Error("Invalid session challenge");
  loadOrCreateKey();
  return {
    address: address(),
    signature: await signTyped(bindData(challenge, seat)),
  };
}

// Rebuild the only permitted messages locally; never sign arbitrary typedData
// received over the socket. Consent binds a bounded testnet stake to this key.
export async function signStakeTerms(request, time = Date.now()) {
  const t = request.terms,
    f = request.typedData?.fund?.message;
  if (
    request.kind !== "terms" ||
    !account ||
    request.expiresAt <= time ||
    !t ||
    !["USDC", "EURC"].includes(request.asset) ||
    !["500000", "1000000", "2000000"].includes(String(t.stake)) ||
    !t.seats.some((a) => a.toLowerCase() === account.address.toLowerCase()) ||
    t.seats.length !== request.slots.length ||
    Number(t.fundDeadline) * 1000 <= time ||
    Number(t.settleDeadline) - Number(t.fundDeadline) > 3600 ||
    request.typedData?.accept?.message?.termsHash !==
      termsHash(request.potId, t)
  )
    throw Error("Invalid play-money terms");
  const assets = {
    USDC: "0x3600000000000000000000000000000000000000",
    EURC: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  };
  if (
    t.asset.toLowerCase() !== assets[request.asset].toLowerCase() ||
    BigInt(t.stake) !== BigInt(Math.round(Number(request.amount) * 1e6)) ||
    { winner: 0, top2: 1, equal: 2 }[request.rule] !== t.rule
  )
    throw Error("Terms differ from the card");
  const config = { chainId: 5042002, contract: request.contract };
  const funding = fundingData(
    {
      chainId: 5042002,
      address: t.asset,
      name: request.asset,
      version: "2",
      decimals: 6,
    },
    {
      potId: request.potId,
      seat: account.address,
      contract: request.contract,
      stake: BigInt(t.stake),
      validAfter: BigInt(f.validAfter),
      validBefore: BigInt(f.validBefore),
      fundDeadline: BigInt(t.fundDeadline),
      chainTime: BigInt(Math.floor(time / 1000)),
      balance: BigInt(t.stake) + 50000n,
      floor: 50000n,
    },
  );
  return {
    accept: await signTyped(
      acceptData(config, {
        potId: request.potId,
        termsHash: termsHash(request.potId, t),
      }),
    ),
    fund: await signTyped(funding),
  };
}
export async function signStakeResult(
  request,
  result,
  consent,
  disputed = false,
  time = Date.now(),
) {
  if (
    !consent ||
    request.potId !== consent.potId ||
    request.contract !== consent.contract ||
    request.expiresAt <= time ||
    !account ||
    consent.address?.toLowerCase() !== account.address.toLowerCase()
  )
    throw Error("No consent for this pot");
  const config = { chainId: 5042002, contract: consent.contract };
  if (disputed) return signTyped(contestData(config, request.potId));
  if (
    result?.hash !== request.result?.hash ||
    time < request.agreeAt ||
    JSON.stringify(request.slots) !== JSON.stringify(consent.slots)
  )
    throw Error("Result is not ready");
  const places = placesFromResult(result, consent.slots);
  if (JSON.stringify(places) !== JSON.stringify(request.places))
    throw Error("Result differs from the game");
  return signTyped(settleData(config, { potId: request.potId, places }));
}
