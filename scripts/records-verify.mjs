import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRecord } from "../server/local-records/archive.cjs";
import { checkChain } from "../integrations/ledger/store.mjs";
const args = process.argv.slice(2);
const file = args.find((v) => !v.startsWith("--"));
if (!file)
  throw Error(
    "Usage: node scripts/records-verify.mjs RECORD.json | --ledger LEDGER.jsonl",
  );
if (args.includes("--ledger")) {
  const result = checkChain(await readFile(file, "utf8"));
  console.log(
    `PASS local journal hash chain: ${result.count} rows; head ${result.head}. This is not an external anchor or fresh chain verification.`,
  );
} else {
  validateRecord(JSON.parse(await readFile(file, "utf8")));
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts/replay-check.cjs"), path.resolve(file)],
    { cwd: root, encoding: "utf8" },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0) {
    console.error(
      "Record hashes are intact, but independent score verification did not pass. Use the exact archived game build; attested games have no score verifier.",
    );
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = 1;
  }
}
