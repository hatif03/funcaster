// Keyless, read-only named check. This command cannot prepare a signer or send.
import { loadProtocol, createReadClient } from "./runtime.mjs";
import { createChampionReader } from "./champion.mjs";
import { EnsError } from "./errors.mjs";
const args = process.argv.slice(2),
  option = (name) => args[args.indexOf(name) + 1];
if (!["--parent", "--registrar", "--rpc"].every((name) => args.includes(name)))
  throw Error(
    "Usage: node integrations/ens/champion-check.mjs --parent NAME.eth --registrar 0xADDRESS --rpc HTTPS_URL [--prepare]",
  );
try {
  const protocol = await loadProtocol();
  const reader = await createChampionReader({
    client: createReadClient(protocol, option("--rpc")),
    protocol,
    config: {
      ENS_PARENT: option("--parent"),
      ENS_REGISTRAR_ADDRESS: option("--registrar"),
    },
  });
  const result = args.includes("--prepare")
    ? await reader.prepareNamespace()
    : await reader.preflight();
  console.log(JSON.stringify(result, null, 2));
  if (result.ready === false) process.exitCode = 1;
} catch (error) {
  console.log(
    JSON.stringify({
      check: "ENS_CHAMPION_NAMESPACE",
      ready: false,
      code: error instanceof EnsError ? error.code : "RPC_UNAVAILABLE",
      message:
        error instanceof EnsError
          ? error.message
          : "Read-only check unavailable. No transaction was sent.",
    }),
  );
  process.exitCode = 1;
}
