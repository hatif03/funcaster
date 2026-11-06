import { pathToFileURL } from "node:url";
import { loadConfig } from "../integrations/shared/config.mjs";
export function preflight(env, { mock = false, role = "relay" } = {}) {
  const config = loadConfig(
    { ...env, PARTNERS: env.PARTNERS || (mock ? "mock" : "off") },
    { role },
  );
  const rows = [
    ["config", "PASS"],
    ["play money", config.PLAY_MONEY === "1" ? "PASS" : "FAIL"],
  ];
  if (config.ARC_CHAIN_ID !== 5042002)
    throw new Error(
      "This build supports testnets only; mainnet preflight is disabled.",
    );
  for (const key of [
    "WEB3_ENS",
    "WEB3_ARC",
    "WEB3_ARKIV",
    "MARKETS",
    "COMMERCE",
    "STREAMERS",
  ])
    rows.push([
      key,
      config[key] === "on"
        ? "UNVERIFIED (requires live partner preflight)"
        : config[key].toUpperCase(),
    ]);
  if (rows.some(([, status]) => status.startsWith("UNVERIFIED")))
    return { ok: false, rows };
  rows.push([
    "network",
    mock ? "SKIPPED (--mock: offline only)" : "OFF (no live providers enabled)",
  ]);
  return { ok: true, rows };
}
export async function runPreflight(env, { mock = false, arcCheck } = {}) {
  const result = preflight(env, { mock });
  const config = loadConfig({
    ...env,
    PARTNERS: env.PARTNERS || (mock ? "mock" : "off"),
  });
  if (!mock && config.WEB3_ARC === "on") {
    const check =
      arcCheck ||
      (await import("../integrations/arc/provider.mjs")).preflightArcEndpoints;
    const { report } = await check(config);
    result.rows.find(([key]) => key === "WEB3_ARC")[1] = report.ok
      ? "PASS (deployment, domains, balances, unsigned simulation)"
      : "FAIL";
    result.ok = !result.rows.some(
      ([, status]) => status.startsWith("UNVERIFIED") || status === "FAIL",
    );
    result.arc = report;
  }
  return result;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const flags = process.argv.slice(2);
    if (flags.some((f) => f !== "--mock"))
      throw new Error("Usage: web3-preflight.mjs [--mock]");
    const result = await runPreflight(process.env, {
      mock: flags.includes("--mock"),
    });
    for (const [name, status] of result.rows)
      console.log(`${name.padEnd(18)} ${status}`);
    console.log(
      result.ok
        ? result.arc
          ? "PASS: configuration and read-only Arc deployment preflight; no signing or broadcasts."
          : "PASS: configuration only; no live-chain claims."
        : "FAIL: at least one live partner preflight is still pending. Use the per-partner preflight commands for details.",
    );
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(
      error.name === "ConfigError"
        ? `FAIL: ${error.message}`
        : "FAIL: preflight unavailable; check the enabled partners and public deployment configuration. No signing or broadcasts.",
    );
    process.exitCode = 1;
  }
}
