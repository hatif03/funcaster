"use strict";
const { getAddress } = require("viem");

const ARC = Object.freeze({
  chainId: 5042002,
  explorer: "https://explorer.testnet.arc.io/tx/",
});
const SEPOLIA = Object.freeze({
  chainId: 11155111,
  explorer: "https://sepolia.etherscan.io/tx/",
});
const operations = new Map([
  ...[
    "ens.party.open",
    "ens.seat.mint",
    "ens.seat.release",
    "ens.record.set",
    "ens.role.grant",
    "ens.role.revoke",
    "ens.party.end",
    "ens.champion.claim",
  ].map((name) => [name, SEPOLIA]),
  ...[
    "arc.pot.create",
    "arc.pot.fund",
    "arc.pot.settle",
    "arc.pot.propose",
    "arc.pot.finalize",
    "arc.pot.contest",
    "arc.pot.claim",
    "arc.pot.refund",
    "arc.drip",
    "market.create",
    "market.started",
    "market.bet",
    "market.report",
    "market.finalize",
    "market.cancel",
    "market.void",
    "market.claim",
    "cheer.create",
    "cheer.started",
    "cheer.contribute",
    "cheer.report",
    "cheer.cancel",
    "cheer.void",
    "cheer.claim",
    "verify.market",
    "verify.cheer",
    "commerce.register",
    "commerce.pay",
    "commerce.claim",
  ].map((name) => [name, ARC]),
]);

// Console output is a best-effort demo aid, never part of identity or payment
// success. Construct every field explicitly; worker metadata can contain secrets.
function createDemoLog({
  mode = "on",
  now = Date.now,
  write = console.log,
} = {}) {
  const startedAt = now();
  function emit(event) {
    try {
      const result = write(`FUNC_DEMO ${JSON.stringify(event)}`);
      if (result?.then) Promise.resolve(result).catch(() => {});
    } catch {}
  }
  return {
    walletConnected(player) {
      try {
        if (
          !["on", "mock"].includes(mode) ||
          !Number.isInteger(player?.slot) ||
          player.slot < 0 ||
          player.slot > 3 ||
          typeof player.address !== "string" ||
          !/^0x[\da-f]{40}$/i.test(player.address)
        )
          return;
        emit({
          event: "wallet-connected",
          mode: mode === "mock" ? "mock" : "live",
          address: getAddress(player.address),
          slot: player.slot,
        });
      } catch {}
    },
    receipt(receipt) {
      try {
        const chain = operations.get(receipt?.type);
        if (
          !["on", "mock"].includes(mode) ||
          !chain ||
          !["done", "failed"].includes(receipt.status) ||
          !Number.isSafeInteger(receipt.at) ||
          receipt.at < 0
        )
          return;
        const mock =
          mode === "mock" ||
          receipt.mock === true ||
          receipt.data?.mode === "mock";
        const common = {
          operation: receipt.type,
          status: receipt.status,
          delivery: receipt.at < startedAt ? "replay" : "new",
        };
        if (mock) {
          emit({
            event: "mock-receipt",
            mode: "mock",
            ...common,
            verification: "simulated",
          });
          return;
        }
        if (
          typeof receipt.tx !== "string" ||
          !/^0x[\da-f]{64}$/i.test(receipt.tx) ||
          /^0x0{64}$/i.test(receipt.tx)
        )
          return;
        const tx = receipt.tx.toLowerCase();
        emit({
          event: "transaction",
          mode: "live",
          ...common,
          verification: "worker-observed",
          chainId: chain.chainId,
          tx,
          url: chain.explorer + tx,
        });
      } catch {}
    },
  };
}
module.exports = { createDemoLog };
