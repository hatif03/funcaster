import { initializeStorage } from "../integrations/storage/postgres.mjs";

// Render terminates HTTPS. Relay and worker share PostgreSQL. This entrypoint
// does not enable signing; the worker retains its explicit activation flags.
const role = process.argv[2];
if (!["relay", "worker", "verifier"].includes(role))
  throw Error("Expected relay, worker or verifier");
process.env.WEB3_DATA_DIR ||= ".local/render";
if (role === "relay") {
  process.env.HTTP = "1";
  process.env.NO_OPEN = "1";
  process.env.PUBLIC_ORIGIN ||= process.env.RENDER_EXTERNAL_URL || "";
  if (!process.env.PUBLIC_ORIGIN.startsWith("https://") && process.env.RENDER)
    throw Error("HTTPS_PUBLIC_ORIGIN_REQUIRED");
}
let storage;
try {
  storage = await initializeStorage();
  await storage.store.acquire(`service:${role}`);
  if (role === "relay") await import("../server.js");
  else await import("./web3-worker.mjs");
} catch {
  await storage?.close();
  console.error(
    "Hosted startup failed; inspect configuration, database connectivity and exclusive service ownership. No credentials are logged.",
  );
  process.exitCode = 1;
}
