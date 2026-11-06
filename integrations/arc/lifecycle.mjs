import path from "node:path";
import { mkdir } from "node:fs/promises";
import { decodeEventLog } from "viem";
import {
  atomicJson,
  readJson,
  digest,
  appendReceipt,
} from "../shared/outbox.mjs";
import { acquireWorkerLock } from "../shared/worker.mjs";
import records from "../../server/records.cjs";
import {
  normalizeTerms,
  termsHash,
  fundingNonce,
  fundingData,
  acceptData,
  settleData,
  contestData,
  placesHash,
} from "./signatures.mjs";
import { placesFromResult } from "./payouts.mjs";
import { ASSET_ABI } from "./assets.mjs";
import {
  validateArcJob,
  arcReceiptData,
  requireArc,
  same,
  json,
} from "./jobs.mjs";

const terminal = (p) => ["Settled", "Refunded"].includes(p.state);
const refundable = (s) =>
  s.state === "Contested" ||
  (s.state === "Funding" && BigInt(s.chainTime) >= s.terms.fundDeadline) ||
  (s.state === "Locked" && BigInt(s.chainTime) >= s.terms.settleDeadline);

export async function createArcLifecycle({
  dir,
  chain,
  relayer,
  oracle,
  transactions,
  dripBudget,
  dripLimits,
  killed = async () => false,
  now = Date.now,
  onRecovery,
}) {
  const folder = path.join(dir, "arc-lifecycle"),
    file = path.join(folder, "journal.json");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const unlock = await acquireWorkerLock(folder);
  const identity = digest(
    records.canonical({ deployment: chain.deploymentConfig, relayer, oracle }),
  );
  let journal;
  try {
    journal = (await readJson(file)) || {
      version: 1,
      identity,
      jobs: {},
      pots: {},
    };
    requireArc(
      journal.version === 1 &&
        journal.identity === identity &&
        journal.jobs &&
        journal.pots,
      "CONFLICT",
      "Arc journal belongs to a different deployment or signer",
    );
    await atomicJson(file, journal);
  } catch (e) {
    await unlock();
    throw e;
  }
  let tail = Promise.resolve(),
    closed = false;
  const save = () => atomicJson(file, journal);
  const root = (pot) => `room:${digest(pot.room)}:pot:${pot.potId}`;
  const domain = {
    chainId: 5042002,
    contract: chain.deploymentConfig.contract,
  };
  async function observe(pot) {
    const s = await chain.snapshot(pot.potId);
    requireArc(
      same(s.termsHash, pot.termsHash),
      "CONFLICT",
      "Existing pot has different terms; fresh acceptance is required",
    );
    return s;
  }
  async function send(pot, action, id, fn, args, role = "relayer") {
    requireArc(!(await killed()), "KILLED", "Arc sending is stopped");
    // Recheck code, domain and allowlist immediately before every admission.
    await chain.deployment();
    const tx = await transactions[role].transact(
      id,
      chain.call(fn, args, role === "oracle" ? oracle : relayer),
    );
    const receipt = await chain.receipt(tx.tx);
    requireArc(
      receipt.status === "success" &&
        receipt.events.some(
          (e) => e.eventName === action && same(e.args.potId, pot.potId),
        ),
      "INVALID_PROOF",
      "Mined transaction lacks its expected pot event",
    );
    return tx.tx;
  }
  async function priorConfirmed(role, id, eventName, potId) {
    const prior = (await transactions[role].receipts({ prefix: id })).find(
      (e) => e.id === id && e.status === "success",
    );
    if (!prior) return null;
    const receipt = await chain.receipt(prior.hash);
    requireArc(
      receipt.status === "success" &&
        receipt.events.some(
          (e) => e.eventName === eventName && same(e.args.potId, potId),
        ),
      "INVALID_PROOF",
      "Prior transaction lacks its expected pot event",
    );
    return prior.hash;
  }
  const output = (type, input, proof, outcome, tx = null) => ({
    tx,
    explorer: tx
      ? `${chain.deploymentConfig.explorer.replace(/\/$/, "")}/tx/${tx}`
      : null,
    data: arcReceiptData(type, input, { ...json(proof), outcome }),
  });
  async function announce(type, payload, value, key) {
    const stamp = digest(
      records.canonical({
        type,
        payload,
        tx: value.tx,
        state: value.data.state,
        claimables: value.data.claimables,
      }),
    );
    if (journal.jobs[`recovery:${key}`] === stamp) return;
    const receipt = {
      id: `arc-recovery-${stamp}`,
      type,
      status: "done",
      at: now(),
      ...value,
    };
    if (onRecovery) await onRecovery(receipt);
    else await appendReceipt(dir, receipt);
    journal.jobs[`recovery:${key}`] = stamp;
    await save();
  }
  async function claim(pot, seat, id) {
    let s = await observe(pot);
    const i = s.terms.seats.findIndex((a) => same(a, seat));
    requireArc(i >= 0, "INVALID_JOB", "Claim recipient is not a pot seat");
    let tx = null,
      outcome = "reconciled";
    if (!terminal(s)) outcome = "waiting";
    else if (s.claimables[i] > 0n) {
      const proof = await chain.tokenSnapshot(s.terms.asset, [seat]);
      requireArc(
        !proof.accounts[0].blocked,
        "RECIPIENT_BLOCKED",
        "Recipient cannot currently receive this asset",
      );
      tx = await send(pot, "Claimed", id, "claim", [pot.potId, seat]);
      s = await observe(pot);
      requireArc(
        s.claimables[i] === 0n,
        "INVALID_PROOF",
        "Claim was not confirmed by chain readback",
      );
      outcome = "applied";
    }
    if (!tx) tx = await priorConfirmed("relayer", id, "Claimed", pot.potId);
    return output(
      "arc.pot.claim",
      { potId: pot.potId, termsHash: pot.termsHash, seat },
      s,
      outcome,
      tx,
    );
  }
  async function collect(pot) {
    const s = await observe(pot);
    if (!terminal(s)) return;
    if (pot.claimsComplete && s.claimables.every((amount) => amount === 0n))
      return;
    for (const seat of s.terms.seats) {
      if (await killed()) break;
      const key = `${root(pot)}:claim:${seat.toLowerCase()}`;
      try {
        const value = await claim(pot, seat, key);
        await announce(
          "arc.pot.claim",
          { potId: pot.potId, termsHash: pot.termsHash, seat },
          value,
          key,
        );
        delete pot.claimErrors?.[seat.toLowerCase()];
      } catch (e) {
        pot.claimErrors ||= {};
        pot.claimErrors[seat.toLowerCase()] = {
          code: e.code || "UNAVAILABLE",
          at: now(),
        };
        // Each seat is an independent pull. A failed recipient cannot block the
        // next one; the shared transaction port still stops uncertain sends.
      }
    }
    const after = await observe(pot);
    pot.claimsComplete =
      after.claimables.every((amount) => amount === 0n) &&
      Object.keys(pot.claimErrors || {}).length === 0;
    await save();
  }
  function resultFor(pot, p, s, kind) {
    const { hash, ...unsigned } = p.result || {};
    requireArc(
      typeof hash === "string" &&
        /^[\da-f]{64}$/.test(hash) &&
        records.hash(unsigned) === hash,
      "INVALID_JOB",
      "Canonical result hash mismatch",
    );
    const c = pot.context;
    requireArc(
      p.result.gameId === c.gameId &&
        p.result.version === c.version &&
        p.result.bundleHash === c.bundleHash &&
        Number.isSafeInteger(p.result.startedAt) &&
        Number.isSafeInteger(p.result.endedAt) &&
        p.result.startedAt >= s.lockedAt * 1000 &&
        p.result.endedAt >= p.result.startedAt &&
        p.result.endedAt <= s.chainTime * 1000,
      "INVALID_JOB",
      "Result differs from the frozen pot game or timing",
    );
    requireArc(
      JSON.stringify(placesFromResult(p.result, c.slots)) ===
        JSON.stringify(p.places),
      "INVALID_JOB",
      "Result placing differs from pot seats",
    );
    const delay = kind === "propose" ? 60000 : 5000;
    requireArc(
      s.chainTime * 1000 >= p.result.endedAt + delay,
      "TOO_EARLY",
      "The agreement or oracle waiting period has not elapsed",
    );
    requireArc(
      !pot.resultHash || pot.resultHash === hash,
      "CONFLICT",
      "This pot is already bound to another match result",
    );
    pot.resultHash = hash;
    pot.places = p.places;
    return `0x${hash}`;
  }
  async function execute(job) {
    const p = validateArcJob(job),
      key = digest(job.idempotencyKey);
    const fingerprint = digest(
      records.canonical({ type: job.type, room: job.room, payload: p }),
    );
    const entry = journal.jobs[key];
    requireArc(
      !entry || entry.fingerprint === fingerprint,
      "CONFLICT",
      "Arc idempotency payload changed",
    );
    const admission = (journal.jobs[key] ||= { fingerprint });
    await save(); // intent and amount are persisted before a signature is made
    if (job.type === "arc.drip") return drip(job, admission, key);
    let pot = journal.pots[p.potId.toLowerCase()];
    if (job.type === "arc.pot.create") {
      const terms = normalizeTerms(p.terms),
        expected = termsHash(p.potId, terms);
      requireArc(
        !pot ||
          (same(pot.termsHash, expected) &&
            pot.room === job.room &&
            records.canonical(pot.context) === records.canonical(p.context)),
        "CONFLICT",
        "Pot intent changed",
      );
      requireArc(
        same(terms.oracle, oracle) || same(terms.oracle, `0x${"0".repeat(40)}`),
        "INVALID_JOB",
        "Pot oracle is not the configured proposal-only key",
      );
      chain.assetFor(terms.asset);
      pot ||= journal.pots[p.potId.toLowerCase()] = {
        potId: p.potId,
        room: job.room,
        termsHash: expected,
        terms: json(terms),
        context: p.context,
        fromBlock: String(chain.deploymentConfig.blockNumber),
      };
      await save();
      let s = await chain.snapshot(p.potId, { allowMissing: true }),
        tx = null;
      if (s.state === "None") {
        requireArc(
          BigInt(s.chainTime) < terms.fundDeadline,
          "INVALID_JOB",
          "Creation funding window expired",
        );
        tx = await send(pot, "Created", `${root(pot)}:create`, "create", [
          p.potId,
          terms,
        ]);
        s = await observe(pot);
      } else
        requireArc(
          same(s.termsHash, expected),
          "CONFLICT",
          "Pot ID occupied with different terms; fresh acceptance required",
        );
      if (!tx)
        tx = await priorConfirmed(
          "relayer",
          `${root(pot)}:create`,
          "Created",
          pot.potId,
        );
      const value = output(job.type, p, s, tx ? "applied" : "reconciled", tx);
      admission.output = value;
      await save();
      return value;
    }
    requireArc(
      pot && pot.room === job.room && same(pot.termsHash, p.termsHash),
      "CONFLICT",
      "Pot is not registered for these room terms",
    );
    let s = await observe(pot),
      tx = null,
      outcome = "reconciled";
    const id = `${root(pot)}:job:${key}`;
    if (job.type === "arc.pot.claim") {
      const value = await claim(pot, p.seat, id);
      admission.output = value;
      await save();
      return value;
    }
    if (job.type === "arc.pot.fund") {
      const i = s.terms.seats.findIndex((a) => same(a, p.seat));
      requireArc(
        i >= 0 && same(p.nonce, fundingNonce(p.potId, p.seat)),
        "INVALID_JOB",
        "Funding seat or nonce mismatch",
      );
      requireArc(
        await chain.verify(
          acceptData(domain, { potId: p.potId, termsHash: pot.termsHash }),
          p.seat,
          p.acceptSig,
          s.blockNumber,
        ),
        "WRONG_SIGNATURE",
        "Accept signature differs from the immutable terms",
      );
      if (!(s.fundedBitmap & (1 << i))) {
        requireArc(
          s.state === "Funding",
          "CONFLICT",
          "Pot is no longer funding",
        );
        const proof = await chain.tokenSnapshot(s.terms.asset, [p.seat]);
        requireArc(
          !proof.accounts[0].blocked,
          "RECIPIENT_BLOCKED",
          "Seat is blocked by the token",
        );
        const authorization = fundingData(
          { ...proof.asset, chainId: 5042002 },
          {
            potId: p.potId,
            seat: p.seat,
            contract: domain.contract,
            stake: s.terms.stake,
            validAfter: BigInt(p.validAfter),
            validBefore: BigInt(p.validBefore),
            fundDeadline: s.terms.fundDeadline,
            chainTime: BigInt(proof.chainTime),
            balance: proof.accounts[0].balance,
            floor: 50000n,
          },
        );
        requireArc(
          await chain.verify(
            authorization,
            p.seat,
            p.authSig,
            proof.blockNumber,
          ),
          "WRONG_SIGNATURE",
          "Asset authorization differs from funding terms",
        );
        requireArc(
          !(await proof.read("authorizationState", [p.seat, p.nonce])),
          "CONFLICT",
          "Authorization already consumed without a funded seat",
        );
        tx = await send(pot, "Funded", id, "fundWithAuthorization", [
          p.potId,
          p.seat,
          p.acceptSig,
          BigInt(p.validAfter),
          BigInt(p.validBefore),
          p.nonce,
          p.authSig,
        ]);
        s = await observe(pot);
        requireArc(
          s.fundedBitmap & (1 << i),
          "INVALID_PROOF",
          "Funding was not confirmed by chain readback",
        );
      }
    } else if (["arc.pot.settle", "arc.pot.propose"].includes(job.type)) {
      const kind = job.type.split(".").at(-1),
        resultHash = resultFor(pot, p, s, kind);
      await save();
      if (
        s.state === "Settled" ||
        (kind === "propose" && s.state === "Proposed")
      ) {
        const events = await chain.events(
          p.potId,
          s.state === "Settled" ? "Settled" : "Proposed",
          pot.fromBlock,
          s.blockNumber,
        );
        requireArc(
          events.some(
            (e) =>
              same(e.args.placesHash, placesHash(p.places)) &&
              (s.state === "Settled" || same(e.args.resultHash, resultHash)),
          ),
          "CONFLICT",
          "Existing result differs from this settlement",
        );
      } else {
        requireArc(
          s.state === "Locked" && BigInt(s.chainTime) < s.terms.settleDeadline,
          "CONFLICT",
          "Pot is not open for settlement",
        );
        if (kind === "settle") {
          requireArc(
            p.sigs.length === s.terms.seats.length,
            "INVALID_JOB",
            "Missing cooperative signatures",
          );
          for (let i = 0; i < p.sigs.length; i++)
            requireArc(
              await chain.verify(
                settleData(domain, { potId: p.potId, places: p.places }),
                s.terms.seats[i],
                p.sigs[i],
                s.blockNumber,
              ),
              "WRONG_SIGNATURE",
              "Cooperative signature mismatch",
            );
          tx = await send(pot, "Settled", id, "settleCooperative", [
            p.potId,
            p.places,
            p.sigs,
          ]);
        } else {
          requireArc(
            same(s.terms.oracle, oracle) &&
              s.chainTime >= s.lockedAt + s.terms.minPlaySeconds,
            "TOO_EARLY",
            "Oracle is unavailable or minimum play time has not elapsed",
          );
          tx = await send(
            pot,
            "Proposed",
            id,
            "propose",
            [p.potId, p.places, resultHash],
            "oracle",
          );
        }
        s = await observe(pot);
        requireArc(
          s.state === (kind === "settle" ? "Settled" : "Proposed"),
          "INVALID_PROOF",
          "Settlement transition missing from chain readback",
        );
      }
    } else if (job.type === "arc.pot.contest") {
      requireArc(
        s.terms.seats.some((a) => same(a, p.seat)) &&
          (await chain.verify(
            contestData(domain, p.potId),
            p.seat,
            p.signature,
            s.blockNumber,
          )),
        "WRONG_SIGNATURE",
        "Contest signature mismatch",
      );
      if (!["Contested", "Refunded"].includes(s.state)) {
        requireArc(
          s.state === "Proposed" &&
            s.chainTime < s.proposalAt + s.terms.challengeWindow,
          "CONFLICT",
          "Proposal challenge window is closed",
        );
        tx = await send(pot, "Contested", id, "contestWithSig", [
          p.potId,
          p.seat,
          p.signature,
        ]);
        s = await observe(pot);
        requireArc(
          s.state === "Contested",
          "INVALID_PROOF",
          "Contest missing from chain readback",
        );
      }
    } else if (job.type === "arc.pot.finalize") {
      if (s.state !== "Settled") {
        requireArc(
          s.state === "Proposed" && same(s.placesHash, placesHash(p.places)),
          "CONFLICT",
          "Finalization differs from proposal",
        );
        if (s.chainTime < s.proposalAt + s.terms.challengeWindow)
          outcome = "waiting";
        else {
          tx = await send(pot, "Settled", id, "finalize", [p.potId, p.places]);
          s = await observe(pot);
          requireArc(
            s.state === "Settled",
            "INVALID_PROOF",
            "Finalization missing from chain readback",
          );
        }
      } else {
        const events = await chain.events(
          p.potId,
          "Settled",
          pot.fromBlock,
          s.blockNumber,
        );
        requireArc(
          events.some((e) => same(e.args.placesHash, placesHash(p.places))),
          "CONFLICT",
          "Finalized placing mismatch",
        );
      }
    } else if (job.type === "arc.pot.refund") {
      if (refundable(s)) {
        tx = await send(pot, "Refunded", id, "refund", [p.potId]);
        s = await observe(pot);
        requireArc(
          s.state === "Refunded",
          "INVALID_PROOF",
          "Refund missing from chain readback",
        );
      } else if (!terminal(s)) outcome = "waiting";
    }
    if (terminal(s)) {
      await collect(pot);
      s = await observe(pot);
    }
    if (!tx)
      tx = await priorConfirmed(
        job.type === "arc.pot.propose" ? "oracle" : "relayer",
        id,
        {
          fund: "Funded",
          settle: "Settled",
          propose: "Proposed",
          contest: "Contested",
          finalize: "Settled",
          refund: "Refunded",
        }[job.type.split(".").at(-1)],
        pot.potId,
      );
    const value = output(job.type, p, s, tx ? "applied" : outcome, tx);
    admission.output = value;
    await save();
    return value;
  }

  async function drip(job, admission, key) {
    const p = job.payload,
      proof = await chain.tokenSnapshot(p.asset, [p.address, relayer]);
    requireArc(
      proof.accounts.every((a) => !a.blocked),
      "RECIPIENT_BLOCKED",
      "Drip account is blocked by the asset",
    );
    const limit = dripLimits[p.asset];
    requireArc(limit, "INVALID_JOB", "No bankroll configured for this asset");
    if (admission.amount === undefined) {
      const reservation = await dripBudget.reserve(key, {
        asset: p.asset,
        room: digest(job.room),
        device: p.device,
        ip: p.ip,
        address: p.address,
        balance: proof.accounts[0].balance,
        chainTime: proof.chainTime,
      });
      admission.amount = String(reservation.amount);
      await save();
    }
    const amount = BigInt(admission.amount),
      id = `room:${digest(job.room)}:drip:${key}`;
    let tx = null;
    if (amount > 0n) {
      const prior = (await transactions.relayer.receipts({ prefix: id })).find(
        (e) => e.id === id,
      );
      if (!prior)
        requireArc(
          proof.accounts[1].balance >= amount + limit.floor,
          "INSUFFICIENT_BALANCE",
          "Drip would breach the retained token balance",
        );
      requireArc(!(await killed()), "KILLED", "Arc sending is stopped");
      tx = (
        await transactions.relayer.transact(
          id,
          chain.tokenCall(p.asset, "transfer", [p.address, amount], relayer),
        )
      ).tx;
      const r = await chain.receipt(tx);
      const transfers = r.logs
        .filter((l) => same(l.address, proof.asset.address))
        .flatMap((l) => {
          try {
            return [
              decodeEventLog({
                abi: ASSET_ABI,
                data: l.data,
                topics: l.topics,
                strict: true,
              }),
            ];
          } catch {
            return [];
          }
        });
      requireArc(
        transfers.some(
          (e) =>
            e.eventName === "Transfer" &&
            same(e.args.from, relayer) &&
            same(e.args.to, p.address) &&
            e.args.value === amount,
        ),
        "INVALID_PROOF",
        "Drip receipt lacks its exact token transfer",
      );
    }
    const after = await chain.tokenSnapshot(p.asset, [p.address]);
    const value = output(
      job.type,
      p,
      { ...after, asset: p.asset, address: p.address, amount: String(amount) },
      amount ? "applied" : "skipped",
      tx,
    );
    admission.output = value;
    await save();
    return value;
  }
  async function recover() {
    for (const pot of Object.values(journal.pots)) {
      if (await killed()) break;
      try {
        let s = await observe(pot),
          tx = null,
          type;
        const payload = { potId: pot.potId, termsHash: pot.termsHash };
        if (refundable(s)) {
          type = "arc.pot.refund";
          tx = await send(
            pot,
            "Refunded",
            `${root(pot)}:recover:refund`,
            "refund",
            [pot.potId],
          );
        } else if (
          s.state === "Proposed" &&
          s.chainTime >= s.proposalAt + s.terms.challengeWindow
        ) {
          const events = await chain.events(
            pot.potId,
            "Proposed",
            pot.fromBlock,
            s.blockNumber,
          );
          const proposal = events.find(
            (e) =>
              same(e.args.placesHash, s.placesHash) &&
              same(e.args.resultHash, s.resultHash),
          );
          requireArc(
            proposal && same(placesHash(proposal.args.places), s.placesHash),
            "INVALID_PROOF",
            "Canonical proposal reveal is unavailable",
          );
          type = "arc.pot.finalize";
          payload.places = proposal.args.places;
          tx = await send(
            pot,
            "Settled",
            `${root(pot)}:recover:finalize`,
            "finalize",
            [pot.potId, payload.places],
          );
        }
        if (tx) {
          s = await observe(pot);
          requireArc(
            s.state === (type.endsWith("refund") ? "Refunded" : "Settled"),
            "INVALID_PROOF",
            "Recovery transition missing from chain readback",
          );
          await announce(
            type,
            payload,
            output(type, payload, s, "applied", tx),
            `${pot.potId}:${type}`,
          );
        }
        if (terminal(s)) await collect(pot);
        delete pot.recoveryError;
      } catch (e) {
        pot.recoveryError = { code: e.code || "UNAVAILABLE", at: now() };
      }
    }
    await save();
  }
  function serial(fn) {
    requireArc(!closed, "CLOSED", "Arc lifecycle is closed");
    const result = tail.then(fn);
    tail = result.catch(() => {});
    return result;
  }
  return {
    execute: (job) =>
      serial(async () => {
        try {
          return await execute(job);
        } catch (error) {
          const entry =
            typeof job?.idempotencyKey === "string" &&
            journal.jobs[digest(job.idempotencyKey)];
          if (entry) {
            entry.lastError = {
              code:
                typeof error.code === "string" &&
                /^[A-Z_]{1,40}$/.test(error.code)
                  ? error.code
                  : "UNAVAILABLE",
              name: error.name === "Error" ? "Error" : "ProviderError",
              at: now(),
            };
            await save();
          }
          throw error;
        }
      }),
    recover: () => serial(recover),
    async close() {
      if (closed) return;
      closed = true;
      await tail;
      await unlock();
    },
  };
}
