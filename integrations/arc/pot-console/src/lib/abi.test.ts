import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { conditionalPotAbi } from "./potAbi";

const root = resolve(import.meta.dirname, "../..");
const read = (rel: string) =>
  JSON.parse(readFileSync(resolve(root, rel), "utf8")) as Array<
    Record<string, unknown>
  >;

describe("exported ConditionalPot ABI", () => {
  const file = read("abi/ConditionalPot.abi.json");
  const iface = read("abi/IConditionalPot.abi.json");

  it("is identical to the typed module the console imports", () => {
    expect(conditionalPotAbi).toEqual(file);
  });

  it("exposes every function in the reusable interface", () => {
    const names = (abi: Array<Record<string, unknown>>) =>
      abi.filter((x) => x.type === "function").map((x) => x.name as string);
    for (const name of names(iface)) expect(names(file)).toContain(name);
  });

  it("exposes one event per transition", () => {
    const events = file.filter((x) => x.type === "event").map((x) => x.name);
    for (const e of [
      "Created",
      "Funded",
      "Locked",
      "Proposed",
      "Contested",
      "Settled",
      "Refunded",
      "Claimed",
    ]) {
      expect(events).toContain(e);
    }
  });

  it("has no payable function, receive or fallback, and no admin functions", () => {
    expect(file.some((x) => x.stateMutability === "payable")).toBe(false);
    expect(
      file.some((x) => x.type === "receive" || x.type === "fallback"),
    ).toBe(false);
    const names = file
      .filter((x) => x.type === "function")
      .map((x) => x.name as string);
    for (const banned of [
      "owner",
      "pause",
      "unpause",
      "upgradeTo",
      "transferOwnership",
      "setFee",
      "rescue",
      "onReport",
    ]) {
      expect(names).not.toContain(banned);
    }
  });

  it("exposes getPot with the fields the relay and console consume", () => {
    const getPot = file.find(
      (x) => x.type === "function" && x.name === "getPot",
    ) as {
      outputs: Array<{ components: Array<{ name: string }> }>;
    };
    const fields = getPot.outputs[0].components.map((c) => c.name);
    for (const f of [
      "asset",
      "stake",
      "seats",
      "fundedBitmap",
      "acceptedBitmap",
      "rule",
      "oracle",
      "fundDeadline",
      "settleDeadline",
      "challengeWindow",
      "minPlaySeconds",
      "lockedAt",
      "metadataHash",
      "termsHash",
      "state",
      "proposal",
      "total",
    ]) {
      expect(fields).toContain(f);
    }
  });
});
