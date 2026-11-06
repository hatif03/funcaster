// Export only the compiled router, never test keys or environment files.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { keccak256, stringToHex, toFunctionSelector } from "viem";
import { ROUTER_ABI } from "../integrations/commerce/chain.mjs";
import { passTypes, claimTypes } from "../integrations/commerce/signatures.mjs";
const root = path.resolve("integrations/commerce");
const source = fs.readFileSync(
  path.join(root, "studio/contracts/RevenueRouter.sol"),
  "utf8",
);
const compiled = JSON.parse(
  fs.readFileSync(
    ".local/commerce-foundry/out/RevenueRouter.sol/RevenueRouter.json",
    "utf8",
  ),
);
const metadata =
  typeof compiled.metadata === "string"
    ? JSON.parse(compiled.metadata)
    : compiled.metadata;
const sourceMeta = Object.entries(metadata.sources).find(([name]) =>
  name.endsWith("/RevenueRouter.sol"),
)?.[1];
if (sourceMeta?.keccak256 !== keccak256(stringToHex(source)))
  throw Error("SOURCE_DIFFERS_FROM_COMPILED_ARTIFACT");
for (const item of ROUTER_ABI.filter((i) => i.type === "function")) {
  const actual = compiled.abi.find(
    (i) => i.type === "function" && i.name === item.name,
  );
  if (!actual || toFunctionSelector(actual) !== toFunctionSelector(item))
    throw Error("ABI_MISMATCH_" + item.name);
}
for (const [name, types] of [
  ["PassPermit", passTypes],
  ["ClaimPermit", claimTypes],
]) {
  const signature = `${name}(${types[name].map((f) => `${f.type} ${f.name}`).join(",")})`;
  if (!source.includes('"' + signature + '"'))
    throw Error("SIGNATURE_MISMATCH_" + name);
}
const artifact = {
  schema: 1,
  contract: "RevenueRouter",
  studioApp: "7beefb8a-83bc-4c91-9055-a7190f08190e",
  studioSession: "chonks-commerce-g2",
  sourceSha256: createHash("sha256").update(source).digest("hex"),
  compiler: metadata.compiler,
  settings: {
    optimizer: metadata.settings.optimizer,
    evmVersion: metadata.settings.evmVersion,
    viaIR: !!metadata.settings.viaIR,
  },
  abi: compiled.abi,
  bytecode: compiled.bytecode.object,
  deployedBytecode: compiled.deployedBytecode.object,
  immutableReferences: compiled.deployedBytecode.immutableReferences,
  creationBytecodeHash: keccak256(compiled.bytecode.object),
  deployed: false,
};
fs.writeFileSync(
  path.join(root, "RevenueRouter.artifact.json"),
  JSON.stringify(artifact, null, 2) + "\n",
);
console.log(
  `PASS commerce source/ABI/typed-data match; ${artifact.sourceSha256}; artifact exported, no deployment.`,
);
