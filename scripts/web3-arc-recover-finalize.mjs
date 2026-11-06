// OWNER ONLY for --apply. --check is keyless and never creates a worker.
// One reviewed admission, one dispatch marker, unchanged budgets and fixtures.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { privateKeyToAccount } from "viem/accounts";
import {
  arcClient,
  createLiveArcProvider,
} from "../integrations/arc/provider.mjs";
import { createArcChain } from "../integrations/arc/chain.mjs";
import {
  exactFinalization,
  checkExactRecovery,
  recoverExactOnce,
} from "../integrations/arc/owner-recovery.mjs";
import { requireArc, same, json } from "../integrations/arc/jobs.mjs";
import { placesHash } from "../integrations/arc/signatures.mjs";
import { arcFailure } from "../integrations/arc/diagnostics.mjs";
import {
  readJson,
  atomicJson,
  listJobs,
  killed,
} from "../integrations/shared/outbox.mjs";
import {
  acquireWorkerLock,
  createWorker,
} from "../integrations/shared/worker.mjs";
import { acceptanceConfig } from "./web3-arc-acceptance.mjs";
import { verifyArcDeployment } from "./web3-arc-pin.mjs";
import {
  verifyAcceptanceTransaction,
  requireCompletedAcceptance,
} from "./web3-arc-verify-acceptance.mjs";
import { waitForPotOutcome } from "./spikes/arc-worker-scenario.mjs";

export function recoveryArgs(args) {
  requireArc(
    (args.length === 1 && args[0] === "--check") ||
      (args.length === 2 &&
        args[0] === "--apply" &&
        args[1] === "--confirm-arc-a4-finalize-recovery"),
    "INVALID_CONFIG",
    "Use --check, or owner --apply --confirm-arc-a4-finalize-recovery",
  );
  return args[0] === "--check";
}
export function retainedFinalization({
  report,
  relayer,
  oracle,
  lifecycle,
  input,
  pin,
}) {
  const expected = ["usdc", "eurc"]
    .flatMap((a) => [
      `${a} bankroll seat 1`,
      `${a} bankroll seat 2`,
      ...["cooperative", "refund", "contest", "finalize"].map(
        (k) => `${a} ${k}`,
      ),
    ])
    .slice(0, -1);
  const rows = report?.checks;
  requireArc(
    report?.complete === false &&
      rows?.length === 11 &&
      expected.every(
        (id) =>
          rows.filter((r) => r.id === id && r.status === "PASS-PUBLIC-SCRIPT")
            .length === 1,
      ) &&
      same(report.deployment?.contract, pin.contract) &&
      same(report.deployment?.creationTx, pin.creationTx) &&
      same(input.contract, pin.contract) &&
      input.chainId === 5042002 &&
      relayer.chainId === 5042002 &&
      oracle.chainId === 5042002 &&
      oracle.entries.length === 4 &&
      oracle.entries.every((e) => e.status === "success") &&
      relayer.entries.length >= 48 &&
      relayer.entries.length <= 50 &&
      relayer.entries.slice(0, 47).every((e) => e.status === "success") &&
      relayer.entries.every((e, i) => e.nonce === relayer.entries[0].nonce + i),
    "INVALID_PROOF",
    "Recovery only continues the retained eleven-checkpoint fixture",
  );
  const pots = Object.values(lifecycle.pots),
    pot = pots.find((p) => same(p.potId, input.potId)),
    entry = relayer.entries[47];
  requireArc(
    pots.length === 8 &&
      pot &&
      pots.filter((p) => p !== pot).every((p) => p.claimsComplete === true) &&
      rows
        .filter((r) => r.potId)
        .every((r) => pots.some((p) => same(p.potId, r.potId) && p !== pot)) &&
      entry.id.endsWith(`:pot:${pot.potId}:recover:finalize`) &&
      ["hash", "nonce", "gas", "maxFeePerGas", "dataHash"].every(
        (k) => entry[k] === input[k],
      ) &&
      relayer.entries
        .slice(48)
        .every((e) => e.id.includes(`:pot:${pot.potId}:claim:`)),
    "INVALID_PROOF",
    "Retained pot or exact finalization admission changed",
  );
  return { pot, entry };
}

