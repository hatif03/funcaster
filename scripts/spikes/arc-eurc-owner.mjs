import { runArcOwner } from "./arc-owner-probe.mjs";
await runArcOwner("EURC").catch((e) => {
  console.error(
    `EURC probe stopped: ${e.name}. Reconcile the journal before retrying.`,
  );
  process.exitCode = 1;
});
