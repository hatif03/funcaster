// Owner convenience entry point. Every child retains its own persisted budget and send guards.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
const root = new URL("../../", import.meta.url),
  at = (p) => new URL(p, root);
export function finalOwnerMode(args) {
  if (!args.length || (args.length === 1 && args[0] === "--check"))
    return "check";
  assert.deepEqual(args, ["--apply", "--confirm-testnets"]);
  return "apply";
}
async function run(file, args = []) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [at(file).pathname, ...args], {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            Error(
              `${file} stopped; inspect its public report and local journal. No automatic retry.`,
            ),
          ),
    );
  });
}
async function main() {
  const mode = finalOwnerMode(process.argv.slice(2));
  console.log(
    "G0 ceilings across restarts: 2 test GLM (including up to 0.02 to second writer), 0.005 SepETH, 0.2 test USDC gas, and 0.051 test EURC. Synthetic records only. No production feature is enabled.",
  );
  await run("scripts/spikes/arc-eurc-owner.mjs", ["--check"]);
  await run("scripts/spikes/rabdi/cross-owner.mjs", ["--check"]);
  const arc = JSON.parse(
    await fs.readFile(at("docs/web3/spikes/arc-eurc-owner-plan.json"), "utf8"),
  );
  assert(
    arc.before.authorizationUsed ||
      BigInt(arc.before.donor) >= BigInt(arc.plannedTopUp),
    "Claim free EURC on Arc Testnet to the project relayer first. No transaction was sent.",
  );
  await run("scripts/spikes/rabdi/final-runner.mjs", ["--check"]);
  if (mode === "check") {
    console.log(
      "All unsigned prerequisites passed; owner --apply execution is still required.",
    );
    return;
  }
  const rehearsal = JSON.parse(
    await fs.readFile(at("docs/web3/spikes/cross-rehearsal.json"), "utf8"),
  );
  const plan = JSON.parse(
    await fs.readFile(at("docs/web3/spikes/cross-owner-plan.json"), "utf8"),
  );
  assert.equal(rehearsal.status, "PASS-LOCAL");
  assert.equal(rehearsal.dataHash, plan.dataHash);
  await run("scripts/spikes/rabdi/final-runner.mjs", [
    "--apply",
    "--confirm-network",
    "rabdi-g0-final",
  ]);
  await run("scripts/spikes/rabdi/cross-owner.mjs", [
    "--apply",
    "--confirm-name",
    "play.funcaster.eth",
  ]);
  await run("scripts/spikes/arc-eurc-owner.mjs", [
    "--apply",
    "--confirm-network",
    "arc-testnet-EURC",
  ]);
  await run("scripts/spikes/rabdi/final-verify.mjs");
  await run("scripts/spikes/rabdi/cross-verify.mjs");
  await run("scripts/spikes/arc-verify-owner.mjs", ["EURC"]);
  console.log(
    "Owner probes and public verifiers completed. Agent must inspect the evidence and update the G0 verdict; hosted acceptance remains deferred.",
  );
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
