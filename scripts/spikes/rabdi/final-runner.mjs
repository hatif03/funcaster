// Owner-only public writes. No arguments / --check never loads a key or signs.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { ExpirationTime } from "@arkiv-network/sdk";
import { eq } from "@arkiv-network/sdk/query";
import { defineSchema, str, bytes } from "@arkiv-network/sdk/schema";
import { decodeErrorResult, parseAbi, formatEther, zeroAddress } from "viem";
import {
  NETWORK,
  Probe,
  publicClient,
  publicRpc,
  estimateBatch,
  captureBatch,
  selectGas,
  createFixture,
  same,
  serial,
} from "./protocol.mjs";
import {
  COST_CASES,
  costFixture,
  scoreFixture,
  finalMode,
  Score,
} from "./final-protocol.mjs";
import { walkScores, classifyScore } from "./hall-reader.mjs";
import { rpcDiagnostic } from "./read-retry.mjs";
const root = new URL("../../../", import.meta.url),
  at = (p) => new URL(p, root);
const selected = finalMode(process.argv.slice(2));
let operator,
  current = "preflight";
const errorABI = parseAbi(["error TransferToZeroAddress(bytes32 entityKey)"]);
async function expectAtomicRevert(rpc, batch) {
  const tx = await captureBatch(rpc, batch);
  let matched = false;
  try {
    await rpc.request({ method: "eth_call", params: [tx, "latest"] });
  } catch (e) {
    for (let c = e, i = 0; c && i < 24; c = c.cause, i++)
      for (const data of [c.data, c.data?.data]) {
        if (typeof data === "string")
          try {
            matched ||=
              decodeErrorResult({ abi: errorABI, data }).errorName ===
              "TransferToZeroAddress";
          } catch {}
      }
  }
  assert(matched, "Expected TransferToZeroAddress, not an outage");
}
function validationEvidence() {
  const checks = [];
  for (const [id, fn] of [
    [
      "33-byte attribute",
      () => defineSchema("bad", { ["a".repeat(33)]: str() }),
    ],
    ["129-byte string", () => str("a".repeat(129))],
    [
      "32 user columns plus schema tag",
      () =>
        defineSchema(
          "bad",
          Object.fromEntries(
            Array.from({ length: 32 }, (_, i) => ["c" + i, str()]),
          ),
        ),
    ],
    ["131073 aggregate bytes", () => bytes(new Uint8Array(131073))],
  ]) {
    let message;
    try {
      fn();
    } catch (e) {
      message = e.message;
    }
    assert(message);
    checks.push({ id, message, layer: "SDK 1.0.1 validation before RPC" });
  }
  return checks;
}
async function preflight() {
  const reader = publicClient(),
    rpc = publicRpc();
  assert.equal(await reader.getChainId(), NETWORK.id);
  const block = await reader.getBlock(),
    gasPrice = await reader.getGasPrice(),
    cases = [];
  for (const c of COST_CASES) {
    current = "unsigned cost " + c.ordinal;
    try {
      const { estimate, tx } = await estimateBatch(rpc, {
        creates: [costFixture("g0_preflight", c)],
      });
      const gas = selectGas({
        estimate,
        operations: 1,
        blockGasLimit: block.gasLimit,
      });
      cases.push({
        ...c,
        status: "PASS-UNSIGNED",
        estimate: String(estimate),
        gas: String(gas),
        maxGasTGLM: formatEther(gas * gasPrice),
        calldataBytes: (tx.data.length - 2) / 2,
      });
    } catch (e) {
      if (!rpcDiagnostic(e).some((item) => item.status === 413)) throw e;
      cases.push({
        ...c,
        status: "FAIL-FIXED",
        httpStatus: 413,
        error: "HTTP 413: RPC request too large",
        fallbackSize: 32000,
        fallback:
          "Application payload cap 120000 bytes with a 256000-byte serialized-request ceiling; larger data goes to Swarm or batches are split. Measure a 32000-byte replacement cost case.",
      });
    }
  }
  const volume = await estimateBatch(rpc, {
    creates: Array.from({ length: 20 }, (_, i) =>
      scoreFixture("g0_preflight", i),
    ),
  });
  const volumeGas = selectGas({
    estimate: volume.estimate,
    operations: 20,
    blockGasLimit: block.gasLimit,
  });
  const report = {
    at: new Date().toISOString(),
    scope: "PUBLIC READS AND UNSIGNED ESTIMATES ONLY",
    chainId: NETWORK.id,
    budgetTGLM: "2",
    secondaryTopupTGLM: "0.02",
    balanceTGLM: formatEther(
      await reader.getBalance({ address: NETWORK.owner }),
    ),
    cases,
    volume: {
      rows: 2000,
      batch: 20,
      batches: 100,
      estimate: String(volume.estimate),
      maxGasTGLM: formatEther(volumeGas * gasPrice * 100n),
    },
    boundaries: validationEvidence(),
  };
  await fs.writeFile(
    at("docs/web3/spikes/rabdi-final-plan.json"),
    serial(report),
  );
  console.log(serial(report));
}
async function apply() {
  const { openOperator } = await import("./final-operator.mjs");
  operator = await openOperator();
  const { reader, rpc, journal, send, section, save } = operator;
  if (journal.complete) {
    console.log(
      "Final Rabdi probe already complete; receipts reconciled, no new sends.",
    );
    return;
  }
  const run = journal.run;
  current = "cost table";
  const preflightReport = JSON.parse(
    await fs.readFile(at("docs/web3/spikes/rabdi-final-plan.json"), "utf8"),
  );
  assert.equal(preflightReport.chainId, NETWORK.id);
  for (const requested of COST_CASES)
    await section("cost " + requested.ordinal, async () => {
      const check = preflightReport.cases.find(
        (c) => c.ordinal === requested.ordinal,
      );
      assert(check && check.size === requested.size);
      const c =
        check.httpStatus === 413 ? { ...requested, size: 32000 } : requested;
      const fixture = costFixture(run, c),
        entry = await send("cost " + c.ordinal, { creates: [fixture] });
      const row = await reader.getEntity(entry.created[0], fixture.schema);
      assert.equal(row.run.value, run);
      assert.equal((row.payload.value.length - 2) / 2, c.size);
      assert.equal(row.payload.value, "0x" + "53".repeat(c.size));
      assert.equal(
        Object.keys(row).filter((k) => !k.startsWith("$")).length,
        c.columns,
      );
      const delta = BigInt(entry.balanceBefore) - BigInt(entry.balanceAfter);
      assert.equal(
        delta,
        BigInt(entry.gasCost),
        "Unexpected concurrent balance change",
      );
      return {
        ...c,
        requestedSize: requested.size,
        httpStatus: check.httpStatus,
        hash: entry.hash,
        key: row.$key,
        expiresAt: String(row.$expiresAt),
        gasTGLM: formatEther(BigInt(entry.gasCost)),
        balanceDeltaTGLM: formatEther(delta),
        createsPerTenTGLM: String(
          10000000000000000000n / BigInt(entry.gasCost),
        ),
      };
    });
  await section("boundaries", async () => validationEvidence());
  current = "readonly transfer and atomicity";
  const base = await send("atomicity baseline", {
    creates: [
      createFixture(run, 900),
      createFixture(run, 901, { readonly: true }),
    ],
  });
  const baseline = base.created[0],
    immutable = base.created[1];
  await section("readonly transfer", async () => {
    await send("readonly transfer", {
      ownershipChanges: [{ entityKey: immutable, newOwner: NETWORK.recipient }],
    });
    const row = await reader.getEntity(immutable, Probe);
    assert(same(row.$owner, NETWORK.recipient));
    assert(same(row.$creator, NETWORK.owner));
    assert(row.$creationFlags.readonly);
    return {
      key: immutable,
      creator: row.$creator,
      owner: row.$owner,
      readonly: true,
    };
  });
  await section("atomic failed last operation", async () => {
    const prefix = {
      creates: [createFixture(run, 902)],
      patches: [
        {
          schema: Probe,
          entityKey: baseline,
          set: { label: "must_not_survive" },
        },
      ],
    };
    const failing = {
      ...prefix,
      ownershipChanges: [{ entityKey: baseline, newOwner: zeroAddress }],
    };
    await expectAtomicRevert(rpc, failing);
    journal.atomicMintNonce ??= String(
      await reader.getEntityNonce(NETWORK.owner),
    );
    await save();
    const { estimate } = await estimateBatch(rpc, prefix);
    const e = await send("atomic failed last operation", failing, {
      revertEstimate: estimate + 500000n,
    });
    const row = await reader.getEntity(baseline, Probe);
    assert.equal(row.label.value, "synthetic_900");
    const query = await reader
      .select({ $key: true })
      .from(Probe)
      .createdBy(NETWORK.owner)
      .where(eq("run", run))
      .where(eq("ordinal", 902))
      .limit(10)
      .fetch();
    assert.equal(query.entities.length, 0);
    assert.equal(
      await reader.getEntityNonce(NETWORK.owner),
      BigInt(journal.atomicMintNonce),
    );
    return {
      hash: e.hash,
      status: e.status,
      createdRows: 0,
      mintNonceUnchanged: true,
      baselineUnchanged: true,
      specificRevert: "TransferToZeroAddress",
    };
  });
  await section("ordered create and extend", async () => {
    const row = await reader.getEntity(baseline, Probe),
      deadline = row.$expiresAt + 300n;
    // Persist the deadline before admission so a resumed run never invents a new one.
    journal.orderedDeadline ??= String(deadline);
    await save();
    const e = await send("ordered create and extend", {
      creates: [createFixture(run, 903)],
      extensions: [
        {
          entityKey: baseline,
          expiration: ExpirationTime.atBlock(BigInt(journal.orderedDeadline)),
        },
      ],
    });
    assert.equal(
      (await reader.getEntity(baseline, Probe)).$expiresAt,
      BigInt(journal.orderedDeadline),
    );
    assert.equal(
      (await reader.getEntity(e.created[0], Probe)).ordinal.value,
      903,
    );
    return {
      hash: e.hash,
      deadline: journal.orderedDeadline,
      created: e.created[0],
    };
  });
  for (let start = 0; start < 2000; start += 20) {
    current = `score fixtures ${start}–${start + 19}`;
    await send("scores " + start, {
      creates: Array.from({ length: 20 }, (_, i) =>
        scoreFixture(run, start + i),
      ),
    });
  }
  current = "forgery";
  if (
    (await reader.getBalance({ address: NETWORK.recipient })) <
    10000000000000000n
  )
    await send("fund second synthetic writer", {}, { native: true });
  const forged = await send(
    "copied namespace forged result",
    { creates: [scoreFixture(run, 2000, { forged: true })] },
    { from: NETWORK.recipient },
  );
  const malformed = await send("allowlisted malformed payload", {
    creates: [scoreFixture(run, 2001, { malformed: true })],
  });
  await section("paging and reader trust", async () => {
    const pages = [],
      started = performance.now();
    const rows = await walkScores(reader, run, {
      onPage: (p) => pages.push(p),
    });
    const milliseconds = performance.now() - started;
    assert.equal(rows.length, 2002);
    const groups = { trusted: [], unverified: [], invalid: [] };
    for (const row of rows)
      groups[classifyScore(row, [NETWORK.owner])].push(row);
    assert.equal(groups.trusted.length, 2000);
    assert.deepEqual(
      groups.unverified.map((r) => r.$key),
      forged.created,
    );
    assert.deepEqual(
      groups.invalid.map((r) => r.$key),
      malformed.created,
    );
    assert.equal(Math.max(...groups.trusted.map((r) => r.score.value)), 1999);
    const bucketStart = performance.now(),
      bucket = await walkScores(reader, run, {
        creator: NETWORK.owner,
        bucket: 0,
        maxPages: 3,
      });
    assert.equal(bucket.length, 100);
    const values = Array.from({ length: 5000 }, (_, i) => ({
        score: (i * 7919) % 5000,
      })),
      sortStart = performance.now();
    values.sort((a, b) => b.score - a.score);
    const sortMilliseconds = performance.now() - sortStart;
    return {
      rows: rows.length,
      trusted: 2000,
      unverified: 1,
      invalid: 1,
      milliseconds,
      pages,
      bucketMilliseconds: performance.now() - bucketStart,
      bucketRows: 100,
      sort5000Milliseconds: sortMilliseconds,
      fallback:
        milliseconds >= 5000
          ? "bucket queries + stale-while-revalidate cache"
          : "none required",
      consistency: "latest-state keyset walk; no snapshot claim",
    };
  });
  current = "short expiry";
  await section("short expiry", async () => {
    const e = await send("60-second fixture", {
      creates: [createFixture(run, 904, { seconds: 60 })],
    });
    let row = await reader.getEntity(e.created[0], Probe);
    journal.shortOriginal ??= String(row.$expiresAt);
    await save();
    for (let i = 1; i <= 2; i++) {
      const deadline = BigInt(journal.shortOriginal) + BigInt(i * 5);
      await send("short extension " + i, {
        extensions: [
          { entityKey: row.$key, expiration: ExpirationTime.atBlock(deadline) },
        ],
      });
      row = await reader.getEntity(row.$key, Probe);
      assert.equal(row.$expiresAt, deadline);
    }
    const samples = [],
      stop = Date.now() + 240000;
    let deadlineTime, firstMissing;
    while (Date.now() < stop) {
      const page = await reader
        .select({ $key: true })
        .from(Probe)
        .createdBy(NETWORK.owner)
        .where(eq("run", run))
        .where(eq("ordinal", 904))
        .limit(10)
        .fetch();
      const block = await reader.getBlock({ blockNumber: page.blockNumber });
      const present = page.entities.some((r) => r.$key === row.$key);
      samples.push({
        at: new Date().toISOString(),
        block: String(block.number),
        timestamp: String(block.timestamp),
        present,
      });
      if (samples.length % 5 === 0)
        console.log(
          `expiry observation: block ${block.number}, present=${present}`,
        );
      if (block.number >= row.$expiresAt && !deadlineTime)
        deadlineTime = await reader.getBlock({ blockNumber: row.$expiresAt });
      if (!present) {
        firstMissing = block;
        break;
      }
      await delay(2000);
    }
    assert(firstMissing && deadlineTime, "Expiry observation incomplete");
    const minted = await reader.getBlock({
      blockNumber: BigInt(e.blockNumber),
    });
    return {
      key: row.$key,
      original: journal.shortOriginal,
      extended: String(row.$expiresAt),
      samples,
      leaseWallSeconds: Number(deadlineTime.timestamp - minted.timestamp),
      lagSeconds: Number(firstMissing.timestamp - deadlineTime.timestamp),
      renewal:
        "renew at one third; readers filter the published expiry as well",
    };
  });
  journal.complete = true;
  await save();
  console.log(
    "Final Rabdi writes and checks complete. Independent public verification is next.",
  );
}
try {
  if (selected === "check") await preflight();
  else await apply();
} catch (e) {
  console.error(
    `G0 stopped at ${current}: ${e.name}. No automatic resend. Reconcile the saved journal before continuing.`,
  );
  console.error(JSON.stringify(rpcDiagnostic(e)));
  process.exitCode = 1;
} finally {
  if (operator) await operator.close();
}
