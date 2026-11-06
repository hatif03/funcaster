import path from "node:path";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { verifyTypedData } from "viem";
import { atomicJson, readJson, digest, listJobs } from "../shared/outbox.mjs";
import { registration, address, splitPayment } from "./math.mjs";
import { paymentData, claimData, commerceId } from "./signatures.mjs";
import {
  hash,
  json,
  validateCommerceJob,
  commerceTransactionId,
} from "./jobs.mjs";
const clone = (v) => structuredClone(v),
  id = (v) => {
    if (!/^[\w-]{6,100}$/.test(v || "")) throw Error("INVALID_ID");
    return v;
  };
export async function createLiveCommerce({
  dataDir,
  directory,
  outbox,
  chain,
  deployment,
  platformAddress,
  venueAddress,
  firstPartyGames = [],
  onReceipt = () => {},
  readJobReceipt,
  now = Date.now,
  pollMs = 2000,
}) {
  const dir = dataDir || path.dirname(directory),
    file = path.join(dir, "commerce", "live-state.json");
  let state = (await readJson(file)) || {
    schema: 2,
    versions: [],
    operations: [],
    demos: {},
    receipts: [],
    access: {},
  };
  if (state.schema !== 2) throw Error("INVALID_COMMERCE_STATE");
  const deploymentId = deployment
    ? hash({
        address: deployment.address.toLowerCase(),
        runtimeHash: deployment.runtimeHash.toLowerCase(),
        chainId: deployment.chainId,
      })
    : null;
  if (state.deploymentId && state.deploymentId !== deploymentId)
    throw Error("COMMERCE_DEPLOYMENT_CHANGED");
  if (deploymentId) state.deploymentId = deploymentId;
  // A restarted relay must obtain fresh paid-access evidence before opening a gate.
  state.access = {};
  let tail = Promise.resolve(),
    closed = false;
  const serial = (fn) => {
    const result = tail.then(async () => {
      if (closed) throw Error("COMMERCE_CLOSED");
      return fn();
    });
    tail = result.catch(() => {});
    return result;
  };
  const save = () => atomicJson(file, state),
    requireLive = () => {
      if (!chain || !outbox || !deployment)
        throw Error("VERIFIED_ROUTER_REQUIRED");
    };
  const version = (id) => {
    const v = state.versions.find((v) => v.id === id);
    if (!v) throw Error("VERSION_NOT_FOUND");
    return v;
  };
  const operation = (id) => {
    const o = state.operations.find((o) => o.id === id);
    if (!o) throw Error("OPERATION_NOT_FOUND");
    return o;
  };
  const recoveryChecks = new Map();
  const view = (o) => ({
    operationId: o.id,
    status: o.status,
    action: o.action,
    createdAt: o.createdAt,
    error: o.error || null,
    ...(recoveryChecks.has(o.id)
      ? { recovery: clone(recoveryChecks.get(o.id)) }
      : {}),
    ...(o.result || {}),
  });
  const enqueue = async (o) => {
    if (o.status !== "queued" || o.jobId) return;
    if (o.recovery) {
      // The recovery decision is durable before enqueue. Reuse the one saved
      // outbox job/done receipt if the relay died before saving its acknowledgement.
      const done = await readJson(
        path.join(dir, "done", digest(o.job.idempotencyKey) + ".json"),
      );
      if (done) {
        recoveryCheck(
          done.fingerprint === jobFingerprint(o.job) &&
            typeof done.receipt?.id === "string",
        );
        o.jobId = done.receipt.id;
        await save();
        return;
      }
      const pending = (await listJobs(dir)).filter(
        ({ job }) => job?.idempotencyKey === o.job.idempotencyKey,
      );
      recoveryCheck(pending.length <= 1);
      if (pending.length) {
        const job = pending[0].job;
        recoveryCheck(
          job.type === o.job.type &&
            job.room === o.job.room &&
            isDeepStrictEqual(job.payload, o.job.payload),
        );
        o.jobId = job.id;
        await save();
        return;
      }
    }
    const job = await outbox.enqueue(o.job);
    o.jobId = job.id;
    await save();
  };
  const make = (action, actor, input, operationId) => {
    id(operationId);
    const fingerprint = hash({ action, actor, input });
    const old = state.operations.find((o) => o.id === operationId);
    if (old) {
      if (old.fingerprint !== fingerprint) throw Error("OPERATION_CONFLICT");
      return { o: old, existing: true };
    }
    if (state.operations.length >= 10000) throw Error("OPERATION_LIMIT");
    const o = {
      id: operationId,
      action,
      actor,
      input: clone(input),
      fingerprint,
      createdAt: now(),
      status: "prepared",
    };
    return { o, existing: false };
  };
  const queue = async (o, payload, room) => {
    if (!state.operations.some((p) => p.id === o.id)) state.operations.push(o);
    o.status = "queued";
    o.job = {
      type: `commerce.${o.action}`,
      room,
      idempotencyKey: `commerce:${o.action}:${o.id}`,
      payload: { operationId: o.id, actor: o.actor, ...json(payload) },
    };
    await save();
    await enqueue(o);
    return view(o);
  };
  const recoveryCheck = (value) => {
    if (!value) throw Error("COMMERCE_RECOVERY_BLOCKED");
  };
  const jobFingerprint = (job) =>
    hash({ type: job.type, payload: job.payload });
  async function recoverRegistration(o) {
    if (o.status !== "failed" || o.action !== "register" || o.recovery) return;
    // An operator creates this immutable, exact-intent manifest explicitly.
    // Its absence is never interpreted as permission to retry a failed job.
    const manifest = await readJson(
      path.join(dir, "commerce-recovery", digest(o.id) + ".json"),
    );
    if (!manifest) return;
    recoveryChecks.set(o.id, { status: "checking" });
    const fields = [
      "version",
      "reason",
      "operationId",
      "originalJobId",
      "originalIdempotencyKey",
      "fingerprint",
      "versionId",
    ];
    recoveryCheck(
      Object.keys(manifest).length === fields.length &&
        fields.every((key) => Object.hasOwn(manifest, key)),
    );
    const original = o.job;
    recoveryCheck(
      manifest.version === 1 &&
        manifest.reason === "jsonb-registration-v1" &&
        manifest.operationId === o.id &&
        manifest.originalJobId === o.jobId &&
        manifest.originalIdempotencyKey === original?.idempotencyKey &&
        manifest.versionId === original?.payload?.version?.id &&
        original.type === "commerce.register" &&
        original.payload.operationId === o.id &&
        original.payload.actor === o.actor &&
        original.room === `creator-${o.actor.slice(2, 22)}` &&
        original.idempotencyKey === `commerce:register:${o.id}` &&
        !o.prepared &&
        !o.result &&
        !original.payload.roomCode &&
        o.error === "WORKER_REVIEW_REQUIRED" &&
        !state.receipts.some((r) => r.id === o.id),
    );
    const p = validateCommerceJob(original),
      v = p.version;
    recoveryCheck(isDeepStrictEqual(version(v.id), v));
    const normalized = registration(
      {
        creator: v.creator,
        price: v.price,
        collaborators: v.recipients,
        referralAddress: v.referral,
        referralBps: v.referralBps,
      },
      { platformAddress: v.platform, venueAddress: v.venue },
    );
    // The old validator must reject only object-key order, while the repaired
    // strict structural validator above accepts exactly the stored terms.
    recoveryCheck(
      Object.keys(normalized).some(
        (key) => JSON.stringify(normalized[key]) !== JSON.stringify(v[key]),
      ),
    );
    const [done, executed, journal] = await Promise.all([
      readJson(
        path.join(dir, "done", digest(original.idempotencyKey) + ".json"),
      ),
      readJson(
        path.join(
          dir,
          "commerce-worker",
          digest(original.idempotencyKey) + ".json",
        ),
      ),
      readJson(path.join(dir, "arc-relayer-transactions", "journal.json")),
    ]);
    recoveryCheck(
      done?.fingerprint === manifest.fingerprint &&
        done.fingerprint === jobFingerprint(original),
    );
    const terminal = done.receipt;
    recoveryCheck(
      terminal?.id === o.jobId &&
        terminal.type === "commerce.register" &&
        terminal.status === "failed" &&
        terminal.tx === null &&
        terminal.explorer === null &&
        !terminal.mock &&
        terminal.error === "Provider failed after eight attempts",
    );
    recoveryCheck(
      executed === null &&
        journal?.version === 1 &&
        journal.chainId === 5042002 &&
        journal.owner?.toLowerCase() === deployment.operator.toLowerCase() &&
        Array.isArray(journal.entries),
    );
    const nextKey = original.idempotencyKey + ":jsonb-recovery-v1",
      recoveredId = commerceTransactionId({
        ...original,
        idempotencyKey: nextKey,
      });
    recoveryCheck(
      journal.entries.every(
        (entry) =>
          typeof entry?.id === "string" &&
          entry.id !== commerceTransactionId(original) &&
          entry.id !== recoveredId,
      ),
    );
    recoveryCheck(typeof chain.snapshot === "function");
    const proof = await chain.snapshot({ fresh: true });
    recoveryCheck(typeof proof.versionExists === "function");
    recoveryCheck((await proof.versionExists("0x" + v.id)) === false);
    recoveryCheck(
      !(await readJson(path.join(dir, "done", digest(nextKey) + ".json"))) &&
        !(await readJson(
          path.join(dir, "commerce-worker", digest(nextKey) + ".json"),
        )),
    );
    recoveryCheck(
      !(await listJobs(dir)).some(({ job }) => job?.idempotencyKey === nextKey),
    );
    o.recovery = {
      version: 1,
      reason: manifest.reason,
      manifest: clone(manifest),
      original: {
        jobId: o.jobId,
        job: clone(original),
        fingerprint: done.fingerprint,
        failure: clone(terminal),
        operationFingerprint: o.fingerprint,
      },
      idempotencyKey: nextKey,
      absenceProof: {
        blockNumber: String(proof.height),
        blockHash: proof.block.hash,
      },
      authorizedAt: now(),
    };
    o.job = { ...clone(original), idempotencyKey: nextKey };
    o.jobId = null;
    o.status = "queued";
    o.error = null;
    await save();
    await enqueue(o);
  }
  const service = {
    mode: "on",
    catalog: () => ({
      mode: "on",
      available: !!(chain && outbox && deployment),
      deployment: deployment
        ? { chainId: 5042002, address: deployment.address }
        : null,
      currency: "test USDC",
      network: "Arc testnet",
      firstPartyGames: clone(firstPartyGames),
      versions: clone(state.versions),
    }),
    operation: (operationId) => view(operation(operationId)),
    register: (input, actor) =>
      serial(async () => {
        requireLive();
        actor = address(actor);
        if (address(input.creator) !== actor) throw Error("WRONG_CREATOR");
        const game = firstPartyGames.find((g) => g.id === input.gameId);
        if (!game) throw Error("FIRST_PARTY_ONLY");
        const ver = input.version || "1.0.0";
        if (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(ver))
          throw Error("INVALID_VERSION");
        const operationId =
          input.operationId ||
          hash({ actor, game: game.id, version: ver }).slice(0, 48);
        const { o, existing } = make("register", actor, input, operationId);
        if (existing) {
          await enqueue(o);
          return view(o);
        }
        if (
          state.versions.some(
            (v) =>
              v.creator === actor && v.gameId === game.id && v.version === ver,
          )
        )
          throw Error("IMMUTABLE_VERSION");
        if (state.versions.length >= 200) throw Error("PUBLICATION_LIMIT");
        const terms = registration(input, {
          platformAddress: deployment.platform || platformAddress,
          venueAddress,
        });
        const v = {
          ...terms,
          id: hash({ game: game.id, ver, actor, terms }),
          gameId: game.id,
          version: ver,
          title: game.title,
          bundleHash: game.bundleHash || null,
          path: game.path || "/",
          status: "pending",
          publishedAt: now(),
          mode: "on",
          source: "first-party demo",
          referralCode: randomBytes(6).toString("hex"),
          creatorCode: randomBytes(6).toString("hex"),
        };
        state.versions.push(v);
        return queue(o, { version: v }, `creator-${actor.slice(2, 22)}`);
      }),
    quote: async ({ versionId, code = "", atVenue = false }) => {
      requireLive();
      const v = version(versionId);
      if (code && ![v.creatorCode, v.referralCode].includes(code))
        throw Error("INVALID_REFERRAL");
      const earnings = await chain.earnings(v.creator);
      return {
        ...splitPayment(v, earnings.lifetimeGross, {
          creatorBrought: code === v.creatorCode,
          referred: code === v.referralCode,
          atVenue,
        }),
        mode: "on",
        versionId,
        code,
      };
    },
    prepare: (action, input, actor) =>
      serial(async () => {
        requireLive();
        actor = address(actor);
        if (!["pay", "claim"].includes(action)) throw Error("INVALID_ACTION");
        const operationId = id(input.operationId);
        const { o, existing } = make(action, actor, input, operationId);
        if (existing) {
          if (o.status !== "prepared") return view(o);
          if (o.prepared.expiresAt > now()) return clone(o.prepared);
        }
        if (action === "pay") {
          const v = version(input.versionId);
          if (v.status !== "published") throw Error("PUBLICATION_PENDING");
          const roomCode = id(input.roomCode),
            code = input.code || "";
          if (code && ![v.creatorCode, v.referralCode].includes(code))
            throw Error("INVALID_REFERRAL");
          const proof = await chain.paymentContext({
            version: v,
            payer: actor,
          });
          const p = {
            versionId: "0x" + v.id,
            paymentId: commerceId(operationId),
            payer: actor,
            roomCode,
            price: v.price,
            attribution: code === v.creatorCode,
            referred: code === v.referralCode,
            atVenue: !!v.venue,
            chainTime: String(proof.chainTime),
            balance: String(proof.balance),
          };
          o.prepared = {
            operationId,
            action,
            config: { chainId: 5042002, contract: deployment.address },
            input: p,
            typedData: json(
              paymentData(
                { chainId: 5042002, contract: deployment.address },
                p,
              ),
            ),
            expiresAt: (Number(proof.chainTime) + 300) * 1000,
          };
        } else {
          const e = await chain.earnings(actor);
          if (BigInt(e.credit) <= 0n) throw Error("NOTHING_TO_CLAIM");
          const p = {
            recipient: actor,
            nonce: e.nonce,
            chainTime: e.chainTime,
          };
          o.prepared = {
            operationId,
            action,
            config: { chainId: 5042002, contract: deployment.address },
            input: p,
            amount: e.credit,
            typedData: json(
              claimData({ chainId: 5042002, contract: deployment.address }, p),
            ),
            expiresAt: (Number(e.chainTime) + 300) * 1000,
          };
        }
        if (!existing) state.operations.push(o);
        await save();
        return clone(o.prepared);
      }),
    pay: (input, actor) =>
      serial(async () => {
        requireLive();
        const o = operation(input.operationId);
        if (o.action !== "pay" || o.actor !== address(actor))
          throw Error("WRONG_PAYER");
        if (o.status !== "prepared") {
          await enqueue(o);
          return view(o);
        }
        const p = o.prepared;
        if (p.expiresAt <= now()) throw Error("AUTHORIZATION_EXPIRED");
        const data = paymentData(p.config, p.input);
        if (
          !(await verifyTypedData({
            ...data.permit,
            address: o.actor,
            signature: input.permitSignature,
          })) ||
          !(await verifyTypedData({
            ...data.authorization,
            address: o.actor,
            signature: input.authorizationSignature,
          }))
        )
          throw Error("INVALID_SIGNATURE");
        return queue(
          o,
          {
            request: data.permit.message,
            permitSignature: input.permitSignature,
            authorizationSignature: input.authorizationSignature,
            roomCode: p.input.roomCode,
            price: p.input.price,
          },
          p.input.roomCode,
        );
      }),
    claim: (input, actor) =>
      serial(async () => {
        requireLive();
        const o = operation(input.operationId);
        if (o.action !== "claim" || o.actor !== address(actor))
          throw Error("WRONG_RECIPIENT");
        if (o.status !== "prepared") {
          await enqueue(o);
          return view(o);
        }
        const p = o.prepared;
        if (p.expiresAt <= now()) throw Error("AUTHORIZATION_EXPIRED");
        const data = claimData(p.config, p.input);
        if (
          !(await verifyTypedData({
            ...data,
            address: o.actor,
            signature: input.signature,
          }))
        )
          throw Error("INVALID_SIGNATURE");
        return queue(
          o,
          {
            recipient: o.actor,
            nonce: p.input.nonce,
            deadline: String(data.message.deadline),
            signature: input.signature,
          },
          `creator-${o.actor.slice(2, 22)}`,
        );
      }),
    demo: ({ versionId, roomCode }, actor) =>
      serial(async () => {
        requireLive();
        const v = version(versionId);
        if (v.status !== "published") throw Error("PUBLICATION_PENDING");
        const key = hash({
          versionId,
          roomCode: id(roomCode),
          buyer: address(actor),
        });
        if (!state.demos[key]) {
          if (Object.keys(state.demos).length >= 10000)
            throw Error("DEMO_LIMIT");
          state.demos[key] = {
            mode: "on",
            kind: "free-demo",
            startsAt: now(),
            expiresAt: now() + 120000,
          };
          await save();
        }
        return clone(state.demos[key]);
      }),
    access: ({ versionId, roomCode, buyer }) => {
      const key = hash({ versionId, roomCode }),
        paid = state.access[key];
      if (
        paid?.allowed &&
        paid.checkedAt > now() - 30000 &&
        paid.expiresAt > now()
      )
        return { ...paid, mode: "on", kind: "pass" };
      const demo =
        state.demos[hash({ versionId, roomCode, buyer: address(buyer) })];
      if (demo?.expiresAt > now()) return { allowed: true, ...demo };
      return {
        allowed: false,
        mode: "on",
        reason: "PASS_REQUIRED",
        freeDemoAvailable: !demo,
      };
    },
    earnings: async (actor) => {
      requireLive();
      actor = address(actor);
      const e = await chain.earnings(actor);
      return {
        address: actor,
        mode: "on",
        claimable: e.credit,
        gross: e.lifetimeGross,
        asset: "USDC",
        payments: clone(
          state.receipts.filter(
            (r) => r.action === "pay" && r.credits?.[actor],
          ),
        ),
        claims: clone(
          state.receipts.filter(
            (r) => r.action === "claim" && r.recipient === actor,
          ),
        ),
        versions: clone(state.versions.filter((v) => v.creator === actor)),
        block: e.block,
      };
    },
    receipts: () => clone(state.receipts),
    poll: () =>
      serial(async () => {
        if (!chain || !outbox) return;
        for (const o of state.operations) {
          try {
            await recoverRegistration(o);
            if (o.recovery) recoveryChecks.delete(o.id);
          } catch (error) {
            if (recoveryChecks.has(o.id)) {
              const blocked = [
                "COMMERCE_RECOVERY_BLOCKED",
                "RPC_READ_MISMATCH",
                "INVALID_VERSION_PROOF",
                "WRONG_CHAIN",
                "ROUTER_CODE_MISMATCH",
                "ROUTER_CONFIGURATION_MISMATCH",
                "DOMAIN_MISMATCH",
              ].includes(error.code || error.message);
              recoveryChecks.set(o.id, {
                status: blocked ? "blocked" : "waiting",
                code: blocked
                  ? error.code || error.message
                  : "RECOVERY_CHECK_UNAVAILABLE",
              });
            }
            throw error;
          }
          if (o.status === "queued") {
            await enqueue(o);
            const terminal =
              readJobReceipt && o.jobId
                ? await readJobReceipt(dir, o.jobId)
                : (
                    await readJson(
                      path.join(
                        dir,
                        "done",
                        digest(o.job.idempotencyKey) + ".json",
                      ),
                    )
                  )?.receipt;
            if (!terminal) continue;
            if (terminal.status === "failed") {
              o.status = "failed";
              o.error = "WORKER_REVIEW_REQUIRED";
              continue;
            }
            if (
              terminal.status !== "done" ||
              terminal.mock ||
              !/^0x[\da-f]{64}$/i.test(terminal.tx || "")
            )
              continue;
            const proof = await chain.verifyReceipt(o.job, terminal.tx);
            o.status = "confirmed";
            o.result = {
              ...json(proof.data),
              tx: proof.tx,
              explorer: proof.explorer,
              mode: "on",
              mock: false,
              at: now(),
            };
            if (o.action === "register")
              version(o.job.payload.version.id).status = "published";
            if (!state.receipts.some((r) => r.id === o.id)) {
              const receipt = { id: o.id, action: o.action, ...o.result };
              state.receipts.push(receipt);
              try {
                onReceipt(clone(receipt));
              } catch {}
            }
          }
        }
        for (const r of state.receipts.filter(
          (r) => r.action === "pay" && r.expiresAt > now(),
        )) {
          const key = hash({ versionId: r.versionId, roomCode: r.roomCode });
          if (state.access[key]?.checkedAt > now() - 10000) continue;
          try {
            const proof = await chain.access({
              versionId: "0x" + r.versionId,
              roomCode: r.roomCode,
              buyer: r.buyer,
            });
            state.access[key] = { ...proof, checkedAt: now() };
          } catch {
            delete state.access[key];
          }
        }
        await save();
      }),
    close: async () => {
      await tail;
      closed = true;
    },
  };
  const pollNow = service.poll;
  let pendingPoll = null,
    nextPollAt = 0;
  service.poll = () => {
    if (pendingPoll) return pendingPoll;
    if (now() < nextPollAt) return Promise.resolve();
    pendingPoll = pollNow().finally(() => {
      pendingPoll = null;
      nextPollAt = now() + pollMs;
    });
    return pendingPoll;
  };
  await save();
  return service;
}
