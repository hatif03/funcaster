import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadConfig } from "../integrations/shared/config.mjs";
import {
  loadProtocol,
  createReadClient,
} from "../integrations/ens/runtime.mjs";
import {
  preflightEns,
  readDeploymentDocument,
} from "../integrations/ens/preflight.mjs";
import { EnsError } from "../integrations/ens/errors.mjs";

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length && !(args.length === 2 && args[0] === "--report"))
    throw new EnsError(
      "INVALID_ARGUMENTS",
      "Usage: web3-ens-preflight.mjs [--report file.json]",
    );
  const config = loadConfig(env);
  if (
    !config.ENS_PARENT ||
    !config.ENS_RPC_URLS.length ||
    !config.ENS_REGISTRAR_ADDRESS
  )
    throw new EnsError(
      "INVALID_CONFIG",
      "ENS_PARENT, ENS_RPC_URLS and public ENS_REGISTRAR_ADDRESS are required",
    );
  const protocol = await loadProtocol();
  const html = await readDeploymentDocument();
  const attempts = [];
  let report;
  for (const url of config.ENS_RPC_URLS) {
    try {
      report = await preflightEns({
        config,
        protocol,
        html,
        client: createReadClient(protocol, url),
      });
      report.rpcHost = new URL(url).host;
      break;
    } catch (error) {
      const code = error.code || "RPC_UNAVAILABLE";
      attempts.push({ rpcHost: new URL(url).host, code });
      // A deterministic mismatch is never concealed by another RPC's answer.
      if (
        error.name === "EnsError" &&
        !["STALE_CHAIN", "REORG", "INVALID_BLOCK"].includes(code)
      )
        throw error;
    }
  }
  report ||= {
    ok: false,
    scope: "ENS READ PREREQUISITES ONLY",
    reason: "RPC_UNAVAILABLE",
  };
  report.attempts = attempts;
  for (const row of report.deployments || [])
    console.log(
      `${row.status} ${row.name}: configured ${row.configured}; official ${row.official}; source ${row.source}`,
    );
  console.log(
    report.ok
      ? `PASS: ${report.proof.name}; namespace and registrar roles checked at block ${report.proof.blockNumber}. Live gameplay providers remain disabled.`
      : `FAIL: ${report.reason}`,
  );
  if (args[1])
    await fs.writeFile(
      args[1],
      JSON.stringify(
        report,
        (_, value) => (typeof value === "bigint" ? String(value) : value),
        2,
      ) + "\n",
    );
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href)
  main()
    .then((report) => {
      if (!report.ok) process.exitCode = 1;
    })
    .catch((error) => {
      // RPC errors may include credential-bearing URLs. Never log them verbatim.
      console.error(
        `FAIL: ${error.name === "EnsError" || error.name === "ConfigError" ? error.message : error.code === "ERR_MODULE_NOT_FOUND" ? "Run npm ci --ignore-scripts --prefix integrations/ens" : "ENS_PREFLIGHT_UNAVAILABLE"}`,
      );
      process.exitCode = 1;
    });
