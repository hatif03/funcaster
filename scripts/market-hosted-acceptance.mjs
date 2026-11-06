// Owner-operated hooks for the one-table hosted acceptance. Importing is inert.
// Browser keys remain in saved profiles; no raw key or signed transaction is read.
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { identityData, betData } from "../integrations/market/types.mjs";
import { fundingIntent } from "../integrations/market/intents.mjs";
import {
  paymentData,
  claimData,
  commerceId,
} from "../integrations/commerce/signatures.mjs";

const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const json = (v) =>
  JSON.parse(
    JSON.stringify(v, (_, x) => (typeof x === "bigint" ? String(x) : x)),
  );
const txHash = (value) => /^0x[\da-f]{64}$/i.test(value || "");
export function guardMarketQuote(q, expected, pins, now = Date.now()) {
  assert.equal(q.chainId, 5042002);
  assert.equal(q.marketRef, expected.marketId);
  assert.equal(q.kind, expected.kind);
  assert.equal(q.outcome, expected.outcome);
  assert.equal(q.amount, "50000");
  assert.equal(q.minPayout, "0");
  assert.ok(same(q.bettor, expected.address));
  assert.ok(same(q.asset, "0x3600000000000000000000000000000000000000"));
  assert.ok(
    same(
      q.contract,
      q.kind === "cheer" ? pins.MARKET_SPLIT_ADDRESS : pins.MARKET_POT_ADDRESS,
    ),
  );
  return fundingIntent(q, { now });
}
export function guardCommercePayment(prepared, expected, now = Date.now()) {
  assert.ok(same(prepared.config.contract, expected.router));
  assert.equal(prepared.input.versionId, "0x" + expected.versionId);
  assert.equal(prepared.input.paymentId, commerceId(expected.operationId));
  assert.equal(prepared.input.price, "500000");
  assert.equal(prepared.input.roomCode, expected.roomCode);
  assert.ok(same(prepared.input.payer, expected.buyer));
  assert.equal(prepared.input.attribution, false);
  assert.equal(prepared.input.referred, false);
  assert.equal(prepared.input.atVenue, false);
  assert.ok(prepared.expiresAt > now && prepared.expiresAt <= now + 310000);
  return paymentData(prepared.config, prepared.input);
}
export function assertSuccessfulMarket(market) {
  assert.equal(
    market?.phase,
    "final",
    "Prediction success path did not settle; inspect its refund status",
  );
  assert.equal(
    market?.cheersPhase,
    "paid",
    "Cheers did not pay the human seats; inspect refund status",
  );
}
export async function admittedOnce(journal, key, { save, reconcile, submit }) {
  const prior = journal[key];
  if (prior?.done) return prior.result;
  if (prior?.attempted) {
    const result = await reconcile(prior);
    if (!result)
      throw Error(
        `${key} is unresolved; preserve this journal and inspect it. No automatic resend`,
      );
    journal[key] = { ...prior, done: true, result };
    await save();
    return result;
  }
  journal[key] = { ...(prior || {}), attempted: true };
  await save();
  const result = await submit();
  journal[key] = { ...journal[key], done: true, result };
  await save();
  return result;
}

