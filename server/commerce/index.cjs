"use strict";
const express = require("express");
const { createHash, randomBytes } = require("node:crypto");
const digest = (value) =>
  "0x" + createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function createCommerce(options) {
  const { createCommerceStore } =
    await import("../../integrations/commerce/store.mjs");
  const { verifyTypedData } = await import("viem");
  const service =
      options.mode === "on"
        ? await (
            await import("../../integrations/commerce/live.mjs")
          ).createLiveCommerce(options)
        : createCommerceStore(options),
    router = express.Router(),
    challenges = new Map(),
    rates = new Map();
  router.use(express.json({ limit: "12kb" }));
  router.use((q, r, next) => {
    r.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    if (q.method === "POST") {
      try {
        if (q.get("origin") && new URL(q.get("origin")).host !== q.get("host"))
          return r.status(403).json({ error: "ORIGIN_DENIED" });
      } catch {
        return r.status(403).json({ error: "ORIGIN_DENIED" });
      }
      const at = Date.now();
      for (const [key, value] of rates) if (value.until < at) rates.delete(key);
      const key = q.socket.remoteAddress,
        rate = rates.get(key) || { count: 0, until: at + 60000 };
      if ((rates.size >= 500 && !rates.has(key)) || ++rate.count > 90)
        return r.status(429).json({ error: "RATE_LIMITED" });
      rates.set(key, rate);
    }
    next();
  });
  const error = (r, e) =>
    r
      .status(
        ["COMMERCE_DISABLED", "VERIFIED_ROUTER_REQUIRED"].includes(e.message)
          ? 503
          : e.message === "OPERATION_NOT_FOUND"
            ? 404
            : 400,
      )
      .json({
        error: /^[A-Z_]+$/.test(e.message) ? e.message : "INVALID_REQUEST",
      });
  router.get("/catalog", (_q, r) => r.json(service.catalog()));
  router.get("/earnings/:address", async (q, r) => {
    try {
      r.json(await service.earnings(q.params.address));
    } catch (e) {
      error(r, e);
    }
  });
  router.post("/quote", async (q, r) => {
    try {
      r.json(await service.quote(q.body));
    } catch (e) {
      error(r, e);
    }
  });
  router.post("/access", (q, r) => {
    try {
      r.json(service.access(q.body));
    } catch (e) {
      error(r, e);
    }
  });
  router.post("/prepare", async (q, r) => {
    try {
      if (!service.prepare) throw Error("LIVE_PREPARATION_UNAVAILABLE");
      r.json(
        await service.prepare(q.body.action, q.body.payload, q.body.address),
      );
    } catch (e) {
      error(r, e);
    }
  });
  router.get("/operations/:id", async (q, r) => {
    try {
      try {
        await service.poll?.();
      } catch {
        /* Retain the durable pending status during an RPC outage. */
      }
      if (!service.operation) throw Error("OPERATION_NOT_FOUND");
      r.json(service.operation(q.params.id));
    } catch (e) {
      error(r, e);
    }
  });
  router.post("/challenge", (q, r) => {
    try {
      const { action, payload, address } = q.body || {};
      if (
        !["register", "pay", "claim", "demo"].includes(action) ||
        !payload ||
        !/^0x[\da-fA-F]{40}$/.test(address || "")
      )
        throw Error("INVALID_REQUEST");
      for (const [key, value] of challenges)
        if (value.expires < Date.now()) challenges.delete(key);
      if (challenges.size >= 500) throw Error("BUSY");
      const nonce = "0x" + randomBytes(32).toString("hex"),
        expires = Date.now() + 120000;
      const typedData = {
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
        message: { action, requestHash: digest(payload), nonce, expires },
      };
      challenges.set(nonce, { action, payload, address, typedData, expires });
      r.json({ nonce, typedData });
    } catch (e) {
      error(r, e);
    }
  });
  router.post("/execute", async (q, r) => {
    try {
      const { nonce, signature } = q.body || {},
        challenge = challenges.get(nonce);
      if (!challenge || challenge.expires < Date.now())
        throw Error("EXPIRED_REQUEST");
      if (
        !(await verifyTypedData({
          ...challenge.typedData,
          address: challenge.address,
          signature,
        }))
      )
        throw Error("INVALID_SIGNATURE");
      challenges.delete(nonce);
      r.json(
        await service[challenge.action](challenge.payload, challenge.address),
      );
    } catch (e) {
      error(r, e);
    }
  });
  return { router, service };
}
module.exports = { createCommerce };
