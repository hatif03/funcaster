import { createHash } from "node:crypto";
import { zeroAddress } from "viem";
import pin from "./deployment-pin.json" with { type: "json" };
import abi from "./abi.json" with { type: "json" };
import { createHierarchyReader } from "./hierarchy.mjs";
import { CONTRACT_KEYS } from "./runtime.mjs";
import { requireEns } from "./errors.mjs";

export function deploymentDiff(html, protocol) {
  requireEns(
    typeof html === "string" && html.length < 2_000_000,
    "DOCS_UNAVAILABLE",
    "ENS deployment document is missing or too large",
  );
  const start = html.indexOf('id="sepolia-ensv2"');
  requireEns(
    start >= 0,
    "DOCS_CHANGED",
    "Could not identify the Sepolia ENSv2 deployment section",
  );
  const tableStart = html.indexOf("<table", start);
  const tableEnd = html.indexOf("</table>", tableStart);
  requireEns(
    tableStart >= 0 && tableEnd > tableStart,
    "DOCS_CHANGED",
    "Could not identify the Sepolia deployment table",
  );
  const table = html.slice(tableStart, tableEnd);
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]),
  );
  return Object.entries(CONTRACT_KEYS).map(([name, [key]]) => {
    const matches = rows.filter(
      ([label]) =>
        label
          ?.replace(/<[^>]*>/g, " ")
          .trim()
          .split(/\s+/)[0] === name,
    );
    requireEns(
      matches.length === 1,
      "DOCS_CHANGED",
      `Missing or ambiguous Sepolia deployment: ${name}`,
    );
    const official = matches[0][1]?.replace(/<[^>]*>/g, "").trim();
    requireEns(
      /^0x[\da-fA-F]{40}$/.test(official),
      "DOCS_CHANGED",
      `Invalid published address: ${name}`,
    );
    const pinned = pin.contracts[name];
    const configured = protocol.contracts[key];
    return {
      name,
      pinned,
      configured,
      official,
      source: CONTRACT_KEYS[name][1]
        ? `ensjs ${pin.ensjs}`
        : "pinned official artifact (not exposed by ensjs)",
      status:
        official.toLowerCase() === configured.toLowerCase() &&
        configured.toLowerCase() === pinned.toLowerCase()
          ? "PASS"
          : "MISMATCH",
    };
  });
}

export async function readDeploymentDocument(fetcher = fetch) {
  const response = await fetcher(pin.docsUrl, {
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  requireEns(
    response.ok,
    "DOCS_UNAVAILABLE",
    "Official ENS deployment document is unavailable",
  );
  const html = await response.text();
  requireEns(
    html.length < 2_000_000,
    "DOCS_UNAVAILABLE",
    "ENS deployment document is too large",
  );
  return html;
}

// This verifies namespace prerequisites only. It never enables a provider or
// reports the unfinished warm pool / host enforcement / worker as ready.
export async function preflightEns({ config, client, protocol, html, now }) {
  const deployments = deploymentDiff(html, protocol);
  const failures = deployments.filter((row) => row.status !== "PASS");
  if (failures.length)
    return {
      ok: false,
      scope: "ENS READ PREREQUISITES ONLY",
      deployments,
      reason: "DEPLOYMENT_DRIFT",
    };
  requireEns(
    /^0x[\da-fA-F]{40}$/.test(config.ENS_REGISTRAR_ADDRESS) &&
      config.ENS_REGISTRAR_ADDRESS !== zeroAddress,
    "INVALID_CONFIG",
    "Set the public ENS_REGISTRAR_ADDRESS; no private key is needed",
  );
  const reader = createHierarchyReader({
    client,
    protocol,
    parent: config.ENS_PARENT,
    now,
  });
  const proof = await reader.walk(`play.${config.ENS_PARENT}`, {
    expectedOwner: config.ENS_REGISTRAR_ADDRESS,
    requireResolver: true,
  });
  requireEns(
    proof.leaf.owner.toLowerCase() ===
      config.ENS_REGISTRAR_ADDRESS.toLowerCase(),
    "OWNER_MISMATCH",
    "play owner differs from the configured registrar",
  );
  requireEns(
    proof.leaf.subregistry !== zeroAddress,
    "MISSING_REGISTRY",
    "play needs a subregistry",
  );
  const roles = [];
  for (const [name, address, kind, bitmap] of [
    [
      "parent registry",
      proof.nodes[0].subregistry,
      "registry",
      protocol.registryRoles,
    ],
    [
      "play registry",
      proof.leaf.subregistry,
      "registry",
      protocol.registryRoles,
    ],
    ["play resolver", proof.leaf.resolver, "resolver", protocol.resolverRoles],
  ]) {
    const allowed = await client.readContract({
      address,
      abi: abi[kind],
      functionName: "hasRootRoles",
      args: [bitmap, config.ENS_REGISTRAR_ADDRESS],
      blockNumber: proof.blockNumber,
    });
    requireEns(
      allowed === true,
      "MISSING_ROLES",
      `Registrar lacks required roles on ${name}`,
    );
    roles.push({ name, address, bitmap: String(bitmap), status: "PASS" });
  }
  const final = await client.getBlock({ blockNumber: proof.blockNumber });
  requireEns(
    final.hash === proof.blockHash,
    "REORG",
    "ENS block changed during role verification",
  );
  requireEns(
    (now?.() ?? Date.now()) / 1000 - Number(proof.chainTime) <= 30,
    "STALE_CHAIN",
    "ENS preflight exceeded the freshness window",
  );
  return {
    ok: true,
    at: new Date(now?.() ?? Date.now()).toISOString(),
    scope:
      "ENS READ PREREQUISITES ONLY — no transactions or provider enablement",
    chainId: protocol.chainId,
    sourceCommit: pin.commit,
    deployments,
    docs: {
      url: pin.docsUrl,
      sha256: createHash("sha256").update(html).digest("hex"),
    },
    roles,
    proof,
    pending: [
      "E3 warm pool and party lifecycle",
      "E4 seat lifecycle",
      "E5 live host enforcement",
      "E6 records / join / pot roster",
    ],
  };
}
