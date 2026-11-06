import assert from "node:assert/strict";
import { keccak256 } from "viem";
import { NETWORK, same, dataHash } from "./protocol.mjs";
// The caller holds the signer lock and has checked nonce, balance, estimate and total budget.
export function guardSend({ account, entry, persist, rpc }) {
  let admitted = false,
    submitted = false;
  const guardedAccount = {
    ...account,
    async signTransaction(request, options) {
      assert(!entry.hash, "A signature has already been admitted");
      assert.equal(request.chainId, NETWORK.id);
      assert.equal(request.nonce, entry.nonce);
      assert.equal(request.gas, BigInt(entry.gas));
      assert.equal(request.gasPrice, BigInt(entry.gasPrice));
      assert(same(request.to, entry.to));
      assert.equal(request.value ?? 0n, BigInt(entry.value ?? 0));
      assert.equal(dataHash(request), entry.dataHash);
      const signed = await account.signTransaction(request, options);
      entry.hash = keccak256(signed);
      entry.status = "admitted";
      await persist(entry);
      admitted = true;
      return signed;
    },
  };
  return {
    account: guardedAccount,
    async request(args) {
      if (args.method === "eth_sendRawTransaction") {
        assert(
          admitted && !submitted && keccak256(args.params[0]) === entry.hash,
          "Unexpected or repeated send refused",
        );
        submitted = true;
      } else
        assert(!/send|sign/i.test(args.method), "Unexpected mutation refused");
      return rpc.request(args);
    },
  };
}
