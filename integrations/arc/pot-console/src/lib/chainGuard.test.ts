import { describe, it, expect } from "vitest";
import type { PublicClient } from "viem";
import { DEFAULT_CONFIG } from "../config";
import { readDeployment, finishRead } from "./chainGuard";

const contract = `0x${"11".repeat(20)}` as const;
const hash = `0x${"22".repeat(32)}` as const;
const block = { number: 100n, hash, timestamp: 1000n };
const config = { ...DEFAULT_CONFIG, potAddress: contract };
const now = () => 1000000;
function fixture() {
  return {
    getChainId: () => Promise.resolve(5042002),
    getBlock: () => Promise.resolve({ ...block }),
    getCode: () => Promise.resolve("0x6000"),
    readContract: () =>
      Promise.resolve(["0x0f", "ChonksPot", "1", 5042002n, contract, hash, []]),
  };
}
describe("fresh canonical deployment guard", () => {
  it("accepts the configured testnet domain at a fresh canonical block", async () => {
    const client = fixture() as unknown as PublicClient;
    expect(await readDeployment(config, client, now)).toEqual(block);
    await finishRead(client, block, now);
  });
  it("blocks wrong chains, missing code, changed domains, stale and future blocks", async () => {
    for (const patch of [
      { getChainId: () => Promise.resolve(1) },
      { getCode: () => Promise.resolve("0x") },
      {
        readContract: () =>
          Promise.resolve([
            "0x0f",
            "NotChonks",
            "1",
            5042002n,
            contract,
            hash,
            [],
          ]),
      },
      { getBlock: () => Promise.resolve({ ...block, timestamp: 969n }) },
      { getBlock: () => Promise.resolve({ ...block, timestamp: 1006n }) },
    ])
      await expect(
        readDeployment(
          config,
          { ...fixture(), ...patch } as unknown as PublicClient,
          now,
        ),
      ).rejects.toThrow();
  });
  it("blocks reorgs and requests which have become stale during the read", async () => {
    const client = fixture() as unknown as PublicClient;
    await expect(
      finishRead(client, { ...block, hash: contract }, now),
    ).rejects.toThrow(/changed/);
    await expect(finishRead(client, block, () => 1031000)).rejects.toThrow(
      /stale/,
    );
  });
});
