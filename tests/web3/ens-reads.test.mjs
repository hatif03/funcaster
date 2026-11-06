import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  encodeFunctionData,
  encodeEventTopics,
  encodeAbiParameters,
  namehash,
  toHex,
} from "viem";
import abi from "../../integrations/ens/lifecycle-abi.json" with { type: "json" };
import {
  dnsName as dnsEncode,
  labelId,
} from "../../integrations/ens/names.mjs";
import { createEnsLifecycle } from "../../integrations/ens/lifecycle.mjs";
import { createEnsReads } from "../../integrations/ens/reads.mjs";
import { chainFixture, address } from "./fixtures/ens-chain.mjs";

async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-ens-reads-")),
    f = chainFixture();
  const lifecycle = await createEnsLifecycle({ dir, ...f });
  t.after(async () => {
    await lifecycle.close();
    await rm(dir, { recursive: true, force: true });
  });
  const party = await lifecycle.open({
    partyId: "room",
    code: "ROOMAA",
    game: "chonks.golf",
  });
  const seats = [];
  for (let slot = 0; slot < 2; slot++)
    seats.push(
      await lifecycle.mint({
        partyId: "room",
        seatId: `seat:${slot}`,
        slot,
        nickname: `player${slot}`,
        address: address(23 + slot),
        shape: "circle",
        color: "#ffffff",
      }),
    );
  const walks = [],
    hierarchy = {
      async walk(name, options) {
        walks.push({ name, options });
        const head = await f.client.getBlock();
        if (name === `play.${f.config.ENS_PARENT}`)
          return { leaf: { subregistry: f.playRegistry } };
        const table = {
          name: party.name,
          owner: f.owner,
          subregistry: party.registry,
          resolver: party.resolver,
        };
        const seat = seats.find((s) => s.name === name);
        return {
          blockNumber: head.number,
          blockHash: head.hash,
          expiresAt: BigInt(party.expiresAt),
          nodes: [table],
          leaf: seat
            ? { owner: seat.address, resolver: party.resolver }
            : table,
        };
      },
    };
  const reads = createEnsReads({
    client: f.client,
    protocol: f.protocol,
    parent: f.config.ENS_PARENT,
    owner: f.owner,
    hierarchy,
  });
  return { ...f, lifecycle, party, seats, reads, walks, hierarchy };
}
test("join reads the canonical table's code and HTTPS origin at one block", async (t) => {
  const f = await fixture(t),
    join = await f.reads.join(f.party.name);
  assert.equal(join.code, "ROOMAA");
  assert.equal(join.origin, "https://console.example");
  assert.equal(join.expiresAt, f.party.expiresAt);
  await assert.rejects(
    f.reads.join(`other.example.eth`),
    (e) => e.code === "INVALID_NAME",
  );
  f.records.set(
    `${f.party.resolver}:${dnsEncode(f.party.name)}:chonks.relay`,
    "https://user:secret@evil.example/",
  );
  await assert.rejects(
    f.reads.join(f.party.name),
    (e) => e.code === "INVALID_RECORD",
  );
});
test("join refuses a chain denial and a changed canonical block without a stale fallback", async (t) => {
  const f = await fixture(t);
  const original = f.client.getBlock;
  f.client.getBlock = async (options) => ({
    ...(await original()),
    ...(options?.blockNumber ? { hash: `0x${"cd".repeat(32)}` } : {}),
  });
  await assert.rejects(f.reads.join(f.party.name), (e) => e.code === "REORG");
  f.hierarchy.walk = async () => {
    throw Object.assign(Error("Expired"), { code: "EXPIRED" });
  };
  await assert.rejects(f.reads.join(f.party.name), (e) => e.code === "EXPIRED");
});
test("pot roster resolves every seat at one block and rejects duplicates and address mismatches", async (t) => {
  const f = await fixture(t),
    names = f.seats.map((s) => s.name);
  const roster = await f.reads.roster(names);
  assert.deepEqual(
    roster.seats.map((s) => s.address),
    f.seats.map((s) => s.address),
  );
  assert.ok(
    f.walks.every((w) => String(w.options.blockNumber) === roster.blockNumber),
  );
  await assert.rejects(
    f.reads.roster([names[0], names[0]]),
    (e) => e.code === "INVALID_ROSTER",
  );
  f.records.set(`${f.party.resolver}:${dnsEncode(names[1])}:addr`, address(99));
  await assert.rejects(
    f.reads.roster(names),
    (e) => e.code === "INVALID_ROSTER",
  );
});
async function historyFixture(t) {
  const f = await fixture(t),
    head = await f.client.getBlock(),
    hash = `0x${"12".repeat(32)}`;
  const registration = f.calls.find(
    (c) => c.functionName === "register" && c.address === f.playRegistry,
  );
  const event = abi.registry.find(
    (e) => e.type === "event" && e.name === "LabelRegistered",
  );
  const args = {
    tokenId: 1n,
    labelHash: toHex(labelId(f.party.name.split(".")[0]), { size: 32 }),
    sender: f.owner,
    label: registration.args[0],
    owner: f.owner,
    expiry: registration.args[5],
  };
  const log = {
    address: f.playRegistry,
    topics: encodeEventTopics({ abi: [event], eventName: event.name, args }),
    data: encodeAbiParameters(
      event.inputs.filter((i) => !i.indexed),
      event.inputs.filter((i) => !i.indexed).map((i) => args[i.name]),
    ),
  };
  const tx = {
    hash,
    chainId: f.protocol.chainId,
    from: f.owner,
    to: f.playRegistry,
    value: 0n,
    blockNumber: head.number - 120n,
    blockHash: head.hash,
    input: encodeFunctionData(registration),
  };
  const receipt = {
    transactionHash: hash,
    status: "success",
    blockNumber: tx.blockNumber,
    blockHash: head.hash,
    logs: [log],
  };
  f.client.getTransaction = async () => tx;
  f.client.getTransactionReceipt = async () => receipt;
  const original = f.client.readContract;
  f.client.readContract = async (r) =>
    r.functionName === "getRecordId"
      ? BigInt(namehash(f.party.name))
      : original(r);
  const ranges = [];
  f.client.getLogs = async (r) => {
    ranges.push(r);
    return r.toBlock === head.number
      ? [
          {
            args: { key: "chonks.receipt", value: "a".repeat(64) },
            transactionHash: `0x${"34".repeat(32)}`,
            blockNumber: head.number,
            blockHash: head.hash,
            logIndex: 2,
          },
        ]
      : [];
  };
  return {
    ...f,
    tx,
    receipt,
    ranges,
    input: { name: f.party.name, registrationTx: hash },
    head,
  };
}
test("history uses the creation transaction after a table ends, with bounded 10-block log pages", async (t) => {
  const f = await historyFixture(t);
  await f.lifecycle.end("room");
  const page = await f.reads.history(f.input);
  assert.equal(page.rows.length, 1);
  assert.equal(page.rows[0].resultHash, "a".repeat(64));
  assert.equal(page.nextCursor, String(f.head.number - 100n));
  assert.equal(page.independentlyVerified, false);
  assert.equal(f.ranges.length, 10);
  assert.ok(f.ranges.every((r) => r.toBlock - r.fromBlock <= 9n));
  assert.equal(
    (await f.reads.history({ ...f.input, cursor: page.nextCursor })).nextCursor,
    null,
  );
});
test("history rejects unrelated transactions, forged receipts, missing events and oversized log results", async (t) => {
  const f = await historyFixture(t);
  f.tx.from = address(99);
  await assert.rejects(
    f.reads.history(f.input),
    (e) => e.code === "INVALID_HISTORY",
  );
  f.tx.from = f.owner;
  f.receipt.transactionHash = `0x${"ff".repeat(32)}`;
  await assert.rejects(
    f.reads.history(f.input),
    (e) => e.code === "INVALID_HISTORY",
  );
  f.receipt.transactionHash = f.tx.hash;
  const logs = f.receipt.logs;
  f.receipt.logs = [];
  await assert.rejects(
    f.reads.history(f.input),
    (e) => e.code === "INVALID_HISTORY",
  );
  f.receipt.logs = logs;
  f.client.getLogs = async () =>
    Array.from({ length: 201 }, () => ({ args: {} }));
  await assert.rejects(
    f.reads.history(f.input),
    (e) => e.code === "HISTORY_LIMIT",
  );
});
