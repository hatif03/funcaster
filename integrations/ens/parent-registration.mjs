import { randomBytes } from "node:crypto";
import path from "node:path";
import { keccak256, stringToHex, zeroAddress, zeroHash } from "viem";
import { atomicJson, readJson, digest } from "../shared/outbox.mjs";
import { checkedParent, labelId } from "./names.mjs";
import { requireEns } from "./errors.mjs";

const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();
export const parentTransactionId = (input, stage) =>
  `record:${digest(`ens-parent:${input.parent}`)}:parent:${stage}`;
export function registrationInput({
  parent,
  owner,
  durationSeconds = 63072000,
}) {
  parent = checkedParent(parent);
  requireEns(
    /^0x[\da-f]{40}$/i.test(owner) && !same(owner, zeroAddress),
    "INVALID_OWNER",
    "A nonzero public registrar address is required",
  );
  requireEns(
    Number.isSafeInteger(durationSeconds) &&
      durationSeconds >= 63072000 &&
      durationSeconds <= 94608000,
    "INVALID_DURATION",
    "Register for two or three years to support one-year Champion names",
  );
  return {
    parent,
    label: parent.split(".")[0],
    owner,
    durationSeconds,
    maxMockTokenUnits: "20000000",
  };
}

export async function createParentRegistration({
  dir,
  input,
  client,
  artifacts,
  transact,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onProgress = () => {},
}) {
  input = registrationInput(input);
  const file = path.join(dir, "registration.json"),
    identity = keccak256(stringToHex(JSON.stringify(input)));
  let state = await readJson(file);
  requireEns(
    !state || state.identity === identity,
    "STATE_CONFLICT",
    "Parent registration journal belongs to different parameters; never overwrite it",
  );
  const read = (name, functionName, args = []) =>
    client.readContract({
      address: artifacts[name].address,
      abi: artifacts[name].abi,
      functionName,
      args,
    });
  const call = (name, functionName, args) => ({
    address: artifacts[name].address,
    abi: artifacts[name].abi,
    functionName,
    args,
    account: input.owner,
  });
  const save = () => atomicJson(file, state);
  async function check() {
    requireEns(
      (await client.getChainId()) === 11155111,
      "WRONG_CHAIN",
      "Parent registration is Sepolia-only",
    );
    requireEns(
      same(
        await read("ETHRegistrar", "ETH_REGISTRY"),
        artifacts.ETHRegistry.address,
      ) &&
        same(
          await read("ETHRegistrar", "rentPriceOracle"),
          artifacts.StandardRentPriceOracle.address,
        ),
      "DEPLOYMENT_DRIFT",
      "Registrar points to unexpected contracts",
    );
    requireEns(
      (await read("StandardRentPriceOracle", "isPaymentToken", [
        artifacts.MockUSDC.address,
      ])) === true && (await read("MockUSDC", "decimals")) === 6,
      "WRONG_ASSET",
      "Only the reviewed free Sepolia MockUSDC is permitted",
    );
    const current = await read("ETHRegistry", "getState", [
        labelId(input.label),
      ]),
      head = await client.getBlock();
    const available = await read("ETHRegistrar", "isAvailable", [input.label]);
    if (!available) {
      requireEns(
        current.status === 2 &&
          current.expiry > head.timestamp &&
          same(current.latestOwner, input.owner),
        "NAME_UNAVAILABLE",
        "Name is already owned by another account or is unavailable",
      );
      return {
        status: "registered",
        name: input.parent,
        owner: current.latestOwner,
        expiry: String(current.expiry),
        tokenId: String(current.tokenId),
        chainId: 11155111,
      };
    }
    const [base, premium] = await read("ETHRegistrar", "getRegisterPrice", [
      input.label,
      BigInt(input.durationSeconds),
      artifacts.MockUSDC.address,
    ]);
    const cost = base + premium;
    requireEns(
      cost > 0n && cost <= BigInt(input.maxMockTokenUnits),
      "PRICE_CAP",
      "Registration exceeds the20-free-MockUSDC cap",
    );
    return {
      status: "available",
      name: input.parent,
      owner: input.owner,
      durationSeconds: input.durationSeconds,
      priceMockUSDCUnits: String(cost),
      maxMockTokenUnits: input.maxMockTokenUnits,
      commitmentWaitSeconds: String(
        await read("ETHRegistrar", "MIN_COMMITMENT_AGE"),
      ),
      chainId: 11155111,
    };
  }
  async function apply() {
    requireEns(
      typeof transact === "function",
      "OWNER_EXECUTION_REQUIRED",
      "Owner transaction port required",
    );
    const initial = await check();
    if (initial.status === "registered") return initial;
    if (!state) {
      state = {
        version: 1,
        identity,
        input,
        commitmentSecret: "0x" + randomBytes(32).toString("hex"),
        receipts: {},
      };
      await save();
    }
    // Administrative name records share one admitted namespace identity. This
    // preserves the existing transaction port's per-group and hourly limits.
    const send = async (stage, request) => {
      const receipt = await transact(
        parentTransactionId(input, stage),
        request,
      );
      state.receipts[stage] = receipt.tx;
      await save();
      onProgress({ confirmed: stage, tx: receipt.tx });
    };
    const cap = BigInt(input.maxMockTokenUnits),
      balance = await read("MockUSDC", "balanceOf", [input.owner]);
    if (balance < cap)
      await send("faucet", call("MockUSDC", "mint", [input.owner, cap]));
    const allowance = await read("MockUSDC", "allowance", [
      input.owner,
      artifacts.ETHRegistrar.address,
    ]);
    if (allowance !== cap)
      await send(
        "approve",
        call("MockUSDC", "approve", [artifacts.ETHRegistrar.address, cap]),
      );
    const args = [
      input.label,
      input.owner,
      state.commitmentSecret,
      zeroAddress,
      zeroAddress,
      BigInt(input.durationSeconds),
      zeroHash,
    ];
    const commitment = await read("ETHRegistrar", "makeCommitment", args);
    let at = await read("ETHRegistrar", "commitmentAt", [commitment]);
    if (at === 0n) {
      await send("commit", call("ETHRegistrar", "commit", [commitment]));
      at = await read("ETHRegistrar", "commitmentAt", [commitment]);
    }
    const min = await read("ETHRegistrar", "MIN_COMMITMENT_AGE"),
      max = await read("ETHRegistrar", "MAX_COMMITMENT_AGE");
    requireEns(at > 0n, "COMMITMENT_MISSING", "Commitment did not read back");
    for (let attempts = 0; ; attempts++) {
      const time = (await client.getBlock()).timestamp;
      requireEns(
        time < at + max,
        "COMMITMENT_EXPIRED",
        "Commitment expired. Keep the journal for owner reconciliation; no automatic recommit",
      );
      if (time >= at + min) break;
      requireEns(
        attempts < 40,
        "COMMITMENT_WAIT_TIMEOUT",
        "Commitment wait timed out; resume the same journal later",
      );
      onProgress({ waitingForCommitmentSeconds: String(at + min - time) });
      await wait(15000);
    }
    const fresh = await check();
    if (fresh.status === "registered") return fresh;
    await send(
      "register",
      call("ETHRegistrar", "register", [
        ...args.slice(0, 6),
        artifacts.MockUSDC.address,
        zeroHash,
      ]),
    );
    const result = await check();
    requireEns(
      result.status === "registered",
      "REGISTRATION_UNCONFIRMED",
      "Owner registration did not read back",
    );
    return { ...result, transactions: { ...state.receipts } };
  }
  return { check, apply };
}
