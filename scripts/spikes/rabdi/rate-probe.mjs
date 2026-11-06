// Bounded anonymous-query measurement: at most 32 tiny queries, stop at first error.
import fs from "node:fs/promises";
import { eq } from "@arkiv-network/sdk/query";
import { publicClient, serial } from "./protocol.mjs";
import { Score } from "./final-schema.mjs";
const client = publicClient(),
  report = {
    at: new Date().toISOString(),
    scope: "PUBLIC READS ONLY; 32-query safety ceiling",
    rounds: [],
  };
const query = () =>
  client
    .select({ $key: true })
    .from(Score)
    .where(eq("run", "g0_rate_probe_not_dataset"))
    .limit(1)
    .fetch();
for (const concurrency of [1, 2, 4, 8]) {
  const start = performance.now();
  let successes = 0,
    failures = [];
  for (let offset = 0; offset < 8; offset += concurrency) {
    const results = await Promise.allSettled(
      Array.from({ length: concurrency }, query),
    );
    for (const r of results) {
      if (r.status === "fulfilled") successes++;
      else {
        let e = r.reason,
          status;
        for (let i = 0; e && i < 10; i++, e = e.cause) status ??= e.status;
        failures.push({
          name: r.reason.name,
          httpStatus: status ?? null,
          message: r.reason.shortMessage ?? "Query failed",
        });
      }
    }
    if (failures.length) break;
  }
  const elapsedMs = performance.now() - start;
  report.rounds.push({
    concurrency,
    successes,
    failures,
    elapsedMs,
    successfulQueriesPerSecond: (successes * 1000) / elapsedMs,
  });
  if (failures.length) break;
}
try {
  await client.select({ $key: true }).from(Score).limit(101).fetch();
} catch (e) {
  report.pageLimitError = {
    name: e.name,
    message: e.shortMessage ?? e.message,
  };
}
report.conclusion = report.rounds.some((r) =>
  r.failures.some((f) => f.httpStatus === 429),
)
  ? "Observed HTTP 429; back off and retain cached boards."
  : "No 429 observed within the safety ceiling. This is a measured lower bound, not a published provider rate limit.";
await fs.writeFile(
  new URL("../../../docs/web3/spikes/rabdi-rate.json", import.meta.url),
  serial(report),
);
console.log(serial(report));
