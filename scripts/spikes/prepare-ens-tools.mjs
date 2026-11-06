// Download ABI artifacts from the SAME immutable revision used for registration.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const config = JSON.parse(
  await fs.readFile("docs/web3/spikes/ens-registration-input.json"),
);
assert.match(config.pinnedCommit, /^[0-9a-f]{40}$/);
const dir = ".tools/web3-spikes";
await fs.mkdir(dir, { recursive: true });
const manifest = { commit: config.pinnedCommit, artifacts: [] };
for (const name of [
  "ETHRegistry",
  "VerifiableFactory",
  "UserRegistryImpl",
  "PermissionedResolverImpl",
]) {
  const url = `https://raw.githubusercontent.com/ensdomains/contracts-v2/${config.pinnedCommit}/contracts/deployments/sepolia/${name}.json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  assert(response.ok, `Failed to fetch ${name}: ${response.status}`);
  const body = await response.text();
  const artifact = JSON.parse(body);
  assert(Array.isArray(artifact.abi));
  assert.match(artifact.address, /^0x[0-9a-fA-F]{40}$/);
  await fs.writeFile(`${dir}/${name}.json`, body);
  manifest.artifacts.push({
    name,
    address: artifact.address,
    url,
    sha256: createHash("sha256").update(body).digest("hex"),
  });
}
await fs.writeFile(
  "docs/web3/spikes/ens-artifacts.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log("Pinned ENS artifacts prepared; no chain writes.");