// Claims may be paid before the transaction port finishes canonical readback.
// Do not declare success until the worker's journals and lifecycle agree too.
export async function finishRetainedClaims({
  dir,
  provider,
  potId,
  wait = delay,
  wallNow = Date.now,
  timeoutMs = 900000,
}) {
  requireArc(
    (await listJobs(dir)).length === 0,
    "CONFLICT",
    "Recovery will not execute unrelated queued jobs",
  );
  const refuseJob = () => {
    throw Object.assign(Error("Scoped recovery cannot execute an outbox job"), {
      code: "CONFLICT",
      permanent: true,
    });
  };
  const worker = createWorker({
      dir,
      providers: {
        arc: { ...provider, lookup: refuseJob, execute: refuseJob },
      },
    }),
    deadline = wallNow() + timeoutMs;
  try {
    const proof = await waitForPotOutcome({
      worker,
      chain: provider.chain,
      potId,
      state: "Settled",
      step: "arc.pot.finalize",
      wait,
      wallNow,
      timeoutMs,
    });
    for (;;) {
      const journal = await readJson(
        path.join(dir, "arc-relayer-transactions/journal.json"),
      );
      const lifecycle = await readJson(
        path.join(dir, "arc-lifecycle/journal.json"),
      );
      if (
        journal.entries.length === 50 &&
        journal.entries.every((e) => e.status === "success") &&
        Object.values(lifecycle.pots).every((p) => p.claimsComplete === true)
      )
        return proof;
      requireArc(
        wallNow() < deadline,
        "ACCEPTANCE_RECOVERY_PENDING",
        "Claims need canonical journal readback; keep the same admissions",
      );
      await wait(1000);
      requireArc(
        (await listJobs(dir)).length === 0,
        "CONFLICT",
        "Unrelated jobs appeared during scoped recovery",
      );
      await worker.poll();
    }
  } finally {
    await worker.close();
  }
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const checkOnly = recoveryArgs(args); // before any file/key/network access
  const dir = path.resolve(".local/arc-a4-acceptance"),
    reportFile = "docs/web3/spikes/g1-arc-worker-public.json";
  const release = await acquireWorkerLock(dir);
  let provider;
  try {
    const [report, relayer, oracle, lifecycle, input, pin, source, funding] =
      await Promise.all([
        readJson(reportFile),
        readJson(path.join(dir, "arc-relayer-transactions/journal.json")),
        readJson(path.join(dir, "arc-oracle-transactions/journal.json")),
        readJson(path.join(dir, "arc-lifecycle/journal.json")),
        readJson("docs/web3/spikes/g1-arc-finalize-recovery-input.json"),
        readJson(".local/arc-public-deployment.json"),
        readJson("docs/web3/spikes/arc-readonly-input.json"),
        readJson("docs/web3/spikes/g1-arc-worker-funding.json"),
      ]);
    const { pot, entry } = retainedFinalization({
      report,
      relayer,
      oracle,
      lifecycle,
      input,
      pin,
    });
    requireArc(
      (await listJobs(dir)).length === 0,
      "CONFLICT",
      "Retained outbox must be empty",
    );
    requireArc(
      source.rpcUrls.length === 2 &&
        new Set(source.rpcUrls.map((u) => new URL(u).host)).size === 2 &&
        [relayer, oracle].every((j, i) =>
          funding.hosts.every((h) =>
            h.balances.some(
              (b) =>
                b.role === (i === 0 ? "ARC_RELAYER" : "ARC_ORACLE") &&
                same(b.address, j.owner),
            ),
          ),
        ),
      "INVALID_PROOF",
      "Two distinct hosts and the original funded roles are required",
    );
    const bytes = await fs.readFile(
      "integrations/arc/onchain/contracts/out/ConditionalPot.sol/ConditionalPot.json",
    );
    requireArc(
      createHash("sha256").update(bytes).digest("hex") === pin.artifactSha256,
      "INVALID_PROOF",
      "Reviewed artifact changed",
    );
    const clients = source.rpcUrls.map((u) => arcClient(u)),
      chains = [],
      hostProofs = [];
    for (const [i, client] of clients.entries()) {
      const deployment = await verifyArcDeployment({
        client,
        address: pin.contract,
        txHash: pin.creationTx,
        artifact: JSON.parse(bytes),
        assets: source.assets,
      });
      requireArc(
        same(deployment.runtimeCodeHash, pin.runtimeCodeHash) &&
          deployment.blockNumber === pin.blockNumber,
        "INVALID_PROOF",
        "Deployment pin changed",
      );
      const gas = {};
      for (const [role, journal] of [
        ["relayer", relayer],
        ["oracle", oracle],
      ]) {
        let spent = 0n;
        for (const e of journal.entries) {
          if (e === entry || e.status === "prepared") continue;
          spent += (
            await verifyAcceptanceTransaction({
              client,
              entry: e,
              owner: journal.owner,
            })
          ).cost;
        }
        requireArc(
          spent <=
            (role === "relayer" ? 500000000000000000n : 50000000000000000n),
          "BUDGET_EXCEEDED",
          "Original cumulative caps still apply",
        );
        gas[role] = String(spent);
        console.log(
          `PASS read-only ${role} receipts on ${new URL(source.rpcUrls[i]).host}`,
        );
      }
      const chain = createArcChain({ client, deployment });
      chains.push(chain);
      for (const old of report.checks.filter((r) => r.potId)) {
        const s = await chain.snapshot(old.potId);
        requireArc(
          s.state === old.state && s.claimables.every((v) => v === 0n),
          "INVALID_PROOF",
          "Earlier checkpoint no longer agrees with chain",
        );
      }
      hostProofs.push({ host: new URL(source.rpcUrls[i]).host, gasWei: gas });
    }
    requireArc(
      JSON.stringify(hostProofs[0].gasWei) ===
        JSON.stringify(hostProofs[1].gasWei),
      "INVALID_PROOF",
      "Hosts disagree on original spending",
    );
    const candidate = exactFinalization({
      entry,
      owner: relayer.owner,
      contract: pin.contract,
      potId: pot.potId,
      places: pot.places,
      expectedHash: input.hash,
      spentWei: BigInt(hostProofs[0].gasWei.relayer),
    });
    const options = {
      candidate,
      clients,
      markerFile: path.join(dir, "owner-finalize-recovery.json"),
      killed: () => killed(dir, checkOnly ? "0" : env.WEB3_KILL),
      ready: async (_client, i) => {
        const s = await chains[i].snapshot(pot.potId);
        requireArc(
          s.state === "Proposed" &&
            same(s.termsHash, pot.termsHash) &&
            same(s.placesHash, placesHash(pot.places)) &&
            s.chainTime >= s.proposalAt + s.terms.challengeWindow,
          "INVALID_PROOF",
          "Only the original mature proposal can be finalized",
        );
      },
    };
    if (checkOnly) {
      const proof = await checkExactRecovery(options);
      await fs.writeFile(
        "docs/web3/spikes/g1-arc-finalize-recovery-check.json",
        JSON.stringify(
          {
            at: new Date().toISOString(),
            scope:
              "KEYLESS READS ONLY; no signing, broadcasting, worker polling or private journal edits",
            complete: false,
            hosts: hostProofs,
            proof,
          },
          null,
          2,
        ) + "\n",
      );
      console.log(
        `PASS read-only finalization recovery check (${proof.state}); A4 remains pending`,
      );
      return;
    }
    const account = privateKeyToAccount(env.ARC_RELAYER_KEY);
    requireArc(
      same(account.address, relayer.owner),
      "WRONG_SIGNER",
      "Owner key differs from the original relayer",
    );
    // Archive the partial public evidence once; never overwrite or reset journals.
    const previous = path.join(dir, "public-before-owner-recovery.json");
    if (!(await readJson(previous))) await atomicJson(previous, report);
    const proof = await recoverExactOnce({
      ...options,
      wallet: { account, signTransaction: (tx) => account.signTransaction(tx) },
    });
    Object.assign(entry, {
      status: "success",
      costWei: proof.costWei,
      blockNumber: proof.blockNumber,
    });
    await atomicJson(
      path.join(dir, "arc-relayer-transactions/journal.json"),
      relayer,
    );
    console.log("PASS exact finalization hash confirmed by both hosts");
    // No fixture key, new signature payload, create/fund/propose job or drip.
    const config = acceptanceConfig({
      env,
      dir,
      source,
      deployment: pin,
      relayer: relayer.owner,
      oracle: oracle.owner,
    });
    provider = await createLiveArcProvider(config);
    const final = await finishRetainedClaims({
      dir,
      provider,
      potId: pot.potId,
    });
    await provider.close();
    provider = undefined;
    report.checks.push({
      id: "eurc finalize",
      status: "PASS-PUBLIC-SCRIPT",
      potId: pot.potId,
      state: final.state,
      claimables: final.claimables.map(String),
      blockNumber: final.blockNumber,
      blockHash: final.blockHash,
      scope:
        "SCRIPTED WORKER RECOVERY; retained synthetic fixture, not gameplay acceptance",
    });
    report.transactions = [];
    for (const role of ["relayer", "oracle"]) {
      const j = await readJson(
        path.join(dir, `arc-${role}-transactions/journal.json`),
      );
      requireArc(
        j.entries.length === (role === "relayer" ? 50 : 4) &&
          j.entries.every((e) => e.status === "success"),
        "INVALID_PROOF",
        "Final journals are not complete",
      );
      for (const e of j.entries)
        report.transactions.push({
          role,
          hash: e.hash,
          blockNumber: e.blockNumber,
          status: e.status,
          costWei: e.costWei,
        });
    }
    report.priorFailure = report.failure;
    delete report.failure;
    report.recovery = {
      at: new Date().toISOString(),
      hash: proof.hash,
      blockNumber: proof.blockNumber,
      scope:
        "Owner-authorized single dispatch of identical hash; original caps and fixtures retained",
    };
    report.complete = true;
    requireCompletedAcceptance(report);
    await fs.writeFile(
      reportFile,
      JSON.stringify(json(report), null, 2) + "\n",
    );
    console.log(
      "PASS eurc finalize and both claims; 12/12 checkpoints complete. Request the independent keyless audit before closing A4.",
    );
  } finally {
    try {
      await provider?.close();
    } finally {
      await release();
    }
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href)
  main().catch((error) => {
    const failure = arcFailure(error);
    console.error(
      `A4 owner recovery stopped (${failure.code}). Keep all journals and the recovery marker; no automatic resend.`,
    );
    console.error(JSON.stringify(failure));
    process.exitCode = 1;
  });
