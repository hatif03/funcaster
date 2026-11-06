// A new synthetic object: never refreshes the original seven-day retention cohort.
import fs from "node:fs/promises";
import { upload, repair, GATEWAY } from "./swarm-keeper.mjs";
const data = new TextEncoder().encode(
  "Funcaster G0 keeper recovery, synthetic fixture v1\n".repeat(32),
);
const reference = await upload(data);
const immediate = await repair({ reference, data });
let injected = false;
const recovered = await repair({ reference, data }, async (url, options) => {
  if (!injected && options.method !== "POST") {
    injected = true;
    return new Response("", { status: 404 });
  }
  return fetch(url, options);
});
const report = {
  at: new Date().toISOString(),
  scope:
    "LIVE GATEWAY upload/read/re-upload; one injected missing-read response",
  gateway: GATEWAY,
  bytes: data.length,
  immediate,
  recovered,
  injectedMissingRead: injected,
  paidStamp: false,
  claim:
    "Content-addressed; retrievable while the gateway retains it or a running console keeper restores it. No permanent-storage guarantee.",
  limits:
    "No stress test of the shared public gateway. 429/5xx stop without retries; retry only via the worker outbox.",
  originalRetentionCohortUnchanged: true,
};
await fs.writeFile(
  new URL("../../docs/web3/spikes/swarm-keeper.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
