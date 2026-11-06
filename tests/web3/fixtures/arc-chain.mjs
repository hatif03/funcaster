import { privateKeyToAccount } from "viem/accounts";
import { verifyTypedData, encodeEventTopics, encodeAbiParameters } from "viem";
import {
  termsHash,
  normalizeTerms,
  placesHash,
} from "../../../integrations/arc/signatures.mjs";
import { payoutVector } from "../../../integrations/arc/payouts.mjs";
import { ASSET_ABI } from "../../../integrations/arc/assets.mjs";
import { digest } from "../../../integrations/shared/outbox.mjs";
export const account = (n) =>
  privateKeyToAccount(`0x${n.toString(16).padStart(64, "0")}`);
export const addr = (n) => `0x${n.toString(16).padStart(40, "0")}`;
export function arcFixture() {
  let time = 1000,
    number = 1,
    failAfterSend = false,
    omitEvent = false;
  const pots = new Map(),
    receipts = new Map(),
    txs = new Map(),
    calls = [],
    balances = new Map(),
    blocked = new Set();
  const relayer = account(1).address,
    oracle = account(2).address;
  const assets = [
    { symbol: "USDC", address: addr(3) },
    { symbol: "EURC", address: addr(4) },
  ];
  const contract = addr(5),
    zero = `0x${"00".repeat(32)}`;
  const balanceKey = (asset, address) =>
    `${asset.toLowerCase()}:${address.toLowerCase()}`;
  const balance = (asset, address) =>
    balances.get(balanceKey(asset, address)) ??
    (address === relayer ? 100_000_000n : 550_000n);
  const setBalance = (asset, address, amount) =>
    balances.set(balanceKey(asset, address), amount);
  const blockHash = () => `0x${digest(String(number))}`;
  const base = () => ({
    mode: "on",
    chainId: 5042002,
    contract,
    blockNumber: String(number),
    blockHash: blockHash(),
    chainTime: time,
    observedAt: time * 1000,
    chainVerified: false,
  });
  const chain = {
    deploymentConfig: {
      contract,
      chainId: 5042002,
      runtimeCodeHash: zero,
      blockNumber: 1,
      assets,
      explorer: "https://example.invalid",
    },
    async deployment() {
      return {
        block: {
          number: BigInt(number),
          timestamp: BigInt(time),
          hash: blockHash(),
        },
      };
    },
    async snapshot(potId, options) {
      const p = pots.get(potId);
      if (!p) {
        if (options?.allowMissing) return { ...base(), potId, state: "None" };
        throw Error("Unknown pot");
      }
      return { ...structuredClone(p), ...base(), potId };
    },
    assetFor(a) {
      const asset = assets.find(
        (v) =>
          v.symbol.toLowerCase() === a ||
          v.address.toLowerCase() === a.toLowerCase(),
      );
      if (!asset) throw Error("Unknown asset");
      return asset;
    },
    async tokenSnapshot(a, addresses = []) {
      const asset = this.assetFor(a);
      return {
        ...base(),
        asset: {
          ...asset,
          chainId: 5042002,
          name: asset.symbol,
          version: "2",
          decimals: 6,
        },
        accounts: addresses.map((address) => ({
          address,
          balance: balance(asset.address, address),
          blocked: blocked.has(address.toLowerCase()),
        })),
        read: async () => false,
      };
    },
    async verify(data, address, signature) {
      return verifyTypedData({ ...data, address, signature });
    },
    call(functionName, args, sender) {
      return { functionName, args, account: sender, address: contract };
    },
    tokenCall(asset, functionName, args, sender) {
      return {
        functionName,
        args,
        account: sender,
        address: this.assetFor(asset).address,
      };
    },
    async receipt(hash) {
      if (!receipts.has(hash)) throw Error("Unknown receipt");
      return receipts.get(hash);
    },
    async events(potId, name) {
      return [...receipts.values()].flatMap((r) =>
        r.events.filter((e) => e.eventName === name && e.args.potId === potId),
      );
    },
  };
  function port(role) {
    return {
      async receipts({ prefix } = {}) {
        return [...txs.values()].filter(
          (r) => r.role === role && (!prefix || r.id.startsWith(prefix)),
        );
      },
      async transact(id, call) {
        if (txs.has(id)) return { tx: txs.get(id).hash, reconciled: true };
        calls.push({ id, role, ...call });
        const [potId, arg] = call.args,
          p = pots.get(potId),
          events = [],
          logs = [];
        const emit = (name, args = {}) =>
          events.push({ eventName: name, args: { potId, ...args } });
        if (call.functionName === "create") {
          if (p) throw Error("Pot exists");
          pots.set(potId, {
            terms: normalizeTerms(arg),
            termsHash: termsHash(potId, arg),
            state: "Funding",
            fundedBitmap: 0,
            claimables: arg.seats.map(() => 0n),
            lockedAt: 0,
            proposalAt: 0,
            placesHash: zero,
            resultHash: zero,
          });
          emit("Created");
        } else if (call.functionName === "transfer") {
          const amount = arg,
            to = potId;
          setBalance(call.address, to, balance(call.address, to) + amount);
          setBalance(
            call.address,
            call.account,
            balance(call.address, call.account) - amount,
          );
          logs.push({
            address: call.address,
            topics: encodeEventTopics({
              abi: ASSET_ABI,
              eventName: "Transfer",
              args: { from: call.account, to },
            }),
            data: encodeAbiParameters([{ type: "uint256" }], [amount]),
          });
        } else if (call.functionName === "fundWithAuthorization") {
          const i = p.terms.seats.findIndex(
            (a) => a.toLowerCase() === arg.toLowerCase(),
          );
          if (p.fundedBitmap & (1 << i)) throw Error("Already funded");
          p.fundedBitmap |= 1 << i;
          setBalance(
            p.terms.asset,
            arg,
            balance(p.terms.asset, arg) - p.terms.stake,
          );
          emit("Funded", { seat: arg, amount: p.terms.stake });
          if (p.fundedBitmap === (1 << p.terms.seats.length) - 1) {
            p.state = "Locked";
            p.lockedAt = time;
            emit("Locked");
          }
        } else if (
          ["settleCooperative", "finalize"].includes(call.functionName)
        ) {
          p.state = "Settled";
          p.claimables = payoutVector(p.terms.stake, arg, p.terms.rule);
          emit("Settled", { placesHash: placesHash(arg) });
        } else if (call.functionName === "propose") {
          p.state = "Proposed";
          p.proposalAt = time;
          p.placesHash = placesHash(arg);
          p.resultHash = call.args[2];
          emit("Proposed", {
            places: arg,
            placesHash: p.placesHash,
            resultHash: p.resultHash,
          });
        } else if (call.functionName === "contestWithSig") {
          p.state = "Contested";
          emit("Contested");
        } else if (call.functionName === "refund") {
          p.state = "Refunded";
          p.claimables = p.terms.seats.map((_, i) =>
            p.fundedBitmap & (1 << i) ? p.terms.stake : 0n,
          );
          emit("Refunded");
        } else if (call.functionName === "claim") {
          const i = p.terms.seats.findIndex(
            (a) => a.toLowerCase() === arg.toLowerCase(),
          );
          if (blocked.has(arg.toLowerCase())) throw Error("Blocked");
          setBalance(
            p.terms.asset,
            arg,
            balance(p.terms.asset, arg) + p.claimables[i],
          );
          p.claimables[i] = 0n;
          emit("Claimed");
        } else throw Error("Unsupported call");
        number++;
        const hash = `0x${digest(String(number))}`;
        receipts.set(hash, {
          transactionHash: hash,
          blockHash: blockHash(),
          blockNumber: BigInt(number),
          status: "success",
          events: omitEvent ? [] : events,
          logs,
        });
        txs.set(id, {
          id,
          role,
          hash,
          blockNumber: String(number),
          status: "success",
        });
        if (failAfterSend) {
          failAfterSend = false;
          throw Error("Transport timeout after mining");
        }
        return { tx: hash, reconciled: false };
      },
    };
  }
  return {
    chain,
    relayer,
    oracle,
    assets,
    contract,
    pots,
    calls,
    blocked,
    txs,
    balance,
    setBalance,
    now: () => time * 1000,
    advance: (n) => (time += n),
    setTime: (n) => (time = n),
    time: () => time,
    failOnce: () => (failAfterSend = true),
    omitEvents: () => (omitEvent = true),
    transactions: { relayer: port("relayer"), oracle: port("oracle") },
  };
}
