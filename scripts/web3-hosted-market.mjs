// Explicit owner command. No public signing or funding is performed on import.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { acceptanceOptions, runHostedBasic } from "./web3-hosted-basic.mjs";
import { createHostedMarketHooks } from "./market-hosted-acceptance.mjs";
export async function main(args = process.argv.slice(2)) {
  const options = acceptanceOptions(args);
  if (!options.mock && options.base !== "https://funcaster.onrender.com")
    throw Error(
      "This bounded acceptance is pinned to https://funcaster.onrender.com",
    );
  return runHostedBasic(
    { ...options, directorySuffix: "market" },
    createHostedMarketHooks(),
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(
      `STOPPED ${error.message}. Keep .local/hosted-basic*-market and its browser profiles; do not start fresh identities or share the private journal.`,
    );
    process.exitCode = 1;
  });
}
