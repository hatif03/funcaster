import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { address, registration, splitPayment } from "./math.mjs";

const hash = (v) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const clone = (v) => structuredClone(v);
const id = (v) => {
  if (typeof v !== "string" || !/^[a-zA-Z0-9_-]{6,100}$/.test(v))
    throw Error("INVALID_ID");
  return v;
};
export function createCommerceStore({
  directory,
  mode = "off",
  platformAddress,
  venueAddress,
  firstPartyGames = [],
  now = Date.now,
  onReceipt = () => {},
  mockTransfer = () => {},
}) {
  if (!["off", "mock", "on"].includes(mode)) throw Error("INVALID_MODE");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(directory).isSymbolicLink())
    throw Error("INVALID_DIRECTORY");
  const file = path.join(directory, `commerce-${mode}.json`);
  let state = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : {
        schema: 1,
        versions: [],
        lifetime: {},
        credits: {},
        payments: [],
        claims: [],
        demos: {},
      };
  if (state.schema !== 1) throw Error("INVALID_STORE");
  const save = () => {
    const tmp = file + "." + randomBytes(5).toString("hex");
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    fs.renameSync(tmp, file);
  };
  const mutate = (fn) => {
    const before = clone(state);
    try {
      const result = fn();
      save();
      return result;
    } catch (error) {
      state = before;
      throw error;
    }
  };
  const requireMock = () => {
    if (mode !== "mock")
      throw Error(
        mode === "off" ? "COMMERCE_DISABLED" : "VERIFIED_ROUTER_REQUIRED",
      );
  };
  const version = (versionId) => {
    const v = state.versions.find((v) => v.id === versionId);
    if (!v) throw Error("VERSION_NOT_FOUND");
    return v;
  };
  const emit = (receipt) => {
    try {
      onReceipt(clone(receipt));
    } catch {
      /* Financial state remains durable if secondary local indexing is unavailable. */
    }
  };
  const service = {
    mode,
    catalog: () => ({
      mode,
      firstPartyGames: clone(firstPartyGames),
      versions: clone(state.versions),
      currency: "test USDC",
      network:
        mode === "mock"
          ? "MOCK · local simulation"
          : mode === "on"
            ? "Arc testnet · deployment required"
            : "Disabled",
    }),
    register(input, actor) {
      requireMock();
      const creator = address(actor);
      if (address(input.creator) !== creator) throw Error("WRONG_CREATOR");
      if (
        state.versions.length >= 200 ||
        state.versions.filter((v) => v.creator === creator).length >= 20
      )
        throw Error("PUBLICATION_LIMIT");
      const game = firstPartyGames.find((g) => g.id === input.gameId);
      if (!game) throw Error("FIRST_PARTY_ONLY");
      const ver = String(input.version || "1.0.0");
      if (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(ver))
        throw Error("INVALID_VERSION");
      if (
        state.versions.some(
          (v) =>
            v.gameId === game.id && v.version === ver && v.creator === creator,
        )
      )
        throw Error("IMMUTABLE_VERSION");
      const terms = registration(
        { ...input, creator },
        { platformAddress, venueAddress },
      );
      const record = {
        ...terms,
        id: hash({ game: game.id, ver, creator, terms }),
        gameId: game.id,
        version: ver,
        title: game.title,
        bundleHash: game.bundleHash || null,
        path: game.path || `/games/${game.id}/`,
        publishedAt: now(),
        mode,
        source: "first-party demo",
        review: "first-party only; external creator review unchanged",
        referralCode: randomBytes(6).toString("hex"),
        creatorCode: randomBytes(6).toString("hex"),
      };
      return mutate(() => {
        state.versions.push(record);
        return clone(record);
      });
    },
    quote({ versionId, code = "", atVenue = false }) {
      const v = version(versionId);
      if (code && code !== v.referralCode && code !== v.creatorCode)
        throw Error("INVALID_REFERRAL");
      return {
        ...splitPayment(v, state.lifetime[v.creator] || "0", {
          creatorBrought: code === v.creatorCode,
          referred: code === v.referralCode,
          atVenue: !!atVenue,
        }),
        versionId,
        code,
        mode,
      };
    },
    pay(input, actor) {
      requireMock();
      const buyer = address(actor),
        v = version(input.versionId),
        paymentId = id(input.paymentId),
        roomCode = id(input.roomCode);
      const existing = state.payments.find((p) => p.id === paymentId);
      const request = {
        versionId: v.id,
        buyer,
        roomCode,
        code: input.code || "",
        atVenue: !!input.atVenue,
      };
      if (existing) {
        if (existing.requestHash !== hash(request))
          throw Error("PAYMENT_CONFLICT");
        return clone(existing);
      }
      if (state.payments.length >= 10000) throw Error("PAYMENT_LIMIT");
      const quote = service.quote(request);
      const receipt = mutate(() => {
        for (const [who, n] of Object.entries(quote.credits))
          state.credits[who] = (
            BigInt(state.credits[who] || 0) + BigInt(n)
          ).toString();
        state.lifetime[v.creator] = (
          BigInt(state.lifetime[v.creator] || 0) + BigInt(v.price)
        ).toString();
        const p = {
          id: paymentId,
          action: "pass",
          ...request,
          requestHash: hash(request),
          amount: v.price,
          credits: quote.credits,
          asset: "USDC",
          mode,
          mock: true,
          at: now(),
          expiresAt: now() + 86400000,
          tx: null,
        };
        state.payments.push(p);
        return clone(p);
      });
      emit(receipt);
      return receipt;
    },
    demo({ versionId, roomCode }, actor) {
      requireMock();
      version(versionId);
      const key = hash({
        versionId,
        roomCode: id(roomCode),
        buyer: address(actor),
      });
      if (state.demos[key]) return clone(state.demos[key]);
      if (Object.keys(state.demos).length >= 10000) throw Error("DEMO_LIMIT");
      return mutate(() => {
        state.demos[key] = {
          mode,
          kind: "free-demo",
          startsAt: now(),
          expiresAt: now() + 120000,
        };
        return clone(state.demos[key]);
      });
    },
    access({ versionId, roomCode, buyer }) {
      if (mode !== "mock")
        return {
          allowed: false,
          reason:
            mode === "off" ? "COMMERCE_DISABLED" : "VERIFIED_ROUTER_REQUIRED",
          mode,
        };
      version(versionId);
      const who = address(buyer);
      const pass = state.payments.find(
        (p) =>
          p.versionId === versionId &&
          p.roomCode === roomCode &&
          p.expiresAt > now(),
      );
      if (pass)
        return { allowed: true, kind: "pass", expiresAt: pass.expiresAt, mode };
      const demo = state.demos[hash({ versionId, roomCode, buyer: who })];
      if (demo && demo.expiresAt > now()) return { allowed: true, ...demo };
      return {
        allowed: false,
        reason: "PASS_REQUIRED",
        freeDemoAvailable: !demo,
        mode,
      };
    },
    earnings(actor) {
      const who = address(actor);
      return {
        address: who,
        mode,
        claimable: state.credits[who] || "0",
        asset: "USDC",
        payments: clone(state.payments.filter((p) => p.credits[who])),
        claims: clone(state.claims.filter((c) => c.recipient === who)),
        versions: clone(state.versions.filter((v) => v.creator === who)),
        gross: state.lifetime[who] || "0",
      };
    },
    claim({ claimId }, actor) {
      requireMock();
      const recipient = address(actor),
        key = id(claimId),
        existing = state.claims.find((c) => c.id === key);
      if (existing) {
        if (existing.recipient !== recipient) throw Error("CLAIM_CONFLICT");
        return clone(existing);
      }
      if (state.claims.length >= 10000) throw Error("CLAIM_LIMIT");
      const amount = state.credits[recipient] || "0";
      if (BigInt(amount) <= 0n) throw Error("NOTHING_TO_CLAIM");
      mockTransfer({ recipient, amount });
      const receipt = mutate(() => {
        state.credits[recipient] = "0";
        const r = {
          id: key,
          action: "claim",
          recipient,
          amount,
          asset: "USDC",
          mode,
          mock: true,
          at: now(),
          tx: null,
        };
        state.claims.push(r);
        return clone(r);
      });
      emit(receipt);
      return receipt;
    },
    receipts: () => clone([...state.payments, ...state.claims]),
  };
  return service;
}
