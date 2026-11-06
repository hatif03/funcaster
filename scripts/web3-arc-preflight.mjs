import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import { loadConfig } from "../integrations/shared/config.mjs";
import { preflightArcEndpoints } from "../integrations/arc/provider.mjs";
export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length && !(args.length === 2 && args[0] === "--report"))
    throw Error("Usage: web3-arc-preflight.mjs [--report file.json]");
  const { report } = await preflightArcEndpoints(loadConfig(env));
  if (args[1]) await writeFile(args[1], JSON.stringify(report, null, 2) + "\n");
  console.log(
    "PASS: Arc deployment, token domains, role balances and unsigned create simulation. No signing or broadcasts.",
  );
  return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href)
  main().catch(() => {
    console.error(
      "FAIL: Arc preflight did not pass. Check public deployment pins, explicit limits and RPC availability.",
    );
    process.exitCode = 1;
  });