export async function confirmIndependentPositions(actions) {
  // Enqueue independent authorizations promptly, before the short market window
  // expires. Wait for every branch before allowing a pause/cleanup on failure.
  const results = await Promise.allSettled(
    actions.map(async (action) => action()),
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
  return results.map((result) => result.value);
}

export function createHostedMarketHooks({ pins: injectedPins } = {}) {
  let env,
    saved,
    pins,
    actors = [];
  async function post(route, body, token) {
    const r = await fetch(env.base + route, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const value = await r.json();
    if (!r.ok) throw Error(`${route}: ${value.error || r.status}`);
    return value;
  }
  async function personal(actor) {
    return env.read("/api/web3/market/me", {
      headers: { Authorization: `Bearer ${actor.token}` },
    });
  }
  const sign = (page, data) =>
    page.evaluate(
      async (typed) => (await import("/web3/phone-signer.js")).signTyped(typed),
      json(data),
    );
  async function connect(page, key) {
    const prior = saved.addresses?.[key];
    const address = await page.evaluate(async (expected) => {
      if (expected && !localStorage.getItem("chonks.web3.key"))
        throw Error(
          "Saved acceptance key is missing; do not create a new identity",
        );
      return (await import("/web3/phone-signer.js")).loadOrCreateKey();
    }, prior);
    if (prior) assert.ok(same(prior, address), "Saved identity changed");
    saved.addresses ||= {};
    saved.addresses[key] = address;
    await env.save();
    const challenge = await post("/api/web3/market/challenge", {});
    assert.ok(
      challenge.expiresAt > Date.now() &&
        challenge.expiresAt <= Date.now() + 120000,
    );
    const session = await post("/api/web3/market/session", {
      ...challenge,
      address,
      signature: await sign(
        page,
        identityData(challenge.nonce, challenge.expiresAt),
      ),
    });
    assert.equal(session.mode, env.mock ? "mock" : "on");
    return { page, address, token: session.token, key };
  }
  async function host(command, args) {
    const reply = await env.desktop.evaluate(
      ({ command, args }) =>
        new Promise((resolve, reject) => {
          const socket = window.__chonksAcceptanceHostSocket;
          if (!socket?.connected)
            return reject(Error("Original host socket is unavailable"));
          socket
            .timeout(30000)
            .emit(command, args, (error, answer) =>
              error
                ? reject(Error("Host action uncertain; keep the journal"))
                : resolve(answer),
            );
        }),
      { command, args },
    );
    if (!reply?.ok) throw Error(reply?.error || "Host action failed");
    return reply;
  }
  async function commerceExecute(actor, action, payload) {
    const c = await post("/api/commerce/challenge", {
      action,
      payload,
      address: actor.address,
    });
    const expires = c.typedData?.message?.expires;
    assert.ok(
      Number.isSafeInteger(expires) &&
        expires > Date.now() &&
        expires <= Date.now() + 125000,
    );
    assert.ok(txHash(c.nonce));
    const typed = {
      domain: {
        name: "Funcaster Creator Commerce",
        version: "1",
        chainId: 5042002,
      },
      primaryType: "CommerceRequest",
      types: {
        CommerceRequest: [
          { name: "action", type: "string" },
          { name: "requestHash", type: "bytes32" },
          { name: "nonce", type: "bytes32" },
          { name: "expires", type: "uint256" },
        ],
      },
      message: {
        action,
        requestHash:
          "0x" +
          createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
        nonce: c.nonce,
        expires,
      },
    };
    return post("/api/commerce/execute", {
      nonce: c.nonce,
      signature: await sign(actor.page, typed),
    });
  }
  async function operation(id) {
    const value = await env.read(
      "/api/commerce/operations/" + encodeURIComponent(id),
      { allowMissing: true },
    );
    if (!value) return null;
    if (value.status === "failed")
      throw Error("Commerce operation failed; inspect the retained receipt");
    return value;
  }
  async function waitOperation(id) {
    let result;
    await env.until(
      "confirmed creator operation",
      async () => {
        result = await operation(id);
        return result?.status === "confirmed" && txHash(result.tx);
      },
      600000,
    );
    return result;
  }
  async function commerceBefore() {
    if (env.mock) return; // The mock rehearsal exercises market/game hooks; live commerce guards have focused tests.
    const [creator, buyer] = actors.slice(2),
      c = (saved.commerce ||= {});
    c.prefix ||= `accept-${randomBytes(10).toString("hex")}`;
    await env.save();
    const registerId = c.prefix + "-register",
      payId = c.prefix + "-pay";
    await admittedOnce(c, "register", {
      save: env.save,
      reconcile: () => waitOperation(registerId),
      submit: async () => {
        await commerceExecute(creator, "register", {
          operationId: registerId,
          gameId: "star-catch",
          version: "1.0.0",
          creator: creator.address.toLowerCase(),
          price: "500000",
        });
        return waitOperation(registerId);
      },
    });
    const catalog = await env.read("/api/commerce/catalog");
    assert.equal(catalog.mode, "on");
    assert.ok(same(catalog.deployment?.address, pins.ROUTER_ADDRESS));
    const version = catalog.versions.find(
      (v) =>
        same(v.creator, creator.address) &&
        v.gameId === "star-catch" &&
        v.version === "1.0.0",
    );
    assert.ok(version && version.price === "500000");
    c.versionId = version.id;
    await env.save();
    await admittedOnce(c, "pay", {
      save: env.save,
      reconcile: () => waitOperation(payId),
      submit: async () => {
        const prepared = await post("/api/commerce/prepare", {
          action: "pay",
          address: buyer.address,
          payload: {
            operationId: payId,
            versionId: version.id,
            roomCode: env.journal.host.code,
          },
        });
        if (prepared.status) return waitOperation(payId);
        const data = guardCommercePayment(prepared, {
          router: pins.ROUTER_ADDRESS,
          versionId: version.id,
          operationId: payId,
          roomCode: env.journal.host.code,
          buyer: buyer.address,
        });
        c.preparedPayment = prepared;
        await env.save();
        await commerceExecute(buyer, "pay", {
          operationId: payId,
          permitSignature: await sign(buyer.page, data.permit),
          authorizationSignature: await sign(buyer.page, data.authorization),
        });
        return waitOperation(payId);
      },
    });
    const access = await post("/api/commerce/access", {
      versionId: version.id,
      roomCode: env.journal.host.code,
      buyer: creator.address,
    });
    assert.equal(access.allowed, true);
    assert.equal(access.kind, "pass");
    const another = await post("/api/commerce/access", {
      versionId: version.id,
      roomCode: "OTHER1",
      buyer: buyer.address,
    });
    assert.equal(another.allowed, false);
    await host("commerce", { versionId: version.id });
    await env.check(
      "Creator version published; a 0.50 test-USDC pass unlocks this table only",
    );
  }
  async function submitBet(actor, kind, outcome, key) {
    const observe = async () => {
      let p;
      await env.until(
        `confirmed ${kind}`,
        async () => {
          p = (await personal(actor)).positions.find(
            (v) => v.marketId === saved.marketId,
          );
          if (p?.actions?.some((a) => a.status === "failed"))
            throw Error(
              "Prediction worker receipt failed; inspect before retrying",
            );
          return kind === "cheer"
            ? BigInt(p?.cheered || 0) === 50000n
            : BigInt(p?.stakes?.[outcome] || 0) === 50000n;
        },
        180000,
      );
      return { marketId: saved.marketId, amount: "50000", kind, outcome };
    };
    await admittedOnce(saved, key, {
      save: env.save,
      reconcile: observe,
      submit: async () => {
        const requested = {
          marketId: saved.marketId,
          kind,
          outcome,
          amount: "50000",
          minPayout: "0",
        };
        let intent, typed;
        if (env.mock) {
          const match = (await env.read("/api/web3/matches")).matches.find(
            (m) => m.marketId === saved.marketId,
          );
          intent = {
            ...requested,
            nonce: "0x" + randomBytes(32).toString("hex"),
            expiresAt: match.closesAt,
          };
          typed = betData(intent);
        } else {
          const quote = await post(
            "/api/web3/market/quote",
            requested,
            actor.token,
          );
          typed = guardMarketQuote(
            quote,
            { ...requested, address: actor.address },
            pins,
          );
          saved[key].quote = quote;
          await env.save();
          intent = { quoteId: quote.quoteId };
        }
        await post(
          "/api/web3/market/bet",
          { intent, signature: await sign(actor.page, typed) },
          actor.token,
        );
        return observe();
      },
    });
  }
  return {
    async initDesktop(page) {
      await page.addInitScript(() => {
        let io;
        Object.defineProperty(window, "io", {
          configurable: true,
          get: () => io,
          set(fn) {
            io = Object.assign(function (...args) {
              const socket = fn(...args);
              if (args[0] === "/party")
                window.__chonksAcceptanceHostSocket = socket;
              return socket;
            }, fn);
          },
        });
      });
    },
    async beforeStart(input) {
      env = input;
      saved = env.journal.marketAcceptance ||= { version: 1 };
      pins =
        injectedPins ||
        (env.mock
          ? {}
          : JSON.parse(
              await readFile(
                path.resolve(".local/funcaster-deployment/public-config.json"),
                "utf8",
              ),
            ));
      actors = [];
      for (let i = 0; i < 2; i++) {
        const c = await env.context(`spectator-${i + 1}`, {
            width: 390,
            height: 844,
          }),
          page = await c.newPage();
        await page.goto(env.base + "/predict");
        actors.push(await connect(page, `spectator-${i + 1}`));
      }
      for (let i = 0; i < 2; i++)
        actors.push(await connect(env.phones[i], `phone-${i + 1}`));
      assert.equal(new Set(actors.map((a) => a.address.toLowerCase())).size, 4);
      await env.until(
        "both spectator bankroll receipts",
        async () => {
          const values = await Promise.all(actors.slice(0, 2).map(personal));
          return values.every((v) => BigInt(v.balance) >= 150000n);
        },
        600000,
      );
      if (!saved.initialBalances) {
        saved.initialBalances = await Promise.all(
          actors.map(async (a) => (await personal(a)).balance),
        );
        if (!env.mock)
          for (const b of saved.initialBalances)
            assert.ok(
              BigInt(b) <= 1100000n,
              "Initial bankroll exceeds 1.10 test-USDC cap",
            );
        await env.save();
      }
      if (!env.journal.started) await commerceBefore();
      if (!saved.marketId) {
        if (saved.listingAttempted) {
          saved.marketId = env.getState()?.web3?.predictions?.marketId;
          if (!saved.marketId)
            throw Error(
              "Listing acknowledgement unresolved; do not open another market",
            );
        } else {
          assert.equal(
            env.journal.started,
            false,
            "Cannot create predictions after a round started",
          );
          saved.listingAttempted = true;
          await env.save();
          saved.marketId = (
            await host("predictions", {
              listed: true,
              windowSeconds: env.mock ? 30 : 120,
            })
          ).marketId;
        }
        assert.ok(txHash(saved.marketId));
        await env.save();
      }
      if (!env.journal.started) {
        await env.until(
          "on-chain prediction and cheer pools opening",
          async () => {
            const m = (await env.read("/api/web3/matches")).matches.find(
              (v) => v.marketId === saved.marketId,
            );
            if (
              m &&
              ["locked", "void", "final"].includes(m.phase) &&
              !saved.betTwo?.done
            )
              throw Error(
                "Prediction window closed before both bets; retain the same market for refunds",
              );
            return m?.phase === "betting" && !m.stale;
          },
          120000,
        );
        await confirmIndependentPositions([
          () => submitBet(actors[0], "prediction", 0, "betOne"),
          () => submitBet(actors[1], "prediction", 1, "betTwo"),
          () => submitBet(actors[0], "cheer", 0, "cheer"),
        ]);
        await env.check(
          "Two independent spectators backed opposite outcomes with 0.05 each and sent a 0.05 cheer",
        );
        await env.until(
          "prediction window closed before game start",
          () => env.getState()?.startReason === "Ready to play",
          160000,
        );
      }
    },
    async afterResult(input) {
      env = input;
      let terminal;
      await env.until(
        "matching result reports and prediction liveness",
        async () => {
          const m =
            (await personal(actors[0])).matches?.find(
              (v) => v.marketId === saved.marketId,
            ) ||
            (await env.read("/api/web3/matches")).matches.find(
              (v) => v.marketId === saved.marketId,
            );
          terminal = m;
          return (
            ["final", "void"].includes(m?.phase) &&
            ["paid", "refund"].includes(m?.cheersPhase)
          );
        },
        600000,
      );
      assertSuccessfulMarket(terminal);
      for (const actor of actors) {
        const p = (await personal(actor)).positions.find(
          (v) => v.marketId === saved.marketId,
        );
        const canClaim = env.mock
          ? p && (!p.claimed || !p.cheersClaimed)
          : BigInt(p?.claimable || 0) > 0n;
        if (canClaim)
          await admittedOnce(saved, `claim-${actor.key}`, {
            save: env.save,
            reconcile: async () => {
              const p = (await personal(actor)).positions.find(
                (v) => v.marketId === saved.marketId,
              );
              return p && (p.claimed || p.cheersClaimed)
                ? { recovered: true }
                : null;
            },
            submit: () =>
              post(
                "/api/web3/market/claim",
                { marketId: saved.marketId },
                actor.token,
              ),
          });
      }
      if (!env.mock) {
        await env.until(
          "prediction and equal-seat cheer payouts",
          async () => {
            const rows = await Promise.all(actors.map(personal));
            const spectatorSum = rows
              .slice(0, 2)
              .reduce((n, v) => n + BigInt(v.balance), 0n);
            const initialSum = saved.initialBalances
              .slice(0, 2)
              .reduce((n, v) => n + BigInt(v), 0n);
            return (
              spectatorSum === initialSum - 50000n &&
              rows
                .slice(2)
                .every((v) =>
                  v.positions.some(
                    (p) => p.marketId === saved.marketId && p.cheersClaimed,
                  ),
                )
            );
          },
          600000,
        );
        const creator = actors[2],
          c = saved.commerce,
          claimId = c.prefix + "-claim";
        await admittedOnce(c, "claim", {
          save: env.save,
          reconcile: () => waitOperation(claimId),
          submit: async () => {
            const p = await post("/api/commerce/prepare", {
              action: "claim",
              address: creator.address,
              payload: { operationId: claimId },
            });
            if (p.status) return waitOperation(claimId);
            assert.ok(same(p.config.contract, pins.ROUTER_ADDRESS));
            assert.ok(same(p.input.recipient, creator.address));
            assert.equal(p.amount, "500000");
            await commerceExecute(creator, "claim", {
              operationId: claimId,
              signature: await sign(creator.page, claimData(p.config, p.input)),
            });
            return waitOperation(claimId);
          },
        });
        assert.equal(
          (await env.read("/api/commerce/earnings/" + creator.address))
            .claimable,
          "0",
        );
        await env.check(
          "Predictions paid, both human seats collected cheers, and creator claimed the 0.50 test-USDC pass revenue",
        );
      } else
        await env.check(
          "MOCK predictions and cheers reached verified pull payouts",
        );
      for (const actor of actors.slice(0, 2)) {
        await actor.page.screenshot({
          path: path.join(env.directory, actor.key + ".png"),
          fullPage: true,
        });
        assert.ok(
          await actor.page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
      }
      saved.completed = true;
      await env.save();
      await writeFile(
        path.join(env.directory, "market-commerce-report.json"),
        JSON.stringify(
          {
            mode: env.mock ? "mock" : "public-testnet",
            origin: env.base,
            marketId: saved.marketId,
            resultHash: env.journal.resultHash,
            checks: env.journal.checks,
            limits: {
              identityBankrollUSDC: "1.10",
              identities: 4,
              totalBankrollUSDC: "4.40",
              predictionTotalUSDC: "0.10",
              cheerUSDC: "0.05",
              roomPassUSDC: "0.50",
            },
            caveats:
              "No second/abandoned round or live refund path is exercised. Mock mode skips commerce chain execution. Public transaction confirmations use the deployed service; this report is not an independent two-host audit.",
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
    },
  };
}
