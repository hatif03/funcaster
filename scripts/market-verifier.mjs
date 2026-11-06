// A separate local process replays the record before signing a MOCK report.
// This key never signs public transactions; live reporting is deliberately gated.
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import { resolveMarket } from "../integrations/market/math.mjs";
import { reportData } from "../integrations/market/types.mjs";
const execute = promisify(execFile);
export async function verifyReplayReport({ record, marketId, slots, key }) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "chonks-market-verify-"));
  try {
    const file = path.join(dir, "record.json");
    await writeFile(file, JSON.stringify(record), { mode: 0o600 });
    await execute(
      process.execPath,
      [fileURLToPath(new URL("./replay-check.cjs", import.meta.url)), file],
      { timeout: 30_000, maxBuffer: 128_000 },
    );
    const winMask = resolveMarket(slots, record.result);
    if (!winMask) throw Error("Record cannot resolve a winner market");
    const account = privateKeyToAccount(key);
    return {
      address: account.address,
      resultHash: record.result.hash,
      winMask,
      signature: await account.signTypedData(
        reportData(marketId, record.result.hash, winMask),
      ),
      mode: "mock",
      replayed: true,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const input = await new Promise((resolve, reject) => {
      let data = "";
      process.stdin.on("data", (chunk) => {
        data += chunk;
        if (data.length > 20_000_000) reject(Error("Record too large"));
      });
      process.stdin.on("end", () => resolve(JSON.parse(data)));
      process.stdin.on("error", reject);
    });
    console.log(JSON.stringify(await verifyReplayReport(input)));
  } catch {
    console.error("MARKET_REPLAY_REJECTED");
    process.exitCode = 1;
  }
}
